-- Lifecycle gating (H-1), coach authorization, and the duplicate-
-- original-submission guard, for the Phase 3 model: the participant is
-- an ordinary customer profile (already registered in 45_registration_
-- and_branch_selection.sql — real identity resolved via auth.uid() there,
-- never a members lookup), and coach authorization is exclusively
-- designate_challenge_coach() — no automatic resolution exists any more.
\set ON_ERROR_STOP off
select id as challenge_id from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
select id as p_participant_id from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset

\echo '=== H-1: challenge not yet active (still registration_open) -> submit_challenge_result must be rejected regardless of coach designation ==='
select status from challenges where id = :'challenge_id';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, not yet designated
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 42, 'reps', now());
reset role;

update challenges set status = 'active' where id = :'challenge_id';

\echo '=== submit before any coach is designated -> rejected (NO_COACH_DESIGNATED) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 42, 'reps', now());
reset role;

\echo '=== branch_manager designates Coach One for Alex -> succeeds ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'p_participant_id', '00000000-0000-0000-0000-000000000003', 'Assigning Alex''s coach.');
reset role;

\echo '=== challenge now active, coach designated -> submit by the designated coach succeeds (result A) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 42, 'reps', now()) \gset a_
reset role;
\echo 'CONFIRM: result A id=' :a_result_id

\echo '=== coach authorization: a DIFFERENT coach (not designated) attempts to submit -> rejected (wrong-coach reason, not duplicate-original) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Coach Two, NOT designated for Alex
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 50, 'reps', now());
reset role;

\echo '=== NEW GUARD: the designated coach attempts a SECOND submission while result A is still pending -> must be rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 43, 'reps', now());
reset role;

\echo '=== branch_manager rejects result A with a reason ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select reject_challenge_result(:'a_result_id', 'Measurement looks implausible.');
reset role;
select status as confirm_a_status from challenge_results where id = :'a_result_id' \gset
\echo 'CONFIRM: result A status=' :confirm_a_status ' (expect rejected)'

\echo '=== REQUIREMENT: a rejected submission still allows a fresh resubmission ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 44, 'reps', now()) \gset b_
reset role;
\echo 'CONFIRM: resubmission after rejection succeeded, result B id=' :b_result_id

\echo '=== branch_manager approves result B (not its own author) -> success, triggers recompute ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select approve_challenge_result(:'b_result_id', 'Confirmed.');
reset role;
select status as confirm_b_status from challenge_results where id = :'b_result_id' \gset
\echo 'CONFIRM: result B status=' :confirm_b_status ' (expect approved)'

\echo '=== NEW GUARD primary case: a fresh ORIGINAL submission is rejected once an approved current result (B) already exists ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 45, 'reps', now());
reset role;

\echo '=== REQUIREMENT: the correction workflow still works once an original (B) is approved ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- still the designated coach
select * from request_challenge_result_correction(:'b_result_id', 60, 'reps', now()) \gset corr_
reset role;
\echo 'CONFIRM: correction request succeeded, result id=' :corr_result_id

\echo '=== branch_manager approves the correction -> success, original superseded, duplicate-original guard still correctly sees ONE live chain ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select approve_challenge_result_correction(:'corr_result_id', 'Confirmed with review.');
reset role;
select superseded_by_result_id as confirm_superseded_by from challenge_results where id = :'b_result_id' \gset
\echo 'CONFIRM: original B superseded_by=' :confirm_superseded_by ' (expect the correction''s id)'
select status as confirm_corr_status from challenge_results where id = :'corr_result_id' \gset
\echo 'CONFIRM: correction status=' :confirm_corr_status ' (expect approved)'

\echo '=== NEW GUARD still fires after a correction was approved: a brand new ORIGINAL submission must still be rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a1', 70, 'reps', now());
reset role;
