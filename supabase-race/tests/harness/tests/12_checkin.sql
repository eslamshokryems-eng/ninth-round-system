-- Phase 5: check-in, per-heat order, late athletes, tie draws, queue.
reset role;

-- Event: paid (500), 15 athletes. Heat 1 = ci1..ci9, heat 2 = ci10, ci11 (unpaid), ci13..ci15. ci12 has no heat.
select race_test.login('bm_a');
select race_test.put('ev_ci', race_create_event('checkin-2026', date '2026-12-20', 'THE NINTH', 'Africa/Cairo', now() + interval '2 days'));
update race_events set registration_fee = 500 where id = race_test.id('ev_ci');
select race_set_event_status(race_test.id('ev_ci'), 'REGISTRATION_OPEN');
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_ci'), race_test.id('rec'), 'RECEPTION'), (race_test.id('ev_ci'), race_test.id('master'), 'MASTER_CONTROL');
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_ci'), race_test.id('judge1'), 'JUDGE', id from race_stations where event_id = race_test.id('ev_ci') and number = 1;
select race_test.anon();
do $$ begin for i in 1..15 loop perform race_test.keep('ci' || i, race_test.id('ev_ci'), 'CI Athlete ' || i, '0155' || lpad(i::text, 7, '0'), 'male', '1990-01-01', 'MEN'); end loop; end $$;
select race_test.login('bm_a');
insert into race_heats (event_id, number) values (race_test.id('ev_ci'), 1), (race_test.id('ev_ci'), 2);
select race_test.put('ci_h1', (select id from race_heats where event_id = race_test.id('ev_ci') and number = 1));
select race_test.put('ci_h2', (select id from race_heats where event_id = race_test.id('ev_ci') and number = 2));
do $$ declare i int; begin
  for i in 1..9 loop perform race_move_athlete_heat(race_test.rid('ci' || i), race_test.id('ci_h1')); end loop;
  foreach i in array array[10, 11, 13, 14, 15] loop perform race_move_athlete_heat(race_test.rid('ci' || i), race_test.id('ci_h2')); end loop;
  foreach i in array array[1,2,3,4,5,6,7,8,9,10,12,13,14,15] loop perform race_waive_payment(race_test.rid('ci' || i), 'sponsored'); end loop;
end $$;

-- Check-in closed until heats are locked -----------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select * from race_check_in(race_test.rid('ci1'))$$, 'RACE_CHECKIN_NOT_OPEN', 'check-in: closed before heats are locked');
select race_test.login('bm_a');
select race_lock_heats(race_test.id('ev_ci'));

-- Who may check in ---------------------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select * from race_check_in(race_test.rid('ci1'))$$, 'permission denied', 'check-in: anon has no EXECUTE');
select race_test.login('judge1');
select race_test.throws($$select * from race_check_in(race_test.rid('ci1'))$$, 'RACE_FORBIDDEN', 'check-in: a judge cannot check athletes in');
select race_test.login('master');
select race_test.throws($$select * from race_check_in(race_test.rid('ci1'))$$, 'RACE_FORBIDDEN', 'check-in: master control cannot check athletes in (reception does)');
select race_test.login('nobody');
select race_test.throws($$select * from race_check_in(race_test.rid('ci1'))$$, 'RACE_FORBIDDEN', 'check-in: a stranger cannot');
select race_test.login('bm_b');
select race_test.throws($$select * from race_check_in(race_test.rid('ci1'))$$, 'RACE_FORBIDDEN', 'check-in: another event''s manager cannot');
select race_test.ok((select pronargs = 1 from pg_proc where proname = 'race_check_in'),
  'check-in: the RPC takes ONLY a registration id — Reception cannot supply a position, time or order');
select race_test.throws($$insert into race_check_ins (event_id, registration_id, heat_id, checked_in_by, kind) values (race_test.id('ev_ci'), race_test.rid('ci1'), race_test.id('ci_h1'), auth.uid(), 'ON_TIME')$$,
  'permission denied', 'check-in: no direct table writes (cannot forge an order)');

-- Eligibility --------------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select * from race_check_in(race_test.rid('ci12'))$$, 'RACE_NO_HEAT', 'eligibility: no heat → refused');
select race_test.throws($$select * from race_check_in(race_test.rid('ci11'))$$, 'RACE_NOT_CONFIRMED', 'eligibility: unpaid athlete → refused until payment is confirmed');
select race_test.throws($$select * from race_check_in(gen_random_uuid())$$, 'RACE_NOT_FOUND', 'eligibility: unknown registration');

-- Happy path + order ---------------------------------------------------------------------------------------
select race_test.ok((select kind = 'ON_TIME' and queue_position = 1 and heat_number = 1 and not already_checked_in
                            and abs(extract(epoch from checked_in_at - clock_timestamp())) < 60
                     from race_check_in(race_test.rid('ci1'))), 'check-in: N001 → ON_TIME, position 1 in heat 1, server timestamp');
select race_test.ok((select race_status = 'CHECKED_IN' from race_registrations where id = race_test.rid('ci1'))
                    and (select checked_in_by = race_test.id('rec') from race_check_ins where registration_id = race_test.rid('ci1')),
  'check-in: registration becomes CHECKED_IN, recorded against the reception user');
select race_test.ok((select already_checked_in and queue_position = 1 and check_in_id = (select id from race_check_ins where registration_id = race_test.rid('ci1'))
                     from race_check_in(race_test.rid('ci1'))), 'check-in: a second click reports the original check-in (already_checked_in) and changes nothing');
select race_test.eq((select count(*) from race_check_ins where registration_id = race_test.rid('ci1'))::int, 1, 'check-in: still exactly one row');
select race_test.eq((select queue_position from race_check_in(race_test.rid('ci2'))), 2, 'check-in: second arrival → position 2');
select race_test.eq((select queue_position from race_check_in(race_test.rid('ci3'))), 3, 'check-in: third arrival → position 3');
select race_test.eq((select queue_position from race_check_in(race_test.rid('ci9'))), 4, 'order: race number N009 arriving 4th is position 4 — order is arrival, not registration');
select race_test.eq((select queue_position from race_check_in(race_test.rid('ci10'))), 1, 'order: heat 2 is ordered independently — its first arrival is position 1');
reset role;
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.checkin' and "after" ->> 'race_number' = 'N001' and metadata ->> 'event_id' = race_test.id('ev_ci')::text),
  'audit: check-in is audited with race number, heat and time');
select race_test.login('rec');
select race_test.eq(race_test.count($$select 1 from race_audit_log$$), 0::bigint, 'audit: reception cannot read the audit log');

-- Late athletes ------------------------------------------------------------------------------------------------
select race_test.login('bm_a');
update race_events set planned_start_at = now() - interval '1 hour' where id = race_test.id('ev_ci');
select race_test.login('rec');
select race_test.ok((select kind = 'LATE' and queue_position = 5 from race_check_in(race_test.rid('ci4'))), 'late: arriving after the check-in deadline → LATE, placed at the END of the queue (position 5)');
select race_test.ok((select race_status = 'LATE_CHECK_IN' from race_registrations where id = race_test.rid('ci4')), 'late: registration becomes LATE_CHECK_IN (never cancelled)');
reset role;
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.checkin.late' and "after" ->> 'race_number' = 'N004'), 'audit: late check-in is audited separately');
select race_test.login('rec');
select race_test.ok((select array_agg(race_number order by queue_position) from race_queue(race_test.id('ev_ci'), 1)) = array['N001', 'N002', 'N003', 'N009', 'N004'],
  'late: nobody already in the queue moved (N001 N002 N003 N009 then late N004)');
select race_test.login('bm_a');
update race_events set planned_start_at = timestamptz '2026-12-20 07:00:00+00' where id = race_test.id('ev_ci');

-- Queue ---------------------------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.ok((select array_agg(projected_slot_index order by queue_position)::int[] from race_queue(race_test.id('ev_ci'), 1)) = array[0, 1, 2, 3, 4]::int[],
  'queue: before slots exist each athlete projects to slot position−1');
select race_test.ok((select projected_start_ms = 60000 and projected_start_at = timestamptz '2026-12-20 07:01:00+00' from race_queue(race_test.id('ev_ci'), 1) where race_number = 'N001'),
  'queue: N001 projected 0:01:00 race time = 07:01:00 wall (planned 07:00 + 0:01:00)');
select race_test.ok((select projected_start_ms = 60000 + 4 * 210000 and projected_start_at = timestamptz '2026-12-20 07:15:00+00' from race_queue(race_test.id('ev_ci'), 1) where race_number = 'N004'),
  'queue: 5th in heat 1 projects to 0:15:00 (slot 4 × 3:30)');
select race_test.ok((select projected_start_ms = 2340000 and heat_number = 2 from race_queue(race_test.id('ev_ci'), 2) where race_number = 'N010'),
  'queue: heat 2 starts 0:39:00 (last start of a FULL heat 1 = +28:00, then +10:00 gap)');
select race_test.eq(race_test.count($$select 1 from race_queue(race_test.id('ev_ci'))$$), 6::bigint, 'queue: all checked-in athletes across heats (5 + 1)');
select race_test.ok((select bool_and(not no_slot_available) from race_queue(race_test.id('ev_ci'))), 'queue: nobody flagged without a slot');
select race_test.login('master');
select race_test.eq(race_test.count($$select 1 from race_queue(race_test.id('ev_ci'), 1)$$), 5::bigint, 'queue: master control can see the queue');
select race_test.login('judge1');
select race_test.throws($$select * from race_queue(race_test.id('ev_ci'))$$, 'RACE_FORBIDDEN', 'queue: a judge cannot see the queue');
select race_test.anon();
select race_test.throws($$select * from race_queue(race_test.id('ev_ci'))$$, 'permission denied', 'queue: anon cannot');

-- Tie draws (equal timestamps only arise from bulk imports; forced here as the table owner) ------------------------------
reset role;
alter table race_check_ins disable trigger trg_race_check_ins_server_time;
insert into race_check_ins (event_id, registration_id, heat_id, checked_in_at, checked_in_by, kind)
select race_test.id('ev_ci'), race_test.rid('ci' || i), race_test.id('ci_h1'), t, race_test.id('rec'), 'ON_TIME'
from (values (5, timestamptz '2026-12-19 10:00:00+00'), (6, timestamptz '2026-12-19 10:00:00+00'), (7, timestamptz '2026-12-19 10:00:01+00')) v(i, t);
alter table race_check_ins enable trigger trg_race_check_ins_server_time;
update race_registrations set race_status = 'CHECKED_IN' where id in (race_test.rid('ci5'), race_test.rid('ci6'), race_test.rid('ci7'));

select race_test.eq(race_resolve_check_in_ties(race_test.id('ci_h1')), 1, 'tie: exactly one draw for the one tied pair');
select race_test.ok((select cardinality(participants) = 2 and participants @> array[race_test.rid('ci5'), race_test.rid('ci6')] and not participants @> array[race_test.rid('ci7')]
                     from race_tie_draws where heat_id = race_test.id('ci_h1')),
  'tie: the draw is among ONLY the two tied athletes (the athlete one second later is not in it)');
select race_test.ok((select array_agg(tie_draw_position::int order by tie_draw_position) = array[1, 2]
                     from race_check_ins where heat_id = race_test.id('ci_h1') and tie_draw_id is not null)
                    and (select tie_draw_id is null and tie_draw_position is null from race_check_ins where registration_id = race_test.rid('ci7')),
  'tie: the two tied athletes carry positions 1 and 2; the untied athlete carries none');
select race_test.ok((select participants = (select array_agg(x order by md5(encode(seed, 'hex') || x::text)) from unnest(participants) x)
                     from race_tie_draws where heat_id = race_test.id('ci_h1')),
  'tie: the recorded order is reproducible from the recorded seed (sort by md5(seed || id))');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.checkin.random_draw' and "after" ? 'seed'
                            and jsonb_array_length("after" -> 'participants_in_order') = 2 and metadata ->> 'event_id' = race_test.id('ev_ci')::text),
  'audit: the random draw is logged with its seed and the resulting order');
select race_test.eq(race_resolve_check_in_ties(race_test.id('ci_h1')), 0, 'tie: resolving again draws nothing (idempotent)');

select race_test.login('rec');
select race_test.ok((select array_agg(q.race_number order by q.queue_position) filter (where q.race_number in ('N005', 'N006'))
                          = (select array_agg(r.race_number order by p.ord)
                             from race_tie_draws d, unnest(d.participants) with ordinality p(rid, ord)
                             join race_registrations r on r.id = p.rid where d.heat_id = race_test.id('ci_h1'))
                     from race_queue(race_test.id('ev_ci'), 1) q),
  'tie: the queue orders the tied pair exactly as the draw did');
select race_test.ok((select (array_agg(q.race_number order by q.queue_position) filter (where q.race_number in ('N005', 'N006', 'N007')))[3] = 'N007'
                     from race_queue(race_test.id('ev_ci'), 1) q),
  'tie: the athlete one second later sorts after both tied athletes');
reset role;
select race_test.throws($$update race_check_ins set tie_draw_position = 2 where registration_id = race_test.rid('ci5')$$, 'RACE_APPEND_ONLY', 'tie: a recorded draw result cannot be changed');
select race_test.throws($$update race_check_ins set kind = 'LATE' where registration_id = race_test.rid('ci7')$$, 'RACE_APPEND_ONLY', 'tie: no other column of a check-in can ever change');
select race_test.throws(format($$update race_check_ins set tie_draw_id = %L, tie_draw_position = 1 where registration_id = %L$$,
                               (select id from race_tie_draws where heat_id = race_test.id('ci_h1')), race_test.rid('ci7')),
  'does not match', 'tie: a draw result cannot be attached to an athlete who was not in the draw');
select race_test.throws($$delete from race_check_ins where registration_id = race_test.rid('ci7')$$, 'RACE_APPEND_ONLY', 'tie: check-ins can never be deleted');

-- Three-way tie in heat 2 ----------------------------------------------------------------------------------------------------------
alter table race_check_ins disable trigger trg_race_check_ins_server_time;
insert into race_check_ins (event_id, registration_id, heat_id, checked_in_at, checked_in_by, kind)
select race_test.id('ev_ci'), race_test.rid('ci' || i), race_test.id('ci_h2'), timestamptz '2026-12-19 11:00:00+00', race_test.id('rec'), 'ON_TIME' from unnest(array[13, 14, 15]) i;
alter table race_check_ins enable trigger trg_race_check_ins_server_time;
select race_test.eq(race_resolve_check_in_ties(race_test.id('ci_h2')), 1, 'tie: a three-way tie is one draw');
select race_test.ok((select array_agg(tie_draw_position::int order by tie_draw_position) = array[1, 2, 3] from race_check_ins where heat_id = race_test.id('ci_h2') and tie_draw_id is not null),
  'tie: positions 1, 2, 3 assigned, each exactly once');
select race_test.ok((select tie_draw_id is null from race_check_ins where registration_id = race_test.rid('ci10')), 'tie: the earlier untied athlete of that heat is untouched');
select race_test.login('rec');
select race_test.ok((select array_agg(q.race_number order by q.queue_position) from race_queue(race_test.id('ev_ci'), 2) q)
                    = array['N010'] || (select array_agg(r.race_number order by p.ord)
                                        from race_tie_draws d, unnest(d.participants) with ordinality p(rid, ord)
                                        join race_registrations r on r.id = p.rid where d.heat_id = race_test.id('ci_h2')),
  'tie: heat 2 order = N010 first (real time), then the three drawn athletes in draw order');
reset role;
