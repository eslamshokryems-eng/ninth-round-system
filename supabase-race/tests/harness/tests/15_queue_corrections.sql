-- Phase 6: queue corrections — wrong check-in (Master only), DNS override and later-heat move (Event Manager only).
-- Guarantees under test: history is never overwritten; nobody who holds or is owed a slot is displaced;
-- no existing start time changes; "no safe slot" is an answer, not an error the system papers over.
reset role;
create function race_test.slotfp(p_event uuid) returns text language sql as $$
  select coalesce(string_agg(heat_id::text || ':' || slot_index || ':' || status || ':' || coalesce(registration_id::text, '-'), ',' order by heat_id, slot_index), '')
    from race_start_slots where event_id = p_event
$$;

-- Event C: heat 1 = c1..c6, heat 2 = c7, c8 ----------------------------------------------------------------------------------
select race_test.mkevent('ev_c', 'corr-2026', 8);
insert into race_heats (event_id, number) values (race_test.id('ev_c'), 1), (race_test.id('ev_c'), 2);
select race_test.put('c_h1', (select id from race_heats where event_id = race_test.id('ev_c') and number = 1));
select race_test.put('c_h2', (select id from race_heats where event_id = race_test.id('ev_c') and number = 2));
do $$ declare i int; begin
  for i in 1..6 loop perform race_move_athlete_heat(race_test.rid('ev_c' || i), race_test.id('c_h1')); end loop;
  for i in 7..8 loop perform race_move_athlete_heat(race_test.rid('ev_c' || i), race_test.id('c_h2')); end loop;
end $$;
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_c'), race_test.id('master'), 'MASTER_CONTROL');
select race_lock_heats(race_test.id('ev_c'));
select race_test.login('rec');
select race_check_in(race_test.rid('ev_c1'));
select pg_sleep(0.05);
select race_check_in(race_test.rid('ev_c3'));
reset role;
select race_test.put('c_orig_ci', (select id from race_check_ins where registration_id = race_test.rid('ev_c1')));

-- CORRECT CHECK-IN: who may, and what is refused -------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c2'), 'typo')$$, 'RACE_FORBIDDEN', 'correct: Reception cannot correct a check-in');
select race_test.login('bm_a');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c2'), 'typo')$$, 'RACE_FORBIDDEN', 'correct: the Event Manager alone cannot either — it is a Master Control action');
select race_test.login('judge1');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c2'), 'typo')$$, 'RACE_FORBIDDEN', 'correct: a judge cannot');
select race_test.anon();
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c2'), 'typo')$$, 'permission denied', 'correct: anon has no EXECUTE');
select race_test.login('master');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c2'), '   ')$$, 'RACE_REASON_REQUIRED', 'correct: a reason is required');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c1'), 'x')$$, 'RACE_CORRECTION_SAME_ATHLETE', 'correct: same athlete refused');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c7'), 'x')$$, 'RACE_CORRECTION_DIFFERENT_HEAT', 'correct: the corrected athlete must be in the same heat');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c2'), race_test.rid('ev_c4'), 'x')$$, 'RACE_NOT_CHECKED_IN', 'correct: the first athlete must actually be checked in');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c3'), 'x')$$, 'RACE_CORRECTION_NOT_ELIGIBLE', 'correct: the corrected athlete must not already be checked in');
reset role;
select race_test.eq((select count(*) from race_check_in_corrections where event_id = race_test.id('ev_c'))::int, 0, 'correct: every refused attempt left no trace in the ledger');

-- The correction itself ----------------------------------------------------------------------------------------------------------
select race_test.login('master');
select race_test.ok((select queue_position = 1 and heat_number = 1 and not slot_rebound from race_correct_check_in(race_test.rid('ev_c1'), race_test.rid('ev_c2'), 'Reception scanned the wrong wristband')),
  'correct: Master swaps c1 → c2 — c2 takes c1''s place in the queue (position 1)');
reset role;
select race_test.eq((select count(*) from race_check_ins where registration_id = race_test.rid('ev_c1'))::int, 1, 'correct: the ORIGINAL check-in row still exists — nothing deleted');
select race_test.ok((select voided_by_correction_id is not null and checked_in_at is not null from race_check_ins where id = race_test.id('c_orig_ci')), 'correct: it is marked superseded, not edited');
select race_test.ok((select registration_id = race_test.rid('ev_c1') from race_check_ins where id = race_test.id('c_orig_ci')), 'correct: the original still names the athlete it was recorded for');
select race_test.eq((select checked_in_at from race_check_ins where registration_id = race_test.rid('ev_c2') and voided_by_correction_id is null),
                    (select checked_in_at from race_check_ins where id = race_test.id('c_orig_ci')), 'correct: c2 inherits the ORIGINAL arrival time — nobody behind them is pushed');
select race_test.ok((select race_status = 'REGISTERED' from race_registrations where id = race_test.rid('ev_c1')) and (select race_status = 'CHECKED_IN' from race_registrations where id = race_test.rid('ev_c2')),
  'correct: c1 is back to REGISTERED, c2 is CHECKED_IN');
select race_test.ok((select reason = 'Reception scanned the wrong wristband' and corrected_by = race_test.id('master') and type = 'WRONG_ATHLETE'
                            and old_registration_id = race_test.rid('ev_c1') and new_registration_id = race_test.rid('ev_c2') and original_check_in_id = race_test.id('c_orig_ci')
                            and corrected_at is not null and new_check_in_id is not null
                     from race_check_in_corrections where event_id = race_test.id('ev_c')), 'correct: ledger row has old athlete, new athlete, reason, user, timestamp');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.checkin.correct' and metadata ->> 'reason' = 'Reception scanned the wrong wristband'), 'audit: the correction is in the audit log');
select race_test.login('rec');
select race_test.ok((select array_agg(race_number order by queue_position) = array[(select race_number from race_registrations where id = race_test.rid('ev_c2')), (select race_number from race_registrations where id = race_test.rid('ev_c3'))]
                     from race_queue(race_test.id('ev_c'), 1)), 'queue: order is now c2, c3');
select race_test.ok((select kind is not null from race_check_in(race_test.rid('ev_c1'))), 'correct: the wrongly checked-in athlete can still check in properly');
select race_test.ok((select array_agg(race_number order by queue_position) = array[(select race_number from race_registrations where id = race_test.rid('ev_c2')),
                                                                                   (select race_number from race_registrations where id = race_test.rid('ev_c3')),
                                                                                   (select race_number from race_registrations where id = race_test.rid('ev_c1'))]
                     from race_queue(race_test.id('ev_c'), 1)), 'queue: … and joins at the END (c2, c3, c1)');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c2'), race_test.rid('ev_c4'), 'x')$$, 'RACE_FORBIDDEN', 'correct: Reception still cannot undo, delete or correct');
select race_test.throws($$delete from race_check_ins where id = race_test.id('c_orig_ci')$$, 'permission denied', 'correct: Reception cannot delete a check-in');
select race_test.throws($$update race_check_ins set registration_id = race_test.rid('ev_c4') where id = race_test.id('c_orig_ci')$$, 'permission denied', 'correct: Reception cannot edit a check-in');
select race_test.throws($$insert into race_check_in_corrections (event_id, type, old_registration_id, new_registration_id, reason, corrected_by)
                          values (race_test.id('ev_c'), 'WRONG_ATHLETE', race_test.rid('ev_c1'), race_test.rid('ev_c4'), 'x', race_test.id('rec'))$$, 'permission denied', 'correct: nobody can write the ledger directly');
reset role;
select race_test.throws($$delete from race_check_ins where id = race_test.id('c_orig_ci')$$, 'RACE_APPEND_ONLY', 'ledger: even the owner cannot delete a check-in');
select race_test.throws($$update race_check_ins set registration_id = race_test.rid('ev_c4') where id = race_test.id('c_orig_ci')$$, 'RACE_APPEND_ONLY', 'ledger: nor rewrite who it was for');
select race_test.throws($$update race_check_ins set voided_by_correction_id = null where id = race_test.id('c_orig_ci')$$, 'RACE_APPEND_ONLY', 'ledger: nor un-supersede it');
select race_test.throws($$update race_check_in_corrections set reason = 'edited' where event_id = race_test.id('ev_c')$$, 'RACE_APPEND_ONLY', 'ledger: corrections cannot be edited');
select race_test.throws($$delete from race_check_in_corrections where event_id = race_test.id('ev_c')$$, 'RACE_APPEND_ONLY', 'ledger: corrections cannot be deleted');

-- After START: a BOUND slot follows the correction, a STARTED athlete cannot be corrected ------------------------------------------------
select race_test.login('master');
select race_start_event(race_test.id('ev_c'));
reset role;
select race_test.ok((select registration_id = race_test.rid('ev_c2') and status = 'BOUND' from race_start_slots where heat_id = race_test.id('c_h1') and slot_index = 0), 'rebind setup: slot 0 is bound to c2');

select race_test.login('master');
select race_test.ok((select slot_rebound from race_correct_check_in(race_test.rid('ev_c2'), race_test.rid('ev_c4'), 'Wrong athlete at the start line')), 'rebind: correcting an athlete whose slot is BOUND moves the slot');
reset role;
select race_test.ok((select registration_id = race_test.rid('ev_c4') and status = 'BOUND' and slot_index = 0 from race_start_slots where heat_id = race_test.id('c_h1') and slot_index = 0)
                    and (select anchor_race_ms = 60000 from race_heats where id = race_test.id('c_h1')), 'rebind: same slot, same start time (0:01:00) — only the name changed');
select race_test.ok((select race_status = 'REGISTERED' from race_registrations where id = race_test.rid('ev_c2')) and (select race_status = 'CHECKED_IN' from race_registrations where id = race_test.rid('ev_c4')), 'rebind: c2 released, c4 checked in');
select race_sim.travel_to(race_test.id('ev_c'), 61000);
select race_advance_core(race_test.id('ev_c'));
select race_test.ok((select race_status = 'STARTED' from race_registrations where id = race_test.rid('ev_c4')) and (select race_status = 'REGISTERED' from race_registrations where id = race_test.rid('ev_c2')),
  'rebind: at 1:01 the CORRECTED athlete (c4) starts, c2 does not');
select race_test.login('master');
select race_test.throws($$select * from race_correct_check_in(race_test.rid('ev_c4'), race_test.rid('ev_c5'), 'x')$$, 'RACE_ATHLETE_ALREADY_STARTED', 'correct: a started athlete cannot be corrected (use SKIP)');
reset role;
select race_test.eq((select count(*) from race_check_in_corrections where event_id = race_test.id('ev_c'))::int, 2, 'ledger: exactly the two successful corrections');

-- Event D: DNS override and later-heat move. h1 = d1..d5, h2 = d6..d8, h3 = d9..d11 -----------------------------------------------------
select race_test.mkevent('ev_d', 'dns-2026', 11);
insert into race_heats (event_id, number) select race_test.id('ev_d'), n from generate_series(1, 3) n;
do $$ declare i int; h int[] := array[1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3]; begin
  for i in 1..11 loop perform race_move_athlete_heat(race_test.rid('ev_d' || i), (select id from race_heats where event_id = race_test.id('ev_d') and number = h[i])); end loop;
end $$;
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_d'), race_test.id('master'), 'MASTER_CONTROL');
select race_lock_heats(race_test.id('ev_d'));
select race_test.login('rec');
do $$ declare i int; begin foreach i in array array[1, 2, 3, 6, 7, 9, 10, 11] loop perform race_check_in(race_test.rid('ev_d' || i)); end loop; end $$;
reset role;
select race_test.login('master');
select race_start_event(race_test.id('ev_d'));
reset role;
select race_test.ok((select array_agg(anchor_race_ms order by number) = array[60000, 1500000, 2520000]::bigint[] from race_heats where event_id = race_test.id('ev_d')), 'setup: anchors 0:01:00, 0:25:00, 0:42:00 (10:00 heat gap after each heat''s last start)');
select race_sim.travel_to(race_test.id('ev_d'), 1100000);
select race_advance_core(race_test.id('ev_d'));
select race_test.ok((select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_d4')) and (select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_d5')),
  'setup: heat 1 closed — d4 and d5 never arrived → MISSED_START (DNS)');

-- DNS OVERRIDE ------------------------------------------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select * from race_override_dns(race_test.rid('ev_d4'), 'arrived')$$, 'RACE_FORBIDDEN', 'dns: Reception cannot override a DNS');
select race_test.login('master');
select race_test.throws($$select * from race_override_dns(race_test.rid('ev_d4'), 'arrived')$$, 'RACE_FORBIDDEN', 'dns: Master Control cannot either — Event Manager only');
select race_test.login('bm_b');
select race_test.throws($$select * from race_override_dns(race_test.rid('ev_d4'), 'arrived')$$, 'RACE_FORBIDDEN', 'dns: another event''s manager cannot');
select race_test.anon();
select race_test.throws($$select * from race_override_dns(race_test.rid('ev_d4'), 'arrived')$$, 'permission denied', 'dns: anon has no EXECUTE');
select race_test.login('bm_a');
select race_test.throws($$select * from race_override_dns(race_test.rid('ev_d4'), '')$$, 'RACE_REASON_REQUIRED', 'dns: a reason is required');
select race_test.throws($$select * from race_override_dns(race_test.rid('ev_d1'), 'x')$$, 'RACE_NOT_DNS', 'dns: only a DNS athlete can be overridden');
reset role;

create temp table d_fp_t as select race_test.slotfp(race_test.id('ev_d')) fp;
select race_test.login('bm_a');
select race_test.ok((select outcome = 'NO_SLOT_AVAILABLE' and heat_number = 1 and slot_index is null from race_override_dns(race_test.rid('ev_d4'), 'Athlete arrived 20 minutes late')),
  'dns: heat 1 is closed → NO SLOT AVAILABLE (an answer, not an error)');
reset role;
select race_test.ok((select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_d4')), 'dns: no slot → the athlete is still MISSED_START, nothing changed');
select race_test.eq((select count(*) from race_check_ins where registration_id = race_test.rid('ev_d4'))::int, 0, 'dns: no check-in was created for a slot that does not exist');
select race_test.eq(race_test.slotfp(race_test.id('ev_d')), (select fp from d_fp_t), 'dns: not a single slot or start time changed');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.dns_override.no_slot' and target_id = race_test.rid('ev_d4') and metadata ->> 'reason' is not null), 'audit: the refused override is logged too');

-- MOVE TO LATER HEAT ---------------------------------------------------------------------------------------------------------------------
select race_test.login('rec');
select race_test.throws($$select * from race_move_athlete_later_heat(race_test.rid('ev_d4'), 2, 'x')$$, 'RACE_FORBIDDEN', 'move: Reception cannot');
select race_test.login('master');
select race_test.throws($$select * from race_move_athlete_later_heat(race_test.rid('ev_d4'), 2, 'x')$$, 'RACE_FORBIDDEN', 'move: Master Control cannot — Event Manager only');
select race_test.login('bm_a');
select race_test.throws($$select * from race_move_athlete_later_heat(race_test.rid('ev_d4'), 2, ' ')$$, 'RACE_REASON_REQUIRED', 'move: a reason is required');
select race_test.throws($$select * from race_move_athlete_later_heat(race_test.rid('ev_d4'), 1, 'x')$$, 'RACE_MOVE_NOT_LATER', 'move: never the same heat');
select race_test.throws($$select * from race_move_athlete_later_heat(race_test.rid('ev_d1'), 2, 'x')$$, 'RACE_MOVE_NOT_ELIGIBLE', 'move: an athlete who is racing is never moved');
reset role;
create temp table d_fp_t2 as select race_test.slotfp(race_test.id('ev_d')) fp;
select race_test.login('bm_a');
select race_test.ok((select heat_number = 2 and queue_position = 3 from race_move_athlete_later_heat(race_test.rid('ev_d4'), 2, 'Arrived after heat 1 closed')),
  'move: d4 goes to heat 2 — behind everyone already checked in there (d6, d7)');
reset role;
select race_test.ok((select race_status = 'LATE_CHECK_IN' and heat_id = (select id from race_heats where event_id = race_test.id('ev_d') and number = 2) from race_registrations where id = race_test.rid('ev_d4')), 'move: d4 is now a late check-in of heat 2');
select race_test.eq(race_test.slotfp(race_test.id('ev_d')), (select fp from d_fp_t2), 'move: nobody else''s slot changed');
select race_test.ok((select type = 'HEAT_MOVE' and old_heat_id <> new_heat_id and original_check_in_id is null and reason = 'Arrived after heat 1 closed' and corrected_by = race_test.id('bm_a')
                     from race_check_in_corrections where new_registration_id = race_test.rid('ev_d4')), 'move: ledger row records both heats, the reason and who');
select race_test.login('bm_a');
select race_test.throws($$select * from race_move_athlete_later_heat(race_test.rid('ev_d5'), 2, 'Also late')$$, 'RACE_NO_SLOT_AVAILABLE', 'move: heat 2 is now full — the second athlete is refused (would displace someone)');
reset role;
select race_test.ok((select race_status = 'MISSED_START' and heat_id = (select id from race_heats where event_id = race_test.id('ev_d') and number = 1) from race_registrations where id = race_test.rid('ev_d5')), 'move: the refused athlete is untouched');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.heat.move_after_start' and target_id in (select id from race_check_in_corrections where new_registration_id = race_test.rid('ev_d4'))), 'audit: the move is logged');

-- Heat 2 binds; an athlete holding a slot is never moved --------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_d'), 1450000);
select race_advance_core(race_test.id('ev_d'));
select race_test.ok((select registration_id = race_test.rid('ev_d6') and status = 'BOUND' from race_start_slots where heat_id = (select id from race_heats where event_id = race_test.id('ev_d') and number = 2) and slot_index = 0), 'heat 2 at 24:10: slot 0 (starts 0:25:00) is bound to d6');
select race_test.login('bm_a');
select race_test.throws($$select * from race_move_athlete_later_heat(race_test.rid('ev_d6'), 3, 'x')$$, 'RACE_ATHLETE_HAS_SLOT', 'move: an athlete who holds a slot is NEVER moved');
reset role;

-- DNS override that works: heat 3, skipped athletes ------------------------------------------------------------------------------------------------
select race_sim.travel_to(race_test.id('ev_d'), 2885000);
select race_advance_core(race_test.id('ev_d'));
select race_test.put('d_s1', (select id from race_start_slots where heat_id = (select id from race_heats where event_id = race_test.id('ev_d') and number = 3) and slot_index = 1));
select race_test.put('d_s2', (select id from race_start_slots where heat_id = (select id from race_heats where event_id = race_test.id('ev_d') and number = 3) and slot_index = 2));
select race_test.login('master');
select race_skip_athlete(race_test.id('d_s1'), 'Injured');
select race_skip_athlete(race_test.id('d_s2'), 'Injured');
reset role;
select race_test.ok((select count(*) = 2 from race_registrations where heat_id = (select id from race_heats where event_id = race_test.id('ev_d') and number = 3) and race_status = 'MISSED_START'), 'setup: two heat-3 athletes skipped (DNS)');
create temp table d_fp_t3 as select race_test.slotfp(race_test.id('ev_d')) fp;
select race_test.login('bm_a');
select race_test.ok((select outcome in ('QUEUED', 'ASSIGNED') and heat_number = 3 from race_override_dns(race_test.rid('ev_d10'), 'Athlete recovered and is at the start line')),
  'dns: heat 3 has one safe overflow slot → the first override succeeds');
select race_test.ok((select outcome = 'NO_SLOT_AVAILABLE' from race_override_dns(race_test.rid('ev_d11'), 'Also recovered')), 'dns: the SECOND override → NO SLOT AVAILABLE (one overflow slot per heat)');
reset role;
select race_test.ok((select race_status = 'LATE_CHECK_IN' from race_registrations where id = race_test.rid('ev_d10')) and (select race_status = 'MISSED_START' from race_registrations where id = race_test.rid('ev_d11')),
  'dns: d10 is back in as a LATE check-in; d11 stays DNS');
select race_test.ok((select status = 'SKIPPED' from race_start_slots where id = race_test.id('d_s1')) and (select status = 'SKIPPED' from race_start_slots where id = race_test.id('d_s2')), 'dns: skipped slots stay SKIPPED — never reused, nobody moved into them');
select race_test.ok((select registration_id = race_test.rid('ev_d9') and status = 'STARTED' from race_start_slots where slot_index = 0 and heat_id = (select id from race_heats where event_id = race_test.id('ev_d') and number = 3)), 'dns: the athlete already in slot 0 (d9) keeps it and has started');
select race_test.ok((select type = 'DNS_OVERRIDE' and reason = 'Athlete recovered and is at the start line' and corrected_by = race_test.id('bm_a') from race_check_in_corrections where new_registration_id = race_test.rid('ev_d10')), 'dns: ledger row with reason and user');
select race_test.ok(exists (select 1 from race_audit_log where action = 'race.dns_override' and target_id in (select id from race_check_in_corrections where new_registration_id = race_test.rid('ev_d10'))), 'audit: the override is logged');
-- d10 gets the overflow slot only when it is due (anchor 0:42:00 + 3 × 3:30 = start 0:52:30)
select race_sim.travel_to(race_test.id('ev_d'), 3100000);
select race_advance_core(race_test.id('ev_d'));
select race_test.ok((select status = 'BOUND' and slot_index = 3 and is_overflow from race_start_slots where registration_id = race_test.rid('ev_d10') and status in ('BOUND', 'STARTED')), 'dns: d10 is bound to the overflow slot (index 3, start 0:52:30)');
select race_sim.travel_to(race_test.id('ev_d'), 3160000);
select race_advance_core(race_test.id('ev_d'));
select race_test.ok((select race_status = 'STARTED' from race_registrations where id = race_test.rid('ev_d10')), 'dns: … and d10 starts at exactly their slot time');
select race_test.ok(race_sim.invariants_hold(race_test.id('ev_d'), 3160000), 'invariants: no station overlap and every window matches its slot after all corrections');
