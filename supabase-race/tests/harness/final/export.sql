-- FINAL END-TO-END VALIDATION — part 4: what the system did, as one JSON document (compared against the independent model), and the audit checks.
\set ON_ERROR_STOP on
\set QUIET on
reset role;
create table race_final.export (doc jsonb not null);
insert into race_final.export
select jsonb_build_object(
  'config', (select jsonb_build_object('work_ms', work_ms, 'transition_ms', transition_ms, 'start_interval_ms', start_interval_ms, 'first_start_offset_ms', first_start_offset_ms) from race_events where id = race_final.ev()),
  'athletes', (select jsonb_agg(jsonb_build_object('n', substr(g.race_number, 2)::int, 'status', g.race_status, 'heat', h.number) order by g.race_number) from race_registrations g left join race_heats h on h.id = g.heat_id where g.event_id = race_final.ev()),
  'heats', (select jsonb_agg(jsonb_build_object('number', number, 'status', status, 'anchor', anchor_race_ms) order by number) from race_heats where event_id = race_final.ev()),
  'slots', (select jsonb_agg(jsonb_build_object('heat', h.number, 'slot', s.slot_index, 'status', s.status,
                'start_ms', (a.after ->> 'planned_start_ms')::bigint, 'started_ms', (a.after ->> 'engine_race_ms')::bigint) order by h.number, s.slot_index)
            from race_start_slots s join race_heats h on h.id = s.heat_id
            left join lateral (select x.after from (select jsonb_build_object('planned_start_ms', (l.after ->> 'planned_start_ms')::bigint, 'engine_race_ms', (l.after ->> 'engine_race_ms')::bigint) after, l.created_at
                                  from race_audit_log l where l.action = 'race.athlete.start' and l.target_id = s.id order by l.created_at limit 1) x) a on true
           where s.event_id = race_final.ev()),
  'windows', (select jsonb_agg(jsonb_build_object('n', r.n, 'station', r.station, 'slot', r.slot_index, 'start', r.ws, 'end', r.we, 'status', r.status, 'locked_ms', case when r.status in ('LOCKED', 'CORRECTED') then r.we + (select transition_ms from race_events where id = race_final.ev()) end) order by r.n, r.station) from race_final.res r),
  'results', (select jsonb_agg(jsonb_build_object('n', r.n, 'station', r.station, 'score', sr.official_score, 'technique', sr.technique_score, 'status', sr.status, 'evidence_state', race_evidence_state(sr.id)) order by r.n, r.station)
                from race_final.res r join race_station_results sr on sr.id = r.result_id),
  'act_log', (select jsonb_agg(jsonb_build_object('seq', seq, 'cid', cid, 'n', n, 'station', station, 'type', type, 'value', value, 'voids', voids, 'origin', origin, 'device', device, 'arrival', arrival, 'sys_status', sys_status, 'sys_code', sys_code) order by seq) from race_final.act_log),
  'script_log', (select coalesce(jsonb_agg(jsonb_build_object('action', action, 'n', n, 'at', at_ms)), '[]') from race_final.script_log),
  'review_log', (select coalesce(jsonb_agg(jsonb_build_object('cid', cid, 'decision', decision)), '[]') from race_final.review_log),
  'ocr_log', (select coalesce(jsonb_agg(jsonb_build_object('seq', seq, 'n', n, 'step', step, 'cid', cid, 'distance', distance, 'conf', conf, 'ack', ack, 'decision', decision, 'device', device, 'arrival', arrival, 'sys_result', sys_result) order by seq), '[]') from race_final.ocr_log),
  'corrections_log', (select coalesce(jsonb_agg(jsonb_build_object('n', n, 'station', station, 'field', field, 'value', value)), '[]') from race_final.corrections_log),
  'rowing_corrections_log', (select coalesce(jsonb_agg(jsonb_build_object('n', n, 'distance', distance)), '[]') from race_final.rowing_corrections_log),
  'ledger', (select jsonb_agg(jsonb_build_object('n', r.n, 'station', r.station, 'id', e.client_event_id, 'type', e.type, 'value', e.value, 'status', e.status, 'server_ms', e.server_race_ms,
                'voids', (select v.client_event_id from race_performance_events v where v.id = e.voids_event_id), 'review', rv.decision) order by e.server_received_at, e.id)
              from race_performance_events e join race_final.res r on r.result_id = e.station_result_id left join race_action_reviews rv on rv.performance_event_id = e.id),
  'rankings', (select jsonb_object_agg(code, rows) from (
      select c.code::text code, jsonb_agg(jsonb_build_object('n', substr(g.race_number, 2)::int, 'rank', k.overall_rank, 'total', k.total_points,
              'placements', (select jsonb_object_agg(key::int, value::int) from jsonb_each_text(k.station_placements))) order by k.overall_rank, g.race_number) rows
        from race_rankings k join race_registrations g on g.id = k.registration_id join race_categories c on c.id = k.category_id
       where k.event_id = race_final.ev() and k.is_official and k.version = (select max(version) from race_rankings k2 where k2.category_id = k.category_id and k2.is_official)
       group by c.code) z)
);
-- hold the file where the shell can read it
\o :exportfile
select doc from race_final.export;
\o
