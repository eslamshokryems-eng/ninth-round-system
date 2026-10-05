-- FINAL END-TO-END VALIDATION — part 3: after the race — completion, Event Manager corrections, rankings, official publication, and a post-publication correction.
\set ON_ERROR_STOP on
\set QUIET on
reset role;

-- completion ---------------------------------------------------------------------------------------------------------------------------------------
select race_final.chk('completion: the event FINISHED by itself', (select status = 'FINISHED' from race_events where id = race_final.ev()));
select race_final.chk('completion: heat 5 was closed without start (CANCELLED) and did not block completion',
  (select status = 'CANCELLED' from race_heats where event_id = race_final.ev() and number = 5) and (select finished_at is not null from race_clock where event_id = race_final.ev()));
select race_final.chk('completion: nothing is left to do — every planned action, review and scripted event ran',
  (select count(*) = 0 from race_final.act where not done and eff_ms is not null) and (select count(*) = 0 from race_final.review_due where not done) and (select count(*) = 0 from race_final.script where not done)
  and (select count(*) = 0 from race_final.act a where not a.done and a.abs_ms is null and not exists (select 1 from race_final.res r where r.n = a.n and r.station = a.station and r.status in ('VOID_DNS', 'NOT_REACHED'))
       and a.n not in (select n from race_final.script_log)),
  (select count(*)::text from race_final.act a where not a.done and a.abs_ms is null and not exists (select 1 from race_final.res r where r.n = a.n and r.station = a.station and r.status in ('VOID_DNS', 'NOT_REACHED'))));
select race_final.chk('completion: no result is still SCHEDULED / ACTIVE / SCORING', (select count(*) = 0 from race_station_results where event_id = race_final.ev() and status in ('SCHEDULED', 'ACTIVE', 'SCORING')));
select race_final.chk('completion only after every required window is complete: the official finish = the last 3:00 + 0:30 of the last athlete',
  (select abs((a.after ->> 'status' = 'FINISHED')::int * ((a.metadata ->> 'engine_race_ms')::bigint) - (select max(window_end_race_ms) + 30000 from race_station_results where event_id = race_final.ev() and status not in ('VOID_DNS', 'NOT_REACHED'))) <= 1000
     from race_audit_log a where a.action = 'race.event.finish' and a.metadata ->> 'event_id' = race_final.ev()::text));

select race_final.chk('driver: no judge action failed for a technical reason (only rule-based rejections are allowed)',
  (select count(*) = 0 from race_final.act_log where sys_status = 'ERROR'), (select string_agg(distinct sys_code, ' | ') from race_final.act_log where sys_status = 'ERROR'));

-- the Event Manager corrects two ordinary results (reason mandatory) ---------------------------------------------------------------------------------
do $$
declare c jsonb; rid uuid; cn int;
begin
  for c in select * from jsonb_array_elements(race_final.p() -> 'corrections') loop
    -- the live race decides who is skipped / withdraws: if the planned athlete did not get that station, the next finisher takes the correction
    select result_id, n into rid, cn from race_final.res
     where station = (c ->> 'station')::int and status = 'LOCKED' and n >= (c ->> 'n')::int order by (n = (c ->> 'n')::int) desc, n limit 1;
    perform race_final.as_user('f_bm');
    perform race_correct_station_result(rid, c ->> 'field', (c ->> 'value')::numeric, 'final validation: judge miscount found on video review');
    perform race_final.back();
    insert into race_final.corrections_log values (cn, (c ->> 'station')::int, c ->> 'field', (c ->> 'value')::numeric);
  end loop;
end $$;

-- rankings: provisional first, then official -------------------------------------------------------------------------------------------------------------
select race_final.as_user('f_master');
select race_final.chk('rankings: Master Control saves a provisional snapshot for every category', (select jsonb_array_length(r -> 'categories') = 3 from (select race_compute_rankings(race_final.ev()) r) q));
select race_final.back();
select race_final.as_user('f_bm');
select race_final.chk('publication: the Event Manager publishes the official results', (select r ->> 'status' = 'RESULTS_OFFICIAL' from (select race_publish_results(race_final.ev()) r) q));
select race_final.back();
-- a correction AFTER publication (rowing): evidence-cited, Event Manager only, new official snapshot version
do $$
declare rid uuid; pn int := (race_final.p() -> 'postPublication' ->> 'n')::int; pd int := (race_final.p() -> 'postPublication' ->> 'distance')::int; j jsonb;
begin
  select r.result_id, r.n into rid, pn from race_final.res r where r.station = 9 and r.status in ('LOCKED', 'CORRECTED') and r.n >= pn order by (r.n = pn) desc, r.n limit 1;
  perform race_final.as_user('f_master');
  begin
    perform race_correct_rowing_result(rid, pd, 'x');
    raise exception 'FINAL VALIDATION FAIL: Master Control corrected a rowing result after publication';
  exception when others then
    if sqlerrm not like '%RACE_FORBIDDEN%' then raise; end if;
  end;
  perform race_final.back();
  perform race_final.as_user('f_bm');
  j := race_correct_rowing_result(rid, pd, 'final validation: post-publication re-read of the display photo');
  perform race_final.back();
  insert into race_final.rowing_corrections_log values (pn, pd, 'post');
  perform race_final.chk('post-publication correction: only the Event Manager can; it writes a new OFFICIAL snapshot version', (j -> 'snapshot' ->> 'official') = 'true');
end $$;
select race_final.chk('post-publication: older snapshot versions are untouched (append-only history)', (select count(distinct version) >= 2 from race_rankings where event_id = race_final.ev() and is_official));
reset role;
