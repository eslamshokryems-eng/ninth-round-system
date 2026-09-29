-- Phase 6: full-event simulation. 50 athletes, 6 heats (9,9,9,9,9,5). The engine runs from START EVENT to the finish in
-- 5-second race-time steps; the simulator's timing invariants (no station overlap, windows == model, statuses agree with
-- race time) are checked after EVERY tick. Scripted chaos:
--   #5 never arrives (DNS)            #14 arrives late, mid-heat-2 (takes the next free slot)
--   #27 is skipped at the start line  #30 withdraws mid-race (DNF)
--   #48 and #49 arrive after heat 6's planned slots are gone (one overflow slot → #48 races, #49 has NO SLOT)
--   emergency pauses at 20:00 (2:00 long) and 65:00 (5:00 long)
reset role;
select race_test.mkevent('ev_s', 'simulation-2026', 50);
insert into race_heats (event_id, number) select race_test.id('ev_s'), n from generate_series(1, 6) n;
do $$
declare i int; h int;
begin
  for i in 1..50 loop
    h := case when i <= 45 then (i - 1) / 9 + 1 else 6 end;
    perform race_move_athlete_heat(race_test.rid('ev_s' || i), (select id from race_heats where event_id = race_test.id('ev_s') and number = h));
  end loop;
end $$;
select race_lock_heats(race_test.id('ev_s'));
reset role;
create function race_test.sn(p_i int) returns uuid language sql stable as $$ select race_test.rid('ev_s' || p_i) $$;

-- Pre-race arrivals: everybody except #5, #14 (late), #48, #49 (late). Staff (Event Manager) are the actor throughout.
select race_test.login('bm_a');
do $$ declare i int; begin
  for i in 1..50 loop
    if i not in (5, 14, 48, 49) then perform race_check_in(race_test.sn(i)); end if;
  end loop;
end $$;
select race_test.eq((select count(*) from race_check_ins where event_id = race_test.id('ev_s'))::int, 46, 'sim setup: 46 athletes checked in before the start');
select race_start_event(race_test.id('ev_s'));
reset role;

insert into race_sim.script (event_id, at_ms, action, arg) values
  (race_test.id('ev_s'), 1200000, 'pause', '120000'),
  (race_test.id('ev_s'), 2970000, 'check_in', race_test.sn(14)::text),
  (race_test.id('ev_s'), 3900000, 'pause', '300000'),
  (race_test.id('ev_s'), 6250000, 'skip', race_test.sn(27)::text),
  (race_test.id('ev_s'), 7920000, 'dnf', race_test.sn(30)::text),
  (race_test.id('ev_s'), 12250000, 'check_in', race_test.sn(48)::text),
  (race_test.id('ev_s'), 12255000, 'check_in', race_test.sn(49)::text);

select race_test.ok((select array_agg(anchor_race_ms order by number) = array[60000, 2340000, 4620000, 6900000, 9180000, 11460000]::bigint[]
                            and array_agg(planned_slot_count order by number) = array[9, 9, 9, 9, 9, 5]::smallint[] from race_heats where event_id = race_test.id('ev_s')),
  'sim: anchors 0:01:00, 0:39:00, 1:17:00, 1:55:00, 2:33:00, 3:11:00 (each heat starts 10:00 after the previous heat''s last athlete)');

-- Run to 12:30:00 of race time (just before heat 6's overflow slot) and look at the reception queue ---------------------------------------------------
create temp table sim_run1 as select * from race_sim.run(race_test.id('ev_s'), race_test.id('bm_a'), 12300000, 5000);
select race_test.ok((select ticks >= 2400 and actions = 7 and final_race_ms between 12300000 and 12301000 from sim_run1), 'sim: 2,400+ engine ticks to 3:25:00, all invariants held at every tick, all seven scripted events fired');
select race_test.login('rec');
select race_test.ok((select no_slot_available and projected_slot_index is null from race_queue(race_test.id('ev_s'), 6) where race_number = (select race_number from race_registrations where id = race_test.sn(49))),
  'sim: reception sees #49 flagged NO SLOT AVAILABLE — #48 has the only overflow slot');
select race_test.ok((select projected_slot_index = 5 and not no_slot_available from race_queue(race_test.id('ev_s'), 6) where race_number = (select race_number from race_registrations where id = race_test.sn(48))), 'sim: #48 is projected into the overflow slot');
reset role;

create temp table sim_run2 as select * from race_sim.run(race_test.id('ev_s'), race_test.id('bm_a'), 14500000, 5000);
select race_test.ok((select actions = 0 and ticks > 400 from sim_run2), 'sim: the rest of the event ran with nothing left to script — 400+ more ticks, invariants held');
select race_test.ok((select status = 'FINISHED' from race_events where id = race_test.id('ev_s')) and (select finished_at is not null from race_clock where event_id = race_test.id('ev_s')), 'sim: the event FINISHED by itself');
select race_test.ok((select (after ->> 'status') = 'FINISHED' and (metadata ->> 'engine_race_ms')::bigint between 14400000 and 14410000 from race_audit_log where action = 'race.event.finish' and metadata ->> 'event_id' = race_test.id('ev_s')::text),
  'sim: it finished at 4:00:00 race time (last start 3:28:30 + 31:00 + the closing 0:30) — no later');

-- Outcomes ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(*) from race_start_slots where event_id = race_test.id('ev_s') and status = 'STARTED')::int, 47, 'outcome: 47 athletes started');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_s') and race_status = 'FINISHED')::int, 46, 'outcome: 46 finished');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_s') and race_status = 'DNF')::int, 1, 'outcome: 1 DNF (#30)');
select race_test.ok((select array_agg(right(race_number, 3) order by race_number) = array['005', '027', '049'] from race_registrations where event_id = race_test.id('ev_s') and race_status = 'MISSED_START'),
  'outcome: exactly #5, #27 and #49 are DNS');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_s') and race_status not in ('FINISHED', 'DNF', 'MISSED_START'))::int, 0, 'outcome: nobody is left in limbo');
select race_test.ok((select array_agg(s order by s) = array['EMPTY:3', 'SKIPPED:1', 'STARTED:47'] from (select status || ':' || count(*) s from race_start_slots where event_id = race_test.id('ev_s') group by status) q),
  'outcome: 51 slots = 47 started + 1 skipped + 3 burned empty (heat 1 slot 9, heat 6 slots 4–5) — none left OPEN or BOUND');
select race_test.eq((select count(*) from race_start_slots where event_id = race_test.id('ev_s') and is_overflow)::int, 1, 'outcome: exactly one overflow slot in the whole event');
select race_test.ok((select slot_index = 5 and is_overflow and status = 'STARTED' from race_start_slots where registration_id = race_test.sn(48)), 'outcome: #48 raced in heat 6''s overflow slot');
select race_test.eq((select count(*) from race_start_slots where registration_id = race_test.sn(49))::int, 0, 'outcome: #49 never held a slot');
select race_test.ok((select slot_index = 8 and status = 'STARTED' and not is_overflow from race_start_slots where registration_id = race_test.sn(14)), 'outcome: late #14 took heat 2''s last planned slot and raced');
select race_test.ok((select status = 'SKIPPED' from race_start_slots where registration_id = race_test.sn(27)) and (select count(*) = 0 from race_station_results where registration_id = race_test.sn(27)), 'outcome: skipped #27 — empty slot, no results');
select race_test.eq((select count(*) from race_station_results where event_id = race_test.id('ev_s') and status = 'LOCKED')::int, 46 * 9 + 3, 'outcome: 46 × 9 results + the 3 stations #30 reached are LOCKED');
select race_test.eq((select count(*) from race_station_results where event_id = race_test.id('ev_s') and status = 'VOID_DNS')::int, 6, 'outcome: the 6 stations #30 never reached are void');
select race_test.eq((select count(*) from race_station_results where event_id = race_test.id('ev_s') and status not in ('LOCKED', 'VOID_DNS'))::int, 0, 'outcome: nothing is left open');

-- Timing accuracy -----------------------------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(distinct (after -> 'registration_id')) from race_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_s')::text)::int, 47, 'timing: 47 start audit rows, one per athlete — nobody started twice');
select race_test.ok((select bool_and((after ->> 'lag_ms')::bigint between 0 and 5100) and count(*) = 47 from race_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_s')::text),
  'timing: every athlete was started within one tick (≤ 5 s here; ≤ ~1 s live) of their planned second');
select race_test.ok((select bool_and((after ->> 'planned_start_ms')::bigint = h.anchor_race_ms + sl.slot_index::bigint * 210000)
                     from race_audit_log a join race_start_slots sl on sl.id = a.target_id join race_heats h on h.id = sl.heat_id
                    where a.action = 'race.athlete.start' and a.metadata ->> 'event_id' = race_test.id('ev_s')::text), 'timing: planned start = heat anchor + slot × 3:30 for all 47 — no skip, DNS or late arrival moved anyone');
select race_test.ok((select bool_and(sr.window_start_race_ms = h.anchor_race_ms + sl.slot_index::bigint * 210000 + (st.number - 1) * 210000 and sr.window_end_race_ms - sr.window_start_race_ms = 180000)
                     from race_station_results sr join race_start_slots sl on sl.id = sr.slot_id join race_heats h on h.id = sl.heat_id join race_stations st on st.id = sr.station_id
                    where sr.event_id = race_test.id('ev_s') and sr.status <> 'VOID_DNS'), 'timing: every one of the 423 windows is exactly slot start + (station − 1) × 3:30, 3:00 long');
select race_test.ok((select count(*) = 46 * 9 + 3 and count(distinct (station_id, window_start_race_ms)) = count(*) from race_station_results where event_id = race_test.id('ev_s') and status <> 'VOID_DNS'),
  'timing: no two athletes ever share a station window');
select race_test.ok((select array_agg(right(r.race_number, 3) order by s.slot_index) = array['001', '002', '003', '004', '006', '007', '008', '009']
                     from race_start_slots s join race_registrations r on r.id = s.registration_id join race_heats h on h.id = s.heat_id where h.event_id = race_test.id('ev_s') and h.number = 1 and s.status = 'STARTED'),
  'order: heat 1 started in check-in order (#5 absent — nobody moved forward into slot 5, everyone behind kept their slot)');
select race_test.eq((select count(*) from race_start_slots s1 join race_start_slots s2 on s1.heat_id = s2.heat_id and s1.slot_index < s2.slot_index
                       join race_check_ins c1 on c1.registration_id = s1.registration_id and c1.voided_by_correction_id is null
                       join race_check_ins c2 on c2.registration_id = s2.registration_id and c2.voided_by_correction_id is null
                      where s1.event_id = race_test.id('ev_s') and (c1.checked_in_at, coalesce(c1.tie_draw_position, 0)) > (c2.checked_in_at, coalesce(c2.tie_draw_position, 0)))::int,
                    0, 'order: in every heat, start order == check-in order (0 inversions)');

-- Pauses --------------------------------------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(*) from race_pauses where event_id = race_test.id('ev_s') and resumed_at is not null)::int, 2, 'pause: two pauses, both closed');
select race_test.ok((select array_agg(paused_race_ms between 1200000 and 1206000 or paused_race_ms between 3900000 and 3906000 order by paused_at) = array[true, true] from race_pauses where event_id = race_test.id('ev_s')), 'pause: they froze race time at 20:00 and 65:00');
select race_test.ok((select paused_total_ms between 420000 and 421500 from race_clock where event_id = race_test.id('ev_s')), 'pause: 7:00 of pause in total (2:00 + 5:00) was subtracted from the race clock — the schedule did not move');
select race_test.ok((select started_at + (interval '1 millisecond' * (14400000 + paused_total_ms)) between clock_timestamp() - interval '1 hour' and clock_timestamp() + interval '1 hour' from race_clock where event_id = race_test.id('ev_s')), 'pause: wall-clock time consistent with race time + pauses (simulated hours compressed into one test)');

-- Audit ------------------------------------------------------------------------------------------------------------------------------------------------------
select race_test.ok((select array_agg(a || ':' || n order by a) = (select array_agg(x order by split_part(x, ':', 1)) from unnest(array['race.athlete.dnf:1', 'race.athlete.finish:46', 'race.athlete.skip:1', 'race.athlete.start:47', 'race.event.finish:1', 'race.event.pause:2',
                                                                       'race.event.resume:2', 'race.event.start:1', 'race.heat.finish:6', 'race.registration.missed_start:2', 'race.station.lock:417', 'race.station.performance_locked:417', 'race.station.start:417', 'race.checkin:46', 'race.checkin.late:3', 'race.slot.bind:48', 'race.slot.overflow_created:1']) x)
                     from (select action a, count(*) n from race_audit_log where metadata ->> 'event_id' = race_test.id('ev_s')::text
                              and action in ('race.athlete.dnf', 'race.athlete.finish', 'race.athlete.skip', 'race.athlete.start', 'race.event.finish', 'race.event.pause', 'race.event.resume', 'race.event.start',
                                             'race.heat.finish', 'race.registration.missed_start', 'race.station.lock', 'race.station.performance_locked', 'race.station.start', 'race.checkin', 'race.checkin.late',
                                             'race.slot.bind', 'race.slot.overflow_created') group by action) q),
  'audit: every start, skip, DNF, pause, resume, station lock, heat and event finish is logged — exact counts');
select race_test.ok((select count(*) = 3 from race_audit_log where action = 'race.slot.empty' and metadata ->> 'event_id' = race_test.id('ev_s')::text), 'audit: the 3 burned slots are logged');
select race_test.ok(race_sim.invariants_hold(race_test.id('ev_s'), 14500000), 'invariants: hold on the final state');
