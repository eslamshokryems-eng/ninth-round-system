-- THE NINTH League — the owner-supplied PROVISIONAL rules, proven against the real functions: points table, ties, membership at registration + documented
-- eligibility decisions, 3 attempts / best approved counts, absence, judge correction REQUESTS vs administrator corrections, appeals. Throw-away database only.
reset role;
select race_test.use_gate();      -- the API's request carries the gate secret (see suite 34)
create function race_test.pts(p_participant text, p_challenge text) returns bigint language sql stable as $$
  select coalesce(sum(points_cents), 0) from race_league_points_ledger where participant_id = race_test.id(p_participant) and challenge_id = race_test.id(p_challenge) $$;
create function race_test.recorded(p_challenge text, p_participant text, p_value numeric, p_who text default null) returns uuid language plpgsql as $$
declare v uuid; begin v := (race_league_record_attempt(race_test.id(p_challenge), race_test.id(p_participant), p_value, null, gen_random_uuid()) ->> 'id')::uuid; return v; end $$;

select race_test.login('lg_admin');
select race_test.put('s3', race_league_create_season('season-rules', 'Rules Season', date '2026-11-02', date '2026-12-27'));
select race_league_set_season_status(race_test.id('s3'), 'scheduled');
select race_test.throws($$select race_league_set_season_status(race_test.id('s3'), 'active')$$, 'two independent league administrators', 'two administrators: a season with one administrator cannot be activated');
select race_test.throws($$select race_league_set_published(race_test.id('s3'), true, 'preview')$$, 'two independent league administrators', 'two administrators: a season with one administrator cannot be published');
reset role;
insert into race_league_staff (season_id, profile_id, role) values
  (race_test.id('s3'), race_test.id('lg_judge'), 'JUDGE'), (race_test.id('s3'), race_test.id('lg_rev'), 'REVIEWER');
select race_test.login('super');
select race_league_set_staff(race_test.id('s3'), race_test.id('lg_admin_b'), 'LEAGUE_ADMIN', true, 'test reason');
select race_test.login('lg_admin');
select race_test.throws($$select race_league_set_staff(race_test.id('s3'), race_test.id('lg_judge2'), 'LEAGUE_ADMIN', true, 'test reason')$$, 'LEAGUE_FORBIDDEN', 'two administrators: only a Super Admin appoints a league administrator'); 

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- rule 1 + 4: the default rules are the owner's, and remain configurable
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.eq(race_test.q('select rules -> ''points'' from race_league_seasons where id = ''' || race_test.id('s3') || ''''),
  '{"absent": 0, "beyond": 40, "by_rank": [100, 90, 80, 75, 70, 65, 60, 55, 50], "participation": 40}', 'rule 1: a new season starts with the owner''s points table (100..50, then 40, absence 0)');
select race_test.eq(race_test.q('select rules ->> ''appeal_window_hours'' from race_league_seasons where id = ''' || race_test.id('s3') || ''''), '48', 'rule 7: the appeal window defaults to 48 hours');
select race_test.eq(race_test.q('select rules ->> ''tie_policy'' from race_league_seasons where id = ''' || race_test.id('s3') || ''''), 'SHARE', 'rule 2: equal results share rank and points by default');
select race_test.login('lg_admin');
select race_test.eq(race_league_admin_overview(race_test.id('s3')) -> 'season' -> 'rules',
  '{"points": {"absent": 0, "beyond": 40, "byRank": [100, 90, 80, 75, 70, 65, 60, 55, 50], "participation": 40}, "tiePolicy": "SHARE", "eligibility": "AT_REGISTRATION", "absencePolicy": "ZERO", "appealWindowHours": 48}'::jsonb,
  'the staff overview returns the rules in the shape the screens read (camelCase)');
select race_test.throws($$select race_league_update_rules(race_test.id('s3'), '{"points":{"by_rank":[100,90],"beyond":40,"participation":40,"absent":0},"tie_policy":"SHARE","absence_policy":"ZERO","eligibility":"AT_REGISTRATION","appeal_window_hours":0}', 'bad window')$$, 'appeal window', 'an appeal window of 0 hours is refused');
select race_test.throws($$select race_league_update_rules(race_test.id('s3'), '{"points":{"by_rank":[100,90],"beyond":40,"participation":40,"absent":0},"tie_policy":"SHARE","absence_policy":"ZERO","eligibility":"AT_REGISTRATION","appeal_window_hours":721}', 'bad window')$$, 'appeal window', 'an appeal window above 720 hours is refused');
select race_test.put('w1', race_league_upsert_challenge(race_test.id('s3'), 1, '{"name":"Max push-ups","metric_kind":"REPS","unit":"reps","requires_verification":false}'));
select race_test.put('w2', race_league_upsert_challenge(race_test.id('s3'), 2, '{"name":"Plank hold","metric_kind":"TIME","unit":"s","direction":"HIGHER_WINS","requires_verification":true}'));
select race_test.eq(race_test.q('select max_attempts || '':'' || counting from race_league_challenges where id = ''' || race_test.id('w1') || ''''), '3:BEST', 'rule 4: a challenge defaults to 3 attempts, the best counts');
select race_test.eq(race_test.q('select metric_kind || '':'' || direction from race_league_challenges where id = ''' || race_test.id('w2') || ''''), 'TIME:HIGHER_WINS', 'rule 4: a time challenge may rank the LONGER time first (direction is per challenge)');
select race_test.throws($$select race_league_upsert_challenge(race_test.id('s3'), 3, '{"name":"Bad unit","metric_kind":"TIME","unit":"kg"}')$$, 'race_league_challenges_metric', 'rule 4: the unit list stays closed per metric kind');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- rule 3 + 8: membership attestation at registration (manual or CSV adapter); no gym database
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.throws($$select race_league_add_participant(race_test.id('s3'), 'No Attest')$$, 'LEAGUE_NOT_ELIGIBLE', 'rule 3: registration without a membership attestation is refused (the default is NOT verified)');
select race_test.throws($$select race_league_add_participant(race_test.id('s3'), 'Expired Member', 'M-X', false)$$, 'LEAGUE_NOT_ELIGIBLE', 'rule 3: an expired / unverified membership cannot register');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_add_participant(race_test.id('s3'), 'Judge Added', null, true)$$, 'LEAGUE_FORBIDDEN', 'rule 3: a judge cannot register participants');
select race_test.login('lg_admin');
select race_test.eq((race_league_import_participants(race_test.id('s3'), (
   select jsonb_agg(jsonb_build_object('display_name', 'Athlete ' || lpad(g::text, 2, '0'), 'external_ref', 'R-' || g, 'membership_verified', true)) from generate_series(1, 11) g
   ) || '[{"display_name":"Expired E.","external_ref":"R-90","membership_verified":false},{"display_name":"Unattested U.","external_ref":"R-91"},{"display_name":"Text T.","external_ref":"R-92","membership_verified":"yes"}]'::jsonb) ->> 'added')::int,
   11, 'rule 3/8: the import registers only rows with membership_verified = true (false, missing and non-boolean are refused)');
select race_test.eq(jsonb_array_length(race_league_import_participants(race_test.id('s3'), '[{"display_name":"Expired E.","external_ref":"R-90","membership_verified":false}]') -> 'issues'), 1, 'rule 3: the refused row is reported');
reset role;
select race_test.eq(race_test.q('select count(*) from race_league_participants where season_id = ''' || race_test.id('s3') || '''')::int, 11, 'rule 3: exactly the eleven attested members are registered');
select race_test.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'race\_league\_%' and (p.prosrc ~* 'race_(members|gym|profiles_members)' or p.prosrc ~* 'membership_(end|expir)')), 'rule 8: no league function reads a gym or membership-expiry table');
do $$ declare i int; begin
  for i in 1..11 loop perform race_test.put('p' || i, (select id from race_league_participants where season_id = race_test.id('s3') and display_name = 'Athlete ' || lpad(i::text, 2, '0'))); end loop;
end $$;

select race_test.login('lg_admin');
select race_league_set_season_status(race_test.id('s3'), 'active');
select race_league_set_challenge_status(race_test.id('w1'), 'published');
select race_league_set_challenge_status(race_test.id('w1'), 'open');
select race_league_set_challenge_status(race_test.id('w2'), 'published');
select race_league_set_challenge_status(race_test.id('w2'), 'open');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- week 1: eleven distinct results (no verification) → 100, 90, 80, 75, 70, 65, 60, 55, 50, 40, 40
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_judge');
do $$ declare i int; begin
  for i in 1..11 loop perform race_test.recorded('w1', 'p' || i, 120 - i * 5); end loop;
end $$;
select race_test.login('lg_admin');
select race_league_set_challenge_status(race_test.id('w1'), 'closed');
reset role;
select race_test.eq((select string_agg((race_test.pts('p' || g, 'w1') / 100)::text, ',' order by g) from generate_series(1, 11) g), '100,90,80,75,70,65,60,55,50,40,40', 'rule 1: ranks 1-9 earn the table, every other approved result earns 40');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- week 2: 3 attempts, best APPROVED counts, ties share rank and points, absence earns nothing
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_judge');
select race_test.put('ra1', race_test.recorded('w2', 'p1', 40));
select race_test.put('ra2', race_test.recorded('w2', 'p1', 80));   -- better, but will be rejected
select race_test.put('ra3', race_test.recorded('w2', 'p1', 60));
select race_test.throws($$select race_test.recorded('w2', 'p1', 99)$$, 'LEAGUE_ATTEMPT_LIMIT', 'rule 4: a fourth attempt is refused');
select race_test.put('ra4', race_test.recorded('w2', 'p2', 50));
select race_test.put('ra5', race_test.recorded('w2', 'p3', 50));
select race_test.put('ra6', race_test.recorded('w2', 'p4', 20));
select race_test.login('lg_rev');
select race_league_review_attempt(race_test.id('ra1'), 'approve');
select race_league_review_attempt(race_test.id('ra2'), 'reject', 'hands moved during the hold');
select race_league_review_attempt(race_test.id('ra3'), 'approve');
select race_league_review_attempt(race_test.id('ra4'), 'approve');
select race_league_review_attempt(race_test.id('ra5'), 'approve');
select race_league_review_attempt(race_test.id('ra6'), 'approve');
select race_test.login('lg_admin');
select race_league_set_challenge_status(race_test.id('w2'), 'closed');
reset role;
select race_test.eq((select string_agg((race_test.pts('p' || g, 'w2') / 100)::text, ',' order by g) from generate_series(1, 4) g), '100,90,90,75', 'rule 2/4: best approved attempt (60, not the rejected 80) wins; equal results share rank and points (1,2,2,4)');
select race_test.eq((select string_agg(rank::text, ',' order by participant_id) from (select distinct on (participant_id) participant_id, rank from race_league_points_ledger where challenge_id = race_test.id('w2') order by participant_id, seq desc) z where participant_id in (race_test.id('p2'), race_test.id('p3'))), '2,2', 'rule 2: tied results carry the same rank');
select race_test.eq((select count(*) from race_league_points_ledger where challenge_id = race_test.id('w2'))::int, 4, 'rule 5: the seven absent participants get no ledger line (0 points)');
select race_test.eq(race_test.pts('p8', 'w2'), 0::bigint, 'rule 5: an absent participant earns 0');
select race_test.anon();
select race_test.eq((race_league_public_challenge_results('season-rules', 2) ->> 'available')::boolean, false, 'an unpublished season shows nothing publicly');

-- equal SEASON totals stay a tie
select race_test.login('lg_admin');
select race_test.eq((select (r ->> 'totalPoints')::numeric from jsonb_array_elements(race_league_admin_overview(race_test.id('s3')) -> 'standings') r where r ->> 'displayName' = 'Athlete 10'), 40.00, 'rule 1: Athlete 10 has 40 + 0');
select race_test.eq((select (r ->> 'totalPoints')::numeric from jsonb_array_elements(race_league_admin_overview(race_test.id('s3')) -> 'standings') r where r ->> 'displayName' = 'Athlete 11'), 40.00, 'rule 1: Athlete 11 has 40 + 0');
select race_test.eq((select string_agg((r ->> 'rank') || ':' || (r ->> 'tied'), ',' order by r ->> 'displayName') from jsonb_array_elements(race_league_admin_overview(race_test.id('s3')) -> 'standings') r where r ->> 'displayName' in ('Athlete 10', 'Athlete 11')),
  '10:true,10:true', 'rule 2: equal season totals share a rank and are flagged as a tie (no tie-break is invented)');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- rule 3: eligibility is kept; only a documented DISCIPLINARY / FRAUD decision removes it
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_judge');
select race_test.throws($$select race_league_set_eligibility(race_test.id('p5'), false, 'FRAUD', 'x')$$, 'LEAGUE_FORBIDDEN', 'rule 3: a judge cannot restrict a participant');
select race_test.login('lg_admin');
select race_test.throws($$select race_league_set_eligibility(race_test.id('p5'), false, 'FRAUD', '   ')$$, 'LEAGUE_REASON_REQUIRED', 'rule 3: a restriction needs a documented reason');
select race_test.throws($$select race_league_set_eligibility(race_test.id('p5'), false, 'MEMBERSHIP_EXPIRED', 'lapsed')$$, 'unknown decision type', 'rule 3: a lapsed membership is not a ground');
select race_test.throws($$select race_league_set_eligibility(race_test.id('p5'), true, 'FRAUD', 'no change')$$, 'LEAGUE_INVALID', 'rule 3: a reinstatement cannot be recorded as fraud');
select race_test.throws($$select race_league_set_eligibility(race_test.id('p5'), true, 'REINSTATEMENT', 'already eligible')$$, 'already has that eligibility', 'rule 3: no-op decisions are refused');
select race_league_set_eligibility(race_test.id('p5'), false, 'FRAUD', 'result invented — case DC-12');
reset role;
select race_test.eq(race_test.pts('p5', 'w1'), 0::bigint, 'rule 3: a fraud decision reverses the points by an append-only reversal');
select race_test.eq((select count(*) from race_league_eligibility_decisions where participant_id = race_test.id('p5') and category = 'FRAUD' and not new_eligible and previous_eligible)::int, 1, 'rule 3: the decision is recorded (category, previous, new, reason, who)');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.participant.eligibility' and metadata ->> 'category' = 'FRAUD'), 'rule 3: the decision is audited');
select race_test.throws($$update race_league_eligibility_decisions set reason = 'edited'$$, 'append|immutable|not allowed', 'rule 3: decisions cannot be edited');
select race_test.login('lg_admin');
select race_league_set_eligibility(race_test.id('p5'), true, 'REINSTATEMENT', 'decision overturned on review');
reset role;
select race_test.eq(race_test.pts('p5', 'w1'), 7000::bigint, 'rule 3: a reinstatement restores the points');
select race_test.login('lg_judge');
select race_test.eq(jsonb_array_length(race_league_admin_overview(race_test.id('s3')) -> 'eligibilityDecisions'), 0, 'rule 3: a judge does not see eligibility decisions');
select race_test.login('lg_admin');
select race_test.eq(jsonb_array_length(race_league_admin_overview(race_test.id('s3')) -> 'eligibilityDecisions'), 2, 'rule 3: the administrator sees both decisions');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- rule 6: judges REQUEST, administrators CORRECT
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_judge');
select race_test.throws($$select race_league_correct_attempt(race_test.id('ra6'), 55, 'typo')$$, 'LEAGUE_FORBIDDEN', 'rule 6: a judge cannot change an approved result');
select race_test.throws($$select race_league_apply_correction(race_test.id('ra6'), 55, 'typo', null)$$, 'permission denied', 'rule 6: the internal correction function is not callable by a client');
select race_test.throws($$select race_league_decide_correction_request(gen_random_uuid(), 'apply', 'x')$$, 'LEAGUE_FORBIDDEN|LEAGUE_NOT_FOUND', 'rule 6: a judge cannot decide a request');
select race_test.throws($$select race_league_request_correction(race_test.id('ra6'), 55, '')$$, 'LEAGUE_REASON_REQUIRED', 'rule 6: a request needs a reason');
select race_test.throws($$select race_league_request_correction(race_test.id('ra6'), -4, 'bad')$$, 'LEAGUE_INVALID', 'rule 6: a request is validated like a result');
select race_test.put('rr1', race_league_request_correction(race_test.id('ra6'), 55, 'tally sheet shows 55 seconds'));
select race_test.eq(race_test.q('select value from race_league_attempts where id = ''' || race_test.id('ra6') || ''''), '20.000', 'rule 6: a request changes nothing by itself');
select race_test.throws($$select race_league_request_correction(race_test.id('ra6'), 56, 'again')$$, 'LEAGUE_DUPLICATE', 'rule 6: one pending request per result');
select race_test.login('lg_rev');
select race_test.throws($$select race_league_request_correction(race_test.id('ra6'), 55, 'x')$$, 'LEAGUE_FORBIDDEN', 'rule 6: a reviewer cannot request');
select race_test.login('lg_plain');
select race_test.throws($$select race_league_request_correction(race_test.id('ra6'), 55, 'x')$$, 'LEAGUE_FORBIDDEN', 'rule 6: a plain account cannot request');
select race_test.login('lg_judge');
select race_test.put('rr2', race_league_request_correction(race_test.id('ra3'), 90, 'I think it was 90'));
select race_test.login('lg_admin');

-- the administrator decides: decline one, apply the other
select race_test.throws($$select race_league_decide_correction_request(race_test.id('rr1'), 'apply', '')$$, 'LEAGUE_REASON_REQUIRED', 'rule 6: a decision needs a reason');
select race_test.throws($$select race_league_decide_correction_request(race_test.id('rr1'), 'maybe', 'x')$$, 'LEAGUE_INVALID', 'rule 6: only apply or decline');
select race_league_decide_correction_request(race_test.id('rr2'), 'decline', 'the tally sheet says 60');
reset role;
select race_test.eq(race_test.q('select value from race_league_attempts where id = ''' || race_test.id('ra3') || ''''), '60.000', 'rule 6: a declined request changes nothing');
select race_test.eq(race_test.pts('p1', 'w2'), 10000::bigint, 'rule 6: a declined request leaves the points alone');
select race_test.login('lg_admin_b');
select race_test.eq((race_league_decide_correction_request(race_test.id('rr1'), 'apply', 'tally sheet confirms 55 seconds') ->> 'ledgerLines')::int > 0, true, 'rule 6: an applied request re-scores by appending');
reset role;
select race_test.eq(race_test.pts('p4', 'w2'), 9000::bigint, 'rule 6: Athlete 04 (now 55 s) moves to rank 2');
select race_test.eq(race_test.pts('p2', 'w2'), 8000::bigint, 'rule 6: the tied pair moves to rank 3');
select race_test.eq((select previous_value || '>' || new_value from race_league_corrections where request_id = race_test.id('rr1')), '20.000>55.000', 'rule 6: the record keeps the previous and the new value');
select race_test.eq((select actor from race_league_corrections where request_id = race_test.id('rr1')), race_test.id('lg_admin_b'), 'rule 6: the record keeps the administrator who applied it');
select race_test.ok((select at from race_league_corrections where request_id = race_test.id('rr1')) > now() - interval '5 minutes', 'rule 6: the record keeps the time');
select race_test.eq((select reason from race_league_corrections where request_id = race_test.id('rr1')), 'tally sheet confirms 55 seconds', 'rule 6: the record keeps the reason');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.attempt.correct' and metadata ->> 'season_id' = race_test.id('s3')::text and (metadata ->> 'previous_value')::numeric = 20 and (metadata ->> 'new_value')::numeric = 55), 'rule 6: audited with previous and new value');
select race_test.eq((select status || ':' || (decided_by = race_test.id('lg_admin_b'))::text from race_league_correction_requests where id = race_test.id('rr1')), 'applied:true', 'rule 6: the request is closed as applied by the administrator');
select race_test.throws($$update race_league_corrections set reason = 'edited'$$, 'append|immutable|not allowed', 'rule 6: corrections cannot be edited');
select race_test.login('lg_admin_b');
select race_test.throws($$select race_league_decide_correction_request(race_test.id('rr1'), 'decline', 'again')$$, 'already been decided', 'rule 6: a request is decided once');
select race_test.eq(jsonb_array_length(race_league_admin_overview(race_test.id('s3')) -> 'corrections'), 1, 'rule 6: the administrator sees the correction record');
select race_test.login('lg_judge');
select race_test.eq(jsonb_array_length(race_league_admin_overview(race_test.id('s3')) -> 'corrections'), 0, 'rule 6: a judge does not see the correction records');
select race_test.eq(jsonb_array_length(race_league_admin_overview(race_test.id('s3')) -> 'correctionRequests'), 2, 'rule 6: a judge can follow up on the requests');

-- ---------------------------------------------------------------------------------------------------------------------------------------------
-- rule 7: appeals
-- ---------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('lg_judge');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), race_test.id('p6'), 'my count was higher')$$, 'LEAGUE_APPEAL_CLOSED', 'rule 7: nothing to appeal until the season is published');
select race_test.login('lg_admin');
select race_league_set_published(race_test.id('s3'), true, 'week 1 and 2 results are public');
select race_test.anon();
select race_test.eq(jsonb_array_length(race_league_public_challenge_results('season-rules', 2) -> 'results'), 4, 'rule 5: only the four participants with an approved valid result are ranked');
select race_test.ok(not exists (select 1 from jsonb_array_elements(race_league_public_challenge_results('season-rules', 2) -> 'results') r where r ->> 'displayName' = 'Athlete 08'), 'rule 5: an absent participant is not in the public challenge ranking');
select race_test.login('lg_plain');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), race_test.id('p6'), 'x')$$, 'LEAGUE_FORBIDDEN', 'rule 7: a plain account cannot lodge an appeal');
select race_test.anon();
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), race_test.id('p6'), 'x')$$, 'permission denied', 'rule 7: anon cannot lodge an appeal');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), race_test.id('p6'), '')$$, 'LEAGUE_REASON_REQUIRED', 'rule 7: an appeal needs a reason');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), '00000000-0000-0000-0000-000000000001', 'x')$$, 'LEAGUE_NOT_FOUND', 'rule 7: unknown participant');
select race_test.put('ap1', race_league_lodge_appeal(race_test.id('w1'), race_test.id('p6'), 'SECRET-APPEAL-TEXT: I counted 70 not 65'));
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), race_test.id('p6'), 'again')$$, 'LEAGUE_DUPLICATE', 'rule 7: one appeal per participant per result');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap1'), 'upheld', 'x')$$, 'LEAGUE_FORBIDDEN', 'rule 7: a judge cannot decide an appeal');
select race_test.login('lg_rev');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap1'), 'dismissed', 'x')$$, 'LEAGUE_FORBIDDEN', 'rule 7: a reviewer cannot decide an appeal');
-- an administrator who recorded part of the result cannot review its appeal: lg_admin corrects Athlete 06's week-1 result
select race_test.login('lg_admin');
select race_league_correct_attempt((select race_test.q('select id from race_league_attempts where challenge_id = ''' || race_test.id('w1') || ''' and participant_id = ''' || race_test.id('p6') || ''' and status = ''approved'' limit 1')::uuid), 90, 'recount after video review');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap1'), 'upheld', 'x')$$, 'LEAGUE_CONFLICT_OF_INTEREST', 'rule 7: the administrator who recorded (here: corrected) the result cannot review its appeal');
reset role;
create table race_test.ledger_before as select count(*) n, coalesce(sum(points_cents), 0) total from race_league_points_ledger where season_id = race_test.id('s3');
select race_test.login('lg_admin_b');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap1'), 'upheld', '')$$, 'LEAGUE_REASON_REQUIRED', 'rule 7: a decision needs a reason');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap1'), 'perhaps', 'x')$$, 'LEAGUE_INVALID', 'rule 7: only upheld or dismissed');
select race_league_decide_appeal(race_test.id('ap1'), 'upheld', 'video supports a recount — see correction');
reset role;
select race_test.eq((select status || ':' || (decided_by = race_test.id('lg_admin_b'))::text || ':' || decision_reason from race_league_appeals where id = race_test.id('ap1')), 'upheld:true:video supports a recount — see correction', 'rule 7: the decision, the decider and the reason are recorded');
select race_test.ok((select count(*) = (select n from race_test.ledger_before) and coalesce(sum(points_cents), 0) = (select total from race_test.ledger_before) from race_league_points_ledger where season_id = race_test.id('s3')), 'rule 7: deciding an appeal changes no score (the ledger is identical)');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.appeal.upheld' and metadata ->> 'season_id' = race_test.id('s3')::text), 'rule 7: the decision is audited');
select race_test.ok(exists (select 1 from race_audit_log where action = 'league.appeal.lodge' and metadata ->> 'season_id' = race_test.id('s3')::text), 'rule 7: the appeal is audited');
select race_test.login('lg_admin_b');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap1'), 'dismissed', 'again')$$, 'already been decided', 'rule 7: an appeal is decided once');
-- privacy: a participant's own words are for administrators
select race_test.eq(jsonb_array_length(race_league_admin_overview(race_test.id('s3')) -> 'appeals'), 1, 'rule 7: the administrator sees the appeal');
select race_test.login('lg_judge');
select race_test.eq(jsonb_array_length(race_league_admin_overview(race_test.id('s3')) -> 'appeals'), 0, 'rule 7: a judge does not see appeals');
select race_test.anon();
select race_test.ok(position('SECRET-APPEAL-TEXT' in (race_league_public_season('season-rules')::text || race_league_public_challenge_results('season-rules', 1)::text || race_league_public_participant('season-rules', race_test.q('select public_id from race_league_participants where id = ''' || race_test.id('p6') || ''''))::text)) = 0,
   'rule 7: appeal text never reaches a public read');

-- a removed (voided) result leaves no replacement attempt, but the administrator who removed it is still conflicted
select race_test.login('lg_judge');
select race_test.put('ap3', race_league_lodge_appeal(race_test.id('w1'), race_test.id('p9'), 'my result was removed by mistake'));
select race_test.login('lg_admin');
select race_league_correct_attempt((select race_test.q('select id from race_league_attempts where challenge_id = ''' || race_test.id('w1') || ''' and participant_id = ''' || race_test.id('p9') || ''' and status = ''approved'' limit 1')::uuid), null, 'recorded for the wrong athlete');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap3'), 'dismissed', 'x')$$, 'LEAGUE_CONFLICT_OF_INTEREST', 'rule 7: the administrator who REMOVED the result is conflicted too');
select race_test.login('lg_admin_b');
select race_league_decide_appeal(race_test.id('ap3'), 'upheld', 'the removal was a mistake — a separate correction follows');
-- two administrators: a live season never drops below two
select race_test.login('super');
select race_test.throws($$select race_league_set_staff(race_test.id('s3'), race_test.id('lg_admin_b'), 'LEAGUE_ADMIN', false, 'test reason')$$, 'two independent league administrators', 'two administrators: removing one from a live season is refused');

-- the window: 48 hours from publication (whichever of closing / publishing came last), configurable
reset role;
update race_league_challenges set closed_at = closed_at - interval '50 hours' where id = race_test.id('w1');
update race_league_seasons set first_published_at = first_published_at - interval '50 hours' where id = race_test.id('s3');
update race_league_challenges set closed_at = clock_timestamp() - interval '47 hours' where id = race_test.id('w2');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), race_test.id('p7'), 'late')$$, 'LEAGUE_APPEAL_CLOSED', 'rule 7: 50 hours after publication the window is closed');
select race_test.put('ap2', race_league_lodge_appeal(race_test.id('w2'), race_test.id('p4'), 'inside the window at 47 hours'));
select race_test.ok(true, 'rule 7: 47 hours after publication an appeal is still accepted');
select race_test.login('lg_admin');
select race_league_update_rules(race_test.id('s3'), race_test.q('select rules::text from race_league_seasons where id = ''' || race_test.id('s3') || '''')::jsonb || '{"appeal_window_hours": 24}'::jsonb, 'shorter pilot window');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w2'), race_test.id('p3'), 'late under the 24 hour rule')$$, 'LEAGUE_APPEAL_CLOSED', 'rule 7: the window is a season rule — 24 hours now applies');

-- completion waits for open requests and appeals; afterwards everything is final
select race_test.login('lg_admin_b');
select race_test.throws($$select race_league_set_season_status(race_test.id('s3'), 'completed')$$, 'appeals have not been decided', 'rule 7: a season cannot complete with an undecided appeal');
select race_test.throws($$select race_league_decide_appeal(race_test.id('ap2'), 'dismissed', 'x')$$, 'LEAGUE_CONFLICT_OF_INTEREST', 'rule 7: lg_admin_b applied the correction on this result, so it cannot review the appeal either');
select race_test.login('lg_admin');
select race_league_decide_appeal(race_test.id('ap2'), 'dismissed', 'the corrected result stands');
select race_test.login('lg_admin_b');
select race_test.login('lg_judge');
select race_test.put('rr3', race_league_request_correction(race_test.id('ra5'), 51, 'maybe 51'));
select race_test.login('lg_admin_b');
select race_test.throws($$select race_league_set_season_status(race_test.id('s3'), 'completed')$$, 'correction requests have not been decided', 'rule 6: a season cannot complete with an undecided correction request');
select race_league_decide_correction_request(race_test.id('rr3'), 'decline', 'no evidence');
select race_league_set_season_status(race_test.id('s3'), 'completed');
select race_test.login('lg_judge');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('w1'), race_test.id('p8'), 'after completion')$$, 'LEAGUE_SEASON_LOCKED', 'a completed season takes no appeals');
select race_test.throws($$select race_league_request_correction(race_test.id('ra5'), 52, 'after completion')$$, 'LEAGUE_SEASON_LOCKED', 'a completed season takes no correction requests');
reset role;
select race_test.throws($$delete from race_league_appeals$$, 'never deleted|not allowed|forbid', 'appeals are never deleted');
select race_test.throws($$delete from race_league_correction_requests$$, 'never deleted|not allowed|forbid', 'correction requests are never deleted');
select race_test.throws($$update race_league_appeals set decision_reason = 'rewritten' where id = race_test.id('ap1')$$, 'LEAGUE_SEASON_LOCKED', 'a completed season''s appeals are final');
