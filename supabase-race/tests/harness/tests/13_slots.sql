-- Phase 5: start-slot engine — anchors, binding in check-in order, burned slots,
-- late athletes (overflow), heat close, pause freeze. The clock is driven by hand
-- (race_test.at) because START EVENT itself arrives in Phase 6.
reset role;

create function race_test.at(p_event uuid, p_secs numeric) returns void language sql as $$
  update race_clock set started_at = clock_timestamp() - make_interval(secs => p_secs), paused_at = null, paused_total_ms = 0
   where event_id = p_event
$$;
create function race_test.bind(p_event uuid) returns text language sql as $$
  select format('bound=%s emptied=%s overflow=%s missed=%s', bound, emptied, overflow_created, missed_start) from race_bind_due_slots(p_event)
$$;
create function race_test.mkevent(p_key text, p_slug text, p_athletes int) returns void language plpgsql as $$
begin
  perform race_test.login('bm_a');
  perform race_test.put(p_key, race_create_event(p_slug, date '2026-12-21', 'THE NINTH', 'Africa/Cairo', timestamptz '2026-12-21 07:00:00+00'));
  perform race_set_event_status(race_test.id(p_key), 'REGISTRATION_OPEN');
  insert into race_staff (event_id, profile_id, role) values (race_test.id(p_key), race_test.id('rec'), 'RECEPTION');
  perform race_test.anon();
  for i in 1..p_athletes loop
    perform race_test.keep(p_key || i, race_test.id(p_key), 'Slot Athlete ' || p_key || ' ' || i, '0177' || lpad((abs(hashtext(p_key)) % 1000)::text, 3, '0') || lpad(i::text, 4, '0'), 'male', '1990-01-01', 'MEN');
  end loop;
  perform race_test.login('bm_a');
end $$;

-- Event A: heat 1 = 9 athletes, heat 2 = 3 ---------------------------------------------------------------------------------
select race_test.mkevent('ev_sl', 'slots-a-2026', 12);
insert into race_heats (event_id, number) values (race_test.id('ev_sl'), 1), (race_test.id('ev_sl'), 2);
select race_test.put('sl_h1', (select id from race_heats where event_id = race_test.id('ev_sl') and number = 1));
select race_test.put('sl_h2', (select id from race_heats where event_id = race_test.id('ev_sl') and number = 2));
do $$ declare i int; begin
  for i in 1..9 loop perform race_move_athlete_heat(race_test.rid('ev_sl' || i), race_test.id('sl_h1')); end loop;
  for i in 10..12 loop perform race_move_athlete_heat(race_test.rid('ev_sl' || i), race_test.id('sl_h2')); end loop;
end $$;
select race_lock_heats(race_test.id('ev_sl'));
reset role;

-- Not API surface -----------------------------------------------------------------------------------------------------------
select race_test.ok(not exists (
  select 1 from unnest(array['race_bind_due_slots(uuid)', 'race_freeze_schedule(uuid)', 'race_anchor_heats_from(uuid,integer,bigint)', 'race_resolve_check_in_ties(uuid)']) f
  cross join unnest(array['anon', 'authenticated']) r where has_function_privilege(r, f, 'EXECUTE')),
  'engine: binder, freezer, anchoring and tie resolver are not callable by any API role');

-- Freeze ---------------------------------------------------------------------------------------------------------------------
select race_test.eq(race_freeze_schedule(race_test.id('ev_sl')), 2, 'freeze: two heats anchored');
select race_test.ok((select array_agg(anchor_race_ms order by number) = array[60000, 2340000]::bigint[] and array_agg(planned_slot_count order by number) = array[9, 3]::smallint[]
                     from race_heats where event_id = race_test.id('ev_sl')), 'freeze: anchors 0:01:00 and 0:39:00, slot counts 9 and 3');
select race_test.eq((select count(*) from race_start_slots where event_id = race_test.id('ev_sl') and status = 'OPEN' and not is_overflow)::int, 12, 'freeze: 12 slots created, all OPEN');
select race_test.eq(race_freeze_schedule(race_test.id('ev_sl')), 2, 'freeze: idempotent');
select race_test.eq((select count(*) from race_start_slots where event_id = race_test.id('ev_sl'))::int, 12, 'freeze: no duplicate slots on a second run');
select race_test.throws($$update race_heats set anchor_race_ms = 1 where id = race_test.id('sl_h1')$$, 'RACE_ANCHOR_FROZEN', 'freeze: a heat anchor can never change (even for the table owner)');
select race_test.throws($$update race_heats set planned_slot_count = 5 where id = race_test.id('sl_h1')$$, 'RACE_ANCHOR_FROZEN', 'freeze: the slot count is frozen too');
select race_test.throws($$select race_anchor_heats_from(race_test.id('ev_sl'), 0, 99999)$$, 'RACE_ANCHOR_CONFLICT', 'freeze: re-anchoring at a different time is refused');

-- Check-ins (before the clock starts): 1..5, 7 — NOT 6 ------------------------------------------------------------------------------
select race_test.login('rec');
do $$ declare i int; begin foreach i in array array[1, 2, 3, 4, 5, 7] loop perform race_check_in(race_test.rid('ev_sl' || i)); end loop; end $$;
reset role;
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=0 overflow=0 missed=0', 'bind: before START EVENT nothing binds (no race time yet)');

-- Binding in check-in order, as race time advances ----------------------------------------------------------------------------------
select race_test.at(race_test.id('ev_sl'), 30);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=1 emptied=0 overflow=0 missed=0', 'bind 0:30 — slot 1 (start 0:01:00, binds at 0:00:00) takes the first checked-in athlete');
select race_test.eq((select registration_id from race_start_slots where heat_id = race_test.id('sl_h1') and slot_index = 0), race_test.rid('ev_sl1'), 'bind: slot 0 → N-first athlete (first to check in)');
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=0 overflow=0 missed=0', 'bind: a second pass changes nothing (idempotent)');
select race_test.ok((select race_status = 'CHECKED_IN' from race_registrations where id = race_test.rid('ev_sl1')), 'bind: binding does not start the athlete (Phase 6 does) — still CHECKED_IN');
select race_test.login('rec');
select race_test.ok((select array_agg(projected_slot_index order by queue_position)::int[] = array[0, 1, 2, 3, 4, 5]
                     from race_queue(race_test.id('ev_sl'), 1)), 'queue: bound athlete shows slot 0; the rest project to the next OPEN slots 1..5');
select race_test.ok((select projected_start_ms = 60000 + 5 * 210000 from race_queue(race_test.id('ev_sl'), 1) where queue_position = 6), 'queue: 6th athlete projects to 0:18:30');
reset role;
select race_test.at(race_test.id('ev_sl'), 830);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=3 emptied=0 overflow=0 missed=0', 'bind 13:50 — slots 2–4 due (slot 5 binds at 14:00)');
select race_test.at(race_test.id('ev_sl'), 870);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=1 emptied=0 overflow=0 missed=0', 'bind 14:30 — slot 5 due');
select race_test.at(race_test.id('ev_sl'), 1060);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=1 emptied=0 overflow=0 missed=0', 'bind 17:40 — slot 6 due; athlete 6 never arrived, so athlete 7 (checked in) takes it');
select race_test.eq((select registration_id from race_start_slots where heat_id = race_test.id('sl_h1') and slot_index = 5), race_test.rid('ev_sl7'),
  'order: start order is CHECK-IN order — athlete 7 starts in slot 6, not in position 7');

-- A burned slot, then a late athlete who does NOT move anyone ------------------------------------------------------------------------
select race_test.at(race_test.id('ev_sl'), 1290);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=1 overflow=0 missed=0', 'bind 21:30 — nobody left to bind: the slot burns EMPTY (later athletes do not move up)');
select race_test.eq((select status::text from race_start_slots where heat_id = race_test.id('sl_h1') and slot_index = 6), 'EMPTY', 'burn: slot 7 is EMPTY');
select race_test.login('rec');
select race_test.ok((select kind = 'LATE' from race_check_in(race_test.rid('ev_sl8'))), 'late: athlete 8 arrives after the race clock started → LATE_CHECK_IN');
select race_test.ok((select projected_slot_index = 7 from race_queue(race_test.id('ev_sl'), 1) where race_number = (select race_number from race_registrations where id = race_test.rid('ev_sl8'))),
  'late: projected into the next free planned slot (index 7), behind everyone already ahead');
reset role;
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=0 overflow=0 missed=0', 'late: a planned slot is still waiting, so no overflow slot is created');
select race_test.at(race_test.id('ev_sl'), 1490);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=1 emptied=0 overflow=0 missed=0', 'bind 24:50 — slot 8 due');
select race_test.eq((select registration_id from race_start_slots where heat_id = race_test.id('sl_h1') and slot_index = 7), race_test.rid('ev_sl8'), 'late: athlete 8 gets the next available slot; every earlier athlete kept theirs');

-- Overflow: a later arrival after every planned slot is used ----------------------------------------------------------------------------
select race_test.at(race_test.id('ev_sl'), 1690);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=1 overflow=0 missed=0', 'bind 28:10 — last planned slot burns (athlete 9 has not arrived)');
select race_test.login('rec');
select race_test.ok((select kind = 'LATE' from race_check_in(race_test.rid('ev_sl9'))), 'overflow: athlete 9 arrives after every planned slot is gone');
reset role;
-- The check-in itself catches the race up (no device has to tick), so the overflow slot already exists the moment athlete 9 is checked in.
select race_test.eq((select count(*) from race_start_slots where heat_id = race_test.id('sl_h1') and is_overflow)::int, 1, 'overflow: one extra slot was opened inside the heat gap — at the moment of the check-in');
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=0 overflow=0 missed=0', 'overflow: a later binder pass has nothing left to do (state was already settled)');
select race_test.ok((select is_overflow and slot_index = 9 and status = 'OPEN' from race_start_slots where heat_id = race_test.id('sl_h1') and slot_index = 9), 'overflow: slot index 9, flagged overflow, waiting for its bind time');
select race_test.login('rec');
select race_test.ok((select projected_slot_index = 9 and projected_start_ms = 60000 + 9 * 210000 and not no_slot_available
                     from race_queue(race_test.id('ev_sl'), 1) where race_number = (select race_number from race_registrations where id = race_test.rid('ev_sl9'))),
  'overflow: queue shows athlete 9 at 0:32:30 (28:00 last start + 3:30 — inside the 10:00 heat gap)');
reset role;
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=0 overflow=0 missed=0', 'overflow: not created twice');

-- Heat close: whoever never arrived is DNS --------------------------------------------------------------------------------------------------
select race_test.at(race_test.id('ev_sl'), 1900);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=1 emptied=0 overflow=0 missed=1', 'bind 31:40 — overflow slot binds athlete 9; the heat can take nobody else, so athlete 6 is MISSED_START');
select race_test.ok((select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_sl6')), 'DNS: athlete 6 (never checked in) → MISSED_START');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.registration.missed_start' and target_id = race_test.rid('ev_sl6')), 'audit: the missed start is logged');
select race_test.ok((select array_agg(case when status in ('BOUND', 'STARTED') then 'BOUND' else coalesce(status::text, 'x') end || ':' || coalesce(rn, '-') order by slot_index) = array['BOUND:1', 'BOUND:2', 'BOUND:3', 'BOUND:4', 'BOUND:5', 'BOUND:7', 'EMPTY:-', 'BOUND:8', 'EMPTY:-', 'BOUND:9']
                     from (select s.slot_index, s.status, right(r.race_number, 1) rn from race_start_slots s left join race_registrations r on r.id = s.registration_id where s.heat_id = race_test.id('sl_h1')) q
                     where true), 'result: heat 1 slots = athletes 1,2,3,4,5,7,(empty),8,(empty),9 — nobody was ever moved (BOUND and already-STARTED both mean "holds the slot": catch-up starts due athletes)');
select race_test.login('rec');
select race_test.throws($$select * from race_check_in(race_test.rid('ev_sl6'))$$, 'RACE_CHECKIN_NOT_ELIGIBLE', 'DNS: a missed-start athlete cannot check in afterwards');
reset role;
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.slot.empty' and target_id in (select id from race_start_slots where heat_id = race_test.id('sl_h1')))
                    and exists (select 1 from race_audit_log where action = 'race.slot.bind') and exists (select 1 from race_audit_log where action = 'race.slot.overflow_created'),
  'audit: every bind, burned slot and overflow slot is logged');

-- Heat 2: overflow capacity is exactly one ------------------------------------------------------------------------------------------------------
select race_test.at(race_test.id('ev_sl'), 2760);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=3 overflow=0 missed=0', 'heat 2 at 46:00 — all three planned slots burned (nobody arrived)');
select race_test.login('rec');
select race_test.ok((select kind = 'LATE' from race_check_in(race_test.rid('ev_sl10'))) and (select kind = 'LATE' from race_check_in(race_test.rid('ev_sl11'))), 'heat 2: two athletes arrive late');
reset role;
select race_test.eq((select count(*) from race_start_slots where heat_id = race_test.id('sl_h2') and is_overflow)::int, 1, 'heat 2: only ONE overflow slot exists (floor(10:00 / 3:30) − 1), opened by the first late check-in');
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=0 overflow=0 missed=0', 'heat 2: the second late athlete did not create another one');
select race_test.login('rec');
select race_test.ok((select no_slot_available and projected_slot_index is null from race_queue(race_test.id('ev_sl'), 2) where queue_position = 2),
  'heat 2: the second late athlete is flagged NO SLOT AVAILABLE (an Event Manager must move them) — nobody else is disturbed');
reset role;
select race_test.at(race_test.id('ev_sl'), 2915);
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=1 emptied=0 overflow=0 missed=1', 'heat 2 at 48:35 — the overflow slot binds the first late athlete; heat closes; athlete 12 is MISSED_START');
select race_test.ok((select registration_id from race_start_slots where heat_id = race_test.id('sl_h2') and slot_index = 3) = race_test.rid('ev_sl10')
                    and not exists (select 1 from race_start_slots where registration_id = race_test.rid('ev_sl11')), 'heat 2: N-first late athlete slotted; the second has no slot');
select race_test.ok((select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_sl12')), 'heat 2: athlete 12 (never arrived) → MISSED_START');
select race_test.ok((select race_status = 'LATE_CHECK_IN' from race_registrations where id = race_test.rid('ev_sl11')), 'heat 2: the unslotted athlete is still LATE_CHECK_IN — present, never auto-cancelled');
select race_test.eq(race_test.bind(race_test.id('ev_sl')), 'bound=0 emptied=0 overflow=0 missed=0', 'final: binder is quiet once everything is settled');

-- Pause: race time freezes, so nothing burns while the race is paused ----------------------------------------------------------------------------
select race_test.mkevent('ev_p', 'slots-pause-2026', 4);
insert into race_heats (event_id, number) values (race_test.id('ev_p'), 1);
select race_test.put('p_h1', (select id from race_heats where event_id = race_test.id('ev_p') and number = 1));
do $$ declare i int; begin for i in 1..4 loop perform race_move_athlete_heat(race_test.rid('ev_p' || i), race_test.id('p_h1')); end loop; end $$;
select race_lock_heats(race_test.id('ev_p'));
reset role;
select race_freeze_schedule(race_test.id('ev_p'));
select race_test.login('rec');
do $$ declare i int; begin for i in 1..4 loop perform race_check_in(race_test.rid('ev_p' || i)); end loop; end $$;
reset role;
update race_clock set started_at = clock_timestamp() - interval '40 minutes', paused_at = clock_timestamp() - interval '35 minutes', paused_total_ms = 0 where event_id = race_test.id('ev_p');
select race_test.ok(race_now_ms(race_test.id('ev_p')) between 299000 and 301000, 'pause: 40 minutes of wall time, paused at 5:00 → race time is 5:00');
select race_test.eq(race_test.bind(race_test.id('ev_p')), 'bound=2 emptied=0 overflow=0 missed=0', 'pause: only slots due by RACE time (1 and 2) bind — 35 minutes of pause burned nothing');
select pg_sleep(0.3);
select race_test.eq(race_test.bind(race_test.id('ev_p')), 'bound=0 emptied=0 overflow=0 missed=0', 'pause: still nothing while paused');
update race_clock set paused_at = null, paused_total_ms = 35 * 60 * 1000 where event_id = race_test.id('ev_p');
select race_test.ok(race_now_ms(race_test.id('ev_p')) between 299000 and 306000, 'resume: the 35:00 pause is subtracted — race time is still ≈ 5:00');
select race_test.eq(race_test.bind(race_test.id('ev_p')), 'bound=0 emptied=0 overflow=0 missed=0', 'resume: nothing was skipped or double-bound');

-- MANUAL heats and empty heats ------------------------------------------------------------------------------------------------------------------------
select race_test.mkevent('ev_m', 'slots-manual-2026', 8);
insert into race_heats (event_id, number) select race_test.id('ev_m'), n from generate_series(1, 6) n;
do $$ declare i int; h int[] := array[1, 1, 3, 3, 5, 5, 6, 6]; begin
  for i in 1..8 loop perform race_move_athlete_heat(race_test.rid('ev_m' || i), (select id from race_heats where event_id = race_test.id('ev_m') and number = h[i])); end loop;
end $$;
select race_lock_heats(race_test.id('ev_m'));
reset role;
update race_heats set start_mode = 'MANUAL' where event_id = race_test.id('ev_m') and number = 5;
select race_test.eq(race_freeze_schedule(race_test.id('ev_m')), 2, 'manual: freeze anchors heats 1 and 3, then stops at the MANUAL heat 5');
select race_test.ok((select array_agg(coalesce(anchor_race_ms::text, '-') order by number) = array['60000', '-', '870000', '-', '-', '-'] from race_heats where event_id = race_test.id('ev_m')),
  'manual: heat 1 at 0:01:00; empty heat 2 takes no time; heat 3 = 0:01:00 + 3:30 + 10:00 = 0:14:30; the rest wait');
select race_test.ok((select array_agg(status::text order by number) filter (where number in (5, 6)) = array['AWAITING_START', 'AWAITING_START'] from race_heats where event_id = race_test.id('ev_m')),
  'manual: the manual heat and those after it are AWAITING_START');
select race_test.eq((select count(*) from race_start_slots where event_id = race_test.id('ev_m'))::int, 4, 'manual: slots exist only for the anchored heats (2 + 2)');
select race_test.eq(race_anchor_heats_from(race_test.id('ev_m'), 5, 2000000), 2, 'manual: START NEXT HEAT anchors heat 5 and the AUTO heat after it');
select race_test.ok((select array_agg(anchor_race_ms order by number) filter (where number >= 5) = array[2000000, 2810000]::bigint[] from race_heats where event_id = race_test.id('ev_m')),
  'manual: heat 5 at the moment it was started; heat 6 = that + 3:30 + 10:00');
select race_test.ok((select array_agg(status::text order by number) filter (where number in (5, 6)) = array['LOCKED', 'LOCKED'] from race_heats where event_id = race_test.id('ev_m'))
                    and (select count(*) = 8 from race_start_slots where event_id = race_test.id('ev_m')), 'manual: anchored heats leave AWAITING_START; 8 slots in total');
