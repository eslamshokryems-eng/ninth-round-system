-- Regression: submit_challenge_result() must require an AUTHENTICATED,
-- ACTIVE, AUTHORIZED actor — fixed in
-- 20261108000001_submit_result_requires_active_authorized_coach.sql.
--
-- Before the fix the function authorized EXCLUSIVELY by identity
-- (`designated_coach_id = auth.uid()`), with no role and no active-status
-- check, so a coach deactivated moments earlier kept full submission
-- rights for the remaining life of their access token; and because
-- `<>` against a NULL auth.uid() evaluates to NULL (not true), the
-- identity gate itself was skipped for a caller with no identity.
--
-- This file builds its OWN isolated fixture — a fresh BRANCH-scope
-- challenge with three fresh participants — so none of these assertions
-- depend on, or disturb, the result chains that 50/60/80/95 leave behind.
-- Deactivation is simulated exactly as production does it
-- (profiles.is_active = false) and every account is restored before the
-- file ends, so repeat runs are unaffected.
\set ON_ERROR_STOP off
select id as season_id from challenge_seasons limit 1 \gset

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
\echo '=== fixture: branch_manager creates a fresh BRANCH-scope challenge (no eligibility rules, so all three customers qualify) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, branch_manager of Branch B
select * from create_challenge(
  :'season_id', 'Active Coach Guard Challenge', null, 'strength', 'boxing', 'BRANCH', '00000000-0000-0000-0000-00000000000b',
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3,
  now() - interval '1 hour', now() + interval '1 day', now() + interval '2 days', now() + interval '9 days'
) \gset new_
reset role;
\echo 'CONFIRM: (fixture) new challenge id=' :new_challenge_id

update challenges set status = 'registration_open' where id = :'new_challenge_id';

\echo '=== fixture: Alex, Drew and Casey register for their own branch ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select participant_profile_id, status from request_challenge_participation(:'new_challenge_id', '00000000-0000-0000-0000-00000000000b');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select participant_profile_id, status from request_challenge_participation(:'new_challenge_id', '00000000-0000-0000-0000-00000000000b');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select participant_profile_id, status from request_challenge_participation(:'new_challenge_id', '00000000-0000-0000-0000-00000000000b');
reset role;

select count(*) as confirm_registered from challenge_participants
  where challenge_id = :'new_challenge_id' and status = 'approved' \gset
\echo 'CONFIRM: (fixture) approved participants=' :confirm_registered '(expect 3)'

select id as alex_participant_id from challenge_participants
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
select id as drew_participant_id from challenge_participants
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
select id as casey_participant_id from challenge_participants
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset

\echo '=== fixture: branch_manager designates Coach One for all three participants ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'alex_participant_id', '00000000-0000-0000-0000-000000000003', 'Alex''s coach.');
select designate_challenge_coach(:'drew_participant_id', '00000000-0000-0000-0000-000000000003', 'Drew''s coach.');
select designate_challenge_coach(:'casey_participant_id', '00000000-0000-0000-0000-000000000003', 'Casey''s coach.');
reset role;

update challenges set status = 'active' where id = :'new_challenge_id';

-- ---------------------------------------------------------------------------
-- (1) POSITIVE: an active, correctly assigned coach can submit
-- ---------------------------------------------------------------------------
\echo '=== (1) ACTIVE, correctly assigned coach submits for Alex -> must SUCCEED (BRANCH scope, so is_branch_staff() is genuinely exercised in the ALLOW direction) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, active, Branch B, designated
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a1', 40, 'reps', now()) \gset t1_
reset role;
select status as confirm_t1_status, entered_by_profile_id as confirm_t1_author
  from challenge_results where id = :'t1_result_id' \gset
\echo 'CONFIRM: (1) active coach submitted, status=' :confirm_t1_status 'entered_by=' :confirm_t1_author

-- ---------------------------------------------------------------------------
-- (2) A DEACTIVATED coach cannot submit, even though the designation remains
-- ---------------------------------------------------------------------------
\echo '=== deactivate Coach One (production deactivation: is_active = false) ==='
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000003';

select designated_coach_id as confirm_designation_intact from challenge_participants
  where id = :'drew_participant_id' \gset
\echo 'CONFIRM: (2 setup) Drew''s designation survives deactivation, designated_coach_id=' :confirm_designation_intact
select is_active as confirm_coach_deactivated from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (2 setup) Coach One is_active=' :confirm_coach_deactivated '(expect f)'

\echo '=== (2) DEACTIVATED coach submits for Drew (who has NO result yet, so the duplicate guard cannot mask this) -> must be REJECTED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a4', 41, 'reps', now());
reset role;
select count(*) as confirm_drew_results from challenge_results
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
\echo 'CONFIRM: (2) results written for Drew by the deactivated coach=' :confirm_drew_results '(expect 0)'

\echo '=== (2b) DEACTIVATED coach also cannot request a correction-free second submission for Alex -> rejected on AUTHORIZATION, not on the duplicate guard ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a1', 99, 'reps', now());
reset role;

-- ---------------------------------------------------------------------------
-- (3) NULL / invalid authorization never grants access
-- ---------------------------------------------------------------------------
\echo '=== (3) authenticated role but NO identity at all (auth.uid() IS NULL) -> must be REJECTED, never fall through the identity gate ==='
-- Before the fix, `designated_coach_id <> NULL` evaluated to NULL and
-- `if NULL then raise` took the false branch, so this caller skipped the
-- identity gate entirely.
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a4', 42, 'reps', now());
reset role;
-- Asserted on its own, immediately: the rejection MESSAGE here is shared
-- with (3b) and (4), so a message-only check could pass on one of those
-- while this case silently regressed. A row count taken right here cannot.
select count(*) as confirm_t3_null_rows from challenge_results
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
\echo 'CONFIRM: (3) rows written by the NULL-identity caller=' :confirm_t3_null_rows '(expect 0)'

\echo '=== (3b) an identity that is not a profile at all (valid-looking uuid, no row) -> must be REJECTED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ff';
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a4', 43, 'reps', now());
reset role;

\echo '=== (3c) anon -> denied by the EXECUTE grant before any function body runs ==='
set role anon;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a4', 44, 'reps', now());
reset role;

\echo '=== (3d) service_role -> still holds NO execute grant on this function (no server-side submission workflow exists) ==='
set role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a4', 45, 'reps', now());
reset role;
select set_config('request.jwt.claims', '', false);

select count(*) as confirm_drew_still_empty from challenge_results
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
\echo 'CONFIRM: (3) results written for Drew by NULL/unknown/anon/service_role actors=' :confirm_drew_still_empty '(expect 0)'

-- ---------------------------------------------------------------------------
-- (3e) POSITIVE CONTROL: reactivation restores exactly the lost ability
-- ---------------------------------------------------------------------------
\echo '=== restore Coach One ==='
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000003';

\echo '=== (3e) POSITIVE CONTROL: the REACTIVATED coach can submit for Drew again -> proves (2) was about active status alone, not a broken designation ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a4', 46, 'reps', now()) \gset t3e_
reset role;
select status as confirm_t3e_status from challenge_results where id = :'t3e_result_id' \gset
\echo 'CONFIRM: (3e) reactivated coach submitted, status=' :confirm_t3e_status '(expect pending)'

-- ---------------------------------------------------------------------------
-- (4) Branch scope cannot be bypassed
-- ---------------------------------------------------------------------------
\echo '=== (4) an ACTIVE coach from ANOTHER branch, not designated -> rejected by the designated-coach gate ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Coach Three, active, Branch C
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a3', 47, 'reps', now());
reset role;

\echo '=== (4b) DEFENSE IN DEPTH: force a cross-branch designation directly in the table (bypassing designate_challenge_coach, which would refuse it) and let that coach try -> must still be REJECTED by the branch-scope clause ==='
-- designate_challenge_coach() refuses a coach from another branch, so a
-- row like this can only arise from stale data or a direct write. The new
-- is_branch_staff() clause is what stops it being exploitable.
update challenge_participants set designated_coach_id = '00000000-0000-0000-0000-00000000000d'
  where id = :'casey_participant_id';
select designated_coach_id as confirm_forced_cross_branch from challenge_participants
  where id = :'casey_participant_id' \gset
\echo 'CONFIRM: (4b setup) Casey''s designated coach forced cross-branch to=' :confirm_forced_cross_branch

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Coach Three: ACTIVE, a real coach, and now genuinely the designated coach
select * from submit_challenge_result(:'new_challenge_id', '00000000-0000-0000-0000-0000000000a3', 48, 'reps', now());
reset role;
select count(*) as confirm_casey_results from challenge_results
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
\echo 'CONFIRM: (4b) results written cross-branch=' :confirm_casey_results '(expect 0)'

-- restore the legitimate designation
update challenge_participants set designated_coach_id = '00000000-0000-0000-0000-000000000003'
  where id = :'casey_participant_id';

-- ---------------------------------------------------------------------------
-- (5) GLOBAL scope still works — the branch clause must not deny it
-- ---------------------------------------------------------------------------
\echo '=== (5) REGRESSION GUARD: a GLOBAL-scope participant has branch_id NULL, so an UNGUARDED is_branch_staff() would deny every legitimate GLOBAL submission. A fresh branchless participant -> must SUCCEED ==='
-- Blair and Casey already hold live GLOBAL result chains (80 and 95), so
-- a fresh participant is registered here specifically to prove the ALLOW
-- direction of the GLOBAL path without the duplicate-original guard
-- masking it.
select id as global_challenge_id from challenges where title = 'Global Challenge' order by created_at desc limit 1 \gset
update challenges set status = 'registration_open' where id = :'global_challenge_id';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4'; -- Drew, not yet a GLOBAL participant
select * from request_challenge_participation(:'global_challenge_id', null) \gset drew_global_
reset role;
update challenges set status = 'active' where id = :'global_challenge_id';
\echo 'CONFIRM: (5 setup) Drew''s GLOBAL participant branch_id=' :drew_global_branch_id '(expect empty/null) status=' :drew_global_status

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- super_admin: a branchless participant has no branch to scope a manager against
select designate_challenge_coach(:'drew_global_participant_id', '00000000-0000-0000-0000-000000000003', 'Drew''s global coach.');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One: active, Branch B, designated for a participant with NO branch
select * from submit_challenge_result(:'global_challenge_id', '00000000-0000-0000-0000-0000000000a4', 49, 'reps', now()) \gset t5_
reset role;
select status as confirm_t5_status from challenge_results where id = :'t5_result_id' \gset
\echo 'CONFIRM: (5) GLOBAL submission for a branchless participant status=' :confirm_t5_status '(expect pending — proves the scope guard keeps GLOBAL working)'

-- ---------------------------------------------------------------------------
-- (6) Review still works on the result the active coach submitted
-- ---------------------------------------------------------------------------
\echo '=== (6) authorized review of result (1) still works: branch_manager approves it ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, not the author
select approve_challenge_result(:'t1_result_id', 'Confirmed.');
reset role;
select status as confirm_t1_approved from challenge_results where id = :'t1_result_id' \gset
\echo 'CONFIRM: (6) result (1) status after authorized approval=' :confirm_t1_approved '(expect approved)'

\echo '=== (6b) self-review ban intact: the submitting coach cannot approve their OWN result (3e) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select approve_challenge_result(:'t3e_result_id', 'Approving my own.');
reset role;
select status as confirm_t3e_still_pending from challenge_results where id = :'t3e_result_id' \gset
\echo 'CONFIRM: (6b) own result status after self-approval attempt=' :confirm_t3e_still_pending '(expect pending)'

-- ---------------------------------------------------------------------------
-- (7) Correction + points-ledger behavior unchanged
-- ---------------------------------------------------------------------------
\echo '=== (7) the points ledger was recomputed for the approved result ==='
-- The ledger is append-only and stores points_delta (the change against
-- the running total), not the raw result value. Alex is rank 1 of the one
-- approved result on this challenge: byRank[0] = 100, weight 3 -> 300.
select count(*) as confirm_ledger_rows, coalesce(sum(points_delta), 0) as confirm_ledger_total
  from challenge_points_ledger
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
\echo 'CONFIRM: (7) ledger rows for Alex=' :confirm_ledger_rows 'total points=' :confirm_ledger_total '(expect 1 row, 300 points)'

\echo '=== (7b) the correction workflow still works for the ACTIVE designated coach ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select * from request_challenge_result_correction(:'t1_result_id', 55, 'reps', now()) \gset corr_
reset role;
select status as confirm_corr_status from challenge_results where id = :'corr_result_id' \gset
\echo 'CONFIRM: (7b) correction requested, status=' :confirm_corr_status '(expect correction_pending)'

\echo '=== (7c) approving the correction supersedes the original, and the append-only ledger does NOT double-award (rank unchanged -> zero delta -> no new row) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select approve_challenge_result_correction(:'corr_result_id', 'Confirmed with review.');
reset role;
select superseded_by_result_id as confirm_superseded from challenge_results where id = :'t1_result_id' \gset
\echo 'CONFIRM: (7c) original superseded_by=' :confirm_superseded '(expect the correction id' :corr_result_id ')'
select status as confirm_corr_approved from challenge_results where id = :'corr_result_id' \gset
\echo 'CONFIRM: (7c) correction status=' :confirm_corr_approved '(expect approved)'
select coalesce(sum(points_delta), 0) as confirm_ledger_total_after
  from challenge_points_ledger
  where challenge_id = :'new_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
\echo 'CONFIRM: (7c) ledger total for Alex after the correction=' :confirm_ledger_total_after '(expect still 300 — same rank, no double-award)'

-- ---------------------------------------------------------------------------
-- Final state check + restoration
-- ---------------------------------------------------------------------------
update profiles set is_active = true where id in (
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000d');

select count(*) as confirm_no_null_authors from challenge_results where entered_by_profile_id is null \gset
\echo 'CONFIRM: results anywhere with a NULL author=' :confirm_no_null_authors '(expect 0 — proves no unidentified submission ever landed)'

select count(*) as confirm_all_restored from profiles where is_active = false \gset
\echo 'CONFIRM: profiles left deactivated=' :confirm_all_restored '(expect 0)'
