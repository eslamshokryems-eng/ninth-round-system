-- FINAL 50-athlete simulation, DENSE regime: the engine is ticked every 5 seconds of race time and the timing invariants
-- (no station overlap, windows == model, statuses agree with race time) are checked after EVERY tick.
-- Scenario (race_sim.scenario_50): 6 heats (9,9,9,9,9,5); heat 5 is MANUAL and never starts (closed by the Event Manager);
-- #5 never arrives · #14 late mid-heat · #27 skipped · #30 DNF · #48 late → the heat's only overflow slot · #49 late → NO SLOT ·
-- five emergency pauses (2:00, 5:00, 0:20, 0:45, 0:10). The SPARSE/blackout regime of the same scenario is 17_tick_independence.sql.
reset role;
select race_test.put('ev_s', race_sim.scenario_50('simulation-2026', race_test.id('bm_a')));
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_s'), race_test.id('rec'), 'RECEPTION');
create function race_test.sn(p_i int) returns uuid language sql stable as $$ select id from race_registrations where event_id = race_test.id('ev_s') and race_number = 'N' || lpad(p_i::text, 3, '0') $$;

select race_test.eq((select count(*) from race_check_ins where event_id = race_test.id('ev_s'))::int, 46, 'sim setup: 46 athletes checked in before the start (#5, #14, #48, #49 have not arrived)');
select race_test.ok((select array_agg(number || ':' || coalesce(anchor_race_ms::text, '-') order by number) = array['1:60000', '2:2340000', '3:4620000', '4:6900000', '5:-', '6:-']
                     from race_heats where event_id = race_test.id('ev_s')), 'sim: heats 1–4 anchored 0:01:00 / 0:39:00 / 1:17:00 / 1:55:00; MANUAL heat 5 (and heat 6 behind it) wait');

-- Until 2:29:50 — heat 5 is due at 2:33:00 and nobody has started it -----------------------------------------------------------------
select format('select race_sim.step(%L, %L, %s, %s)', race_test.id('ev_s'), race_test.id('bm_a'), 8990000, 5000) from generate_series(1, ceil(8990000 / 5000.0)::int + 2) \gexec
select race_test.ok((select ticks >= 1790 and actions = 8 from race_sim.ticks where event_id = race_test.id('ev_s')), 'sim: 1,790+ engine ticks, all invariants held at every tick, 8 scripted events fired (5 pauses, #14 arrival, #27 skip, #30 DNF)');
select race_test.ok((select status = 'LIVE' from race_events where id = race_test.id('ev_s'))
                    and (select status = 'AWAITING_START' from race_heats where event_id = race_test.id('ev_s') and number = 5)
                    and (select finished_at is null from race_clock where event_id = race_test.id('ev_s')),
  'sim: the event is still LIVE while the manual heat has not been dealt with — completion is never declared early');

-- Event Manager closes heat 5 at 2:30:00; reception checks the late arrivals in -------------------------------------------------------
select format('select race_sim.step(%L, %L, %s, %s)', race_test.id('ev_s'), race_test.id('bm_a'), 9980000, 5000) from generate_series(1, ceil(9980000 / 5000.0)::int + 2) \gexec
select race_test.ok((select actions = 11 from race_sim.ticks where event_id = race_test.id('ev_s')), 'sim: all 11 scripted events have fired — including heat 5 closed without start (2:30:00) and #48 / #49 arriving late');
select race_test.ok((select status = 'CANCELLED' and cancel_reason like '%will not start%' and cancelled_by = race_test.id('bm_a') and cancelled_race_ms between 9000000 and 9001000 from race_heats where event_id = race_test.id('ev_s') and number = 5)
                    and (select count(*) = 9 from race_registrations where event_id = race_test.id('ev_s') and race_status = 'MISSED_START' and heat_id = (select id from race_heats where event_id = race_test.id('ev_s') and number = 5)),
  'sim: heat 5 is CANCELLED with who/why/when, its 9 athletes are DNS');
select race_test.ok((select anchor_race_ms = 9180000 and planned_slot_count = 5 from race_heats where event_id = race_test.id('ev_s') and number = 6), 'sim: heat 6 was scheduled the moment heat 5 closed: 0:25 after heat 4''s last start + 10:00 gap = 2:33:00');
select race_test.login('rec');
select race_test.ok((select no_slot_available and projected_slot_index is null from race_queue(race_test.id('ev_s'), 6) where race_number = (select race_number from race_registrations where id = race_test.sn(49))),
  'sim: reception sees #49 flagged NO SLOT AVAILABLE — #48 has the only overflow slot');
select race_test.ok((select projected_slot_index = 5 and not no_slot_available from race_queue(race_test.id('ev_s'), 6) where race_number = (select race_number from race_registrations where id = race_test.sn(48))), 'sim: #48 is projected into the overflow slot');
reset role;

select format('select race_sim.step(%L, %L, %s, %s)', race_test.id('ev_s'), race_test.id('bm_a'), 13000000, 5000) from generate_series(1, ceil(13000000 / 5000.0)::int + 2) \gexec
select race_test.ok((select actions = 11 and ticks > 2200 from race_sim.ticks where event_id = race_test.id('ev_s')), 'sim: the whole event ran — 2,200+ ticks in total, nothing left to script, invariants held after every one of them');
select race_test.ok((select status = 'FINISHED' from race_events where id = race_test.id('ev_s')) and (select finished_at is not null from race_clock where event_id = race_test.id('ev_s')), 'sim: the event FINISHED by itself');
select race_test.ok((select (after ->> 'status') = 'FINISHED' and (metadata ->> 'engine_race_ms')::bigint between 12120000 and 12130000 from race_audit_log where action = 'race.event.finish' and metadata ->> 'event_id' = race_test.id('ev_s')::text),
  'sim: official finish 3:22:00 = last start 2:50:30 + 31:00 + the closing 0:30 — exactly, not "when a device noticed"');

-- Outcomes ------------------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(*) from race_start_slots where event_id = race_test.id('ev_s') and status = 'STARTED')::int, 38, 'outcome: 38 athletes started');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_s') and race_status = 'FINISHED')::int, 37, 'outcome: 37 finished');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_s') and race_status = 'DNF')::int, 1, 'outcome: 1 DNF (#30)');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_s') and race_status = 'MISSED_START')::int, 12, 'outcome: 12 DNS = #5, #27, #49 and the 9 athletes of the closed heat');
select race_test.eq((select count(*) from race_registrations where event_id = race_test.id('ev_s') and race_status not in ('FINISHED', 'DNF', 'MISSED_START'))::int, 0, 'outcome: nobody is left in limbo');
select race_test.ok((select array_agg(s order by s) = array['EMPTY:3', 'SKIPPED:1', 'STARTED:38'] from (select status || ':' || count(*) s from race_start_slots where event_id = race_test.id('ev_s') group by status) q),
  'outcome: 42 slots = 38 started + 1 skipped + 3 burned empty (heat 1 slot 9, heat 6 slots 4–5) — none left OPEN or BOUND, none ever created for the closed heat');
select race_test.eq((select count(*) from race_start_slots where event_id = race_test.id('ev_s') and is_overflow)::int, 1, 'outcome: exactly one overflow slot in the whole event');
select race_test.ok((select slot_index = 5 and is_overflow and status = 'STARTED' from race_start_slots where registration_id = race_test.sn(48)), 'outcome: #48 raced in heat 6''s overflow slot');
select race_test.eq((select count(*) from race_start_slots where registration_id = race_test.sn(49))::int, 0, 'outcome: #49 never held a slot');
select race_test.ok((select slot_index = 8 and status = 'STARTED' and not is_overflow from race_start_slots where registration_id = race_test.sn(14)), 'outcome: late #14 took heat 2''s last planned slot and raced');
select race_test.ok((select status = 'SKIPPED' from race_start_slots where registration_id = race_test.sn(27)) and (select count(*) = 0 from race_station_results where registration_id = race_test.sn(27)), 'outcome: skipped #27 — empty slot, no results');
select race_test.eq((select count(*) from race_station_results where event_id = race_test.id('ev_s') and status = 'LOCKED')::int, 37 * 9 + 3, 'outcome: 37 × 9 results + the 3 stations #30 reached are LOCKED');
select race_test.eq((select count(*) from race_station_results where event_id = race_test.id('ev_s') and status = 'NOT_REACHED')::int, 6, 'outcome: the 6 stations #30 never reached are NOT_REACHED (rows kept, never deleted)');
select race_test.eq((select count(*) from race_station_results where event_id = race_test.id('ev_s') and status not in ('LOCKED', 'VOID_DNS', 'NOT_REACHED'))::int, 0, 'outcome: nothing is left open');

-- Timing accuracy -----------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(distinct (after -> 'registration_id')) from race_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_s')::text)::int, 38, 'timing: 38 start audit rows, one per athlete — nobody started twice');
select race_test.ok((select bool_and((after ->> 'lag_ms')::bigint between 0 and 5100) and count(*) = 38 from race_audit_log where action = 'race.athlete.start' and metadata ->> 'event_id' = race_test.id('ev_s')::text),
  'timing: every athlete was started within one tick (≤ 5 s here) of their planned second — lag is only observation delay');
select race_test.ok((select bool_and((after ->> 'planned_start_ms')::bigint = h.anchor_race_ms + sl.slot_index::bigint * 210000)
                     from race_audit_log a join race_start_slots sl on sl.id = a.target_id join race_heats h on h.id = sl.heat_id
                    where a.action = 'race.athlete.start' and a.metadata ->> 'event_id' = race_test.id('ev_s')::text), 'timing: planned start = heat anchor + slot × 3:30 for all 38 — no skip, DNS, cancellation or late arrival moved anyone');
select race_test.ok((select bool_and(sl.started_at = race_wall_at(sl.event_id, h.anchor_race_ms + sl.slot_index::bigint * 210000)) from race_start_slots sl join race_heats h on h.id = sl.heat_id where sl.event_id = race_test.id('ev_s') and sl.status = 'STARTED'),
  'timing: each slot''s recorded start IS its official instant (START EVENT + planned ms + pauses) — not the moment the engine noticed');
select race_test.ok((select bool_and(sr.window_start_race_ms = h.anchor_race_ms + sl.slot_index::bigint * 210000 + (st.number - 1) * 210000 and sr.window_end_race_ms - sr.window_start_race_ms = 180000)
                     from race_station_results sr join race_start_slots sl on sl.id = sr.slot_id join race_heats h on h.id = sl.heat_id join race_stations st on st.id = sr.station_id
                    where sr.event_id = race_test.id('ev_s') and sr.status not in ('VOID_DNS', 'NOT_REACHED')), 'timing: every one of the 336 windows is exactly slot start + (station − 1) × 3:30 and exactly 3:00 long — no extra work time');
select race_test.ok((select bool_and(sr.locked_at = race_wall_at(sr.event_id, sr.window_end_race_ms + 30000)) from race_station_results sr where sr.event_id = race_test.id('ev_s') and sr.status = 'LOCKED'),
  'timing: every lock happened at exactly window end + 0:30 (official time) — there is no grace period');
select race_test.ok((select count(*) = 336 and count(distinct (station_id, window_start_race_ms)) = count(*) from race_station_results where event_id = race_test.id('ev_s') and status not in ('VOID_DNS', 'NOT_REACHED')),
  'timing: no two athletes ever share a station window (no overlapping athletes)');
select race_test.ok((select array_agg(right(r.race_number, 3) order by s.slot_index) = array['001', '002', '003', '004', '006', '007', '008', '009']
                     from race_start_slots s join race_registrations r on r.id = s.registration_id join race_heats h on h.id = s.heat_id where h.event_id = race_test.id('ev_s') and h.number = 1 and s.status = 'STARTED'),
  'order: heat 1 started in check-in order (#5 absent — nobody moved forward into slot 5, everyone behind kept their slot)');
select race_test.eq((select count(*) from race_start_slots s1 join race_start_slots s2 on s1.heat_id = s2.heat_id and s1.slot_index < s2.slot_index
                       join race_check_ins c1 on c1.registration_id = s1.registration_id and c1.voided_by_correction_id is null
                       join race_check_ins c2 on c2.registration_id = s2.registration_id and c2.voided_by_correction_id is null
                      where s1.event_id = race_test.id('ev_s') and (c1.checked_in_at, coalesce(c1.tie_draw_position, 0)) > (c2.checked_in_at, coalesce(c2.tie_draw_position, 0)))::int,
                    0, 'order: in every heat, start order == check-in order (0 inversions)');
select race_test.eq((select count(*) from (select registration_id from race_start_slots where event_id = race_test.id('ev_s') and registration_id is not null and status in ('BOUND', 'STARTED') group by 1 having count(*) > 1) x)::int, 0, 'integrity: no athlete holds two slots (no duplicate slots)');
select race_test.eq((select count(*) from (select registration_id from race_check_ins where event_id = race_test.id('ev_s') and voided_by_correction_id is null group by 1 having count(*) > 1) x)::int, 0, 'integrity: no duplicate check-ins');
select race_test.eq((select count(*) from (select registration_id, station_id from race_station_results where event_id = race_test.id('ev_s') group by 1, 2 having count(*) > 1) x)::int, 0, 'integrity: no duplicate station results');

-- Pauses --------------------------------------------------------------------------------------------------------------------------------
select race_test.eq((select count(*) from race_pauses where event_id = race_test.id('ev_s') and resumed_at is not null)::int, 5, 'pause: five pause/resume cycles, all closed');
select race_test.ok((select array_agg(round(paused_race_ms / 10000.0) * 10000 order by paused_at) = array[1200000, 3900000, 5100000, 5400000, 8000000]::numeric[] from race_pauses where event_id = race_test.id('ev_s')), 'pause: they froze race time at 20:00, 65:00, 85:00, 90:00 and 133:20');
select race_test.ok((select paused_total_ms between 495000 and 496500 from race_clock where event_id = race_test.id('ev_s')), 'pause: 8:15 of pause in total (2:00 + 5:00 + 0:20 + 0:45 + 0:10) was subtracted from the race clock — the schedule did not move');
select race_test.eq((select paused_total_ms from race_clock where event_id = race_test.id('ev_s')), (select sum(round(extract(epoch from (resumed_at - paused_at)) * 1000))::bigint from race_pauses where event_id = race_test.id('ev_s')), 'pause: paused_total_ms is exactly the sum of the pauses (no arithmetic drift)');
select race_test.eq((select count(*) from race_pauses a join race_pauses b on a.id < b.id and a.paused_at < coalesce(b.resumed_at, 'infinity') and b.paused_at < coalesce(a.resumed_at, 'infinity') where a.event_id = race_test.id('ev_s'))::int, 0, 'pause: no overlapping pauses');

-- Audit ---------------------------------------------------------------------------------------------------------------------------------
select race_test.ok((select array_agg(a || ':' || n order by split_part(a || ':' || n, ':', 1)) = (select array_agg(x order by split_part(x, ':', 1)) from unnest(array['race.athlete.dnf:1', 'race.athlete.finish:37', 'race.athlete.skip:1', 'race.athlete.start:38', 'race.event.finish:1', 'race.event.pause:5',
                                    'race.event.resume:5', 'race.event.start:1', 'race.heat.finish:5', 'race.heat.cancel:1', 'race.registration.missed_start:11', 'race.station.lock:336', 'race.station.performance_locked:336', 'race.station.start:336',
                                    'race.checkin:46', 'race.checkin.late:3', 'race.slot.bind:39', 'race.slot.overflow_created:1', 'race.slot.empty:3']) x)
                     from (select action a, count(*) n from race_audit_log where metadata ->> 'event_id' = race_test.id('ev_s')::text
                              and action in ('race.athlete.dnf', 'race.athlete.finish', 'race.athlete.skip', 'race.athlete.start', 'race.event.finish', 'race.event.pause', 'race.event.resume', 'race.event.start',
                                             'race.heat.finish', 'race.heat.cancel', 'race.registration.missed_start', 'race.station.lock', 'race.station.performance_locked', 'race.station.start', 'race.checkin', 'race.checkin.late',
                                             'race.slot.bind', 'race.slot.overflow_created', 'race.slot.empty') group by action) q),
  'audit: every start, skip, DNF, pause, resume, station lock, heat close and event finish is logged — exact counts');
select race_test.ok(race_sim.invariants_hold(race_test.id('ev_s'), 13000000), 'invariants: hold on the final state');
