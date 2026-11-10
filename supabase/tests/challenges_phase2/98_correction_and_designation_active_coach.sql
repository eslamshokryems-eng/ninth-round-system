-- Regression: the two remaining Challenges authorization gaps, fixed in
-- 20261109000001_correction_and_designation_require_active_coach.sql.
--
--   FINDING A  request_challenge_result_correction() authorized only by
--              stored identity, so a DEACTIVATED coach could create a
--              correction request, and a NULL auth.uid() fell through the
--              identity gate (`<>` yields NULL; `false or NULL` is NULL).
--   FINDING B  designate_challenge_coach() validated the target profile's
--              role and branch but never its is_active, so a DEACTIVATED
--              profile could be newly designated as a coach.
--
-- Targets are chosen so no two assertions collide:
--   * Alex on "Active Coach Guard Challenge" (coach: Coach One) is the
--     POSITIVE correction target.
--   * Drew on "Push-Up Challenge" (coach: Coach Two) is the NEGATIVE
--     correction target — every attempt against it is expected to fail, so
--     uq_challenge_results_one_pending_correction is never contended.
--   * Drew on "Global Challenge" is the GLOBAL-scope positive control.
--
-- Deactivation is simulated exactly as production does it
-- (profiles.is_active = false) and every account is restored before the
-- file ends, so repeat runs are unaffected.
\set ON_ERROR_STOP off

select id as guard_challenge_id from challenges where title = 'Active Coach Guard Challenge' order by created_at desc limit 1 \gset
select id as pushup_challenge_id from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
select id as global_challenge_id from challenges where title = 'Global Challenge' order by created_at desc limit 1 \gset

-- Alex's CURRENT approved result on the guard challenge (97 left this as
-- an approved correction) — the positive correction target.
select id as alex_target from challenge_results
  where challenge_id = :'guard_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1'
    and status = 'approved' and superseded_by_result_id is null limit 1 \gset
-- Drew's CURRENT approved result on Push-Up (60 left this approved) — the
-- negative correction target. Drew's designated coach there is Coach Two.
select id as drew_target from challenge_results
  where challenge_id = :'pushup_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4'
    and status = 'approved' and superseded_by_result_id is null limit 1 \gset
select id as drew_pushup_participant_id from challenge_participants
  where challenge_id = :'pushup_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
select designated_coach_id as drew_pushup_coach from challenge_participants
  where id = :'drew_pushup_participant_id' \gset
\echo 'CONFIRM: (setup) alex_target=' :alex_target 'drew_target=' :drew_target 'drew_pushup_coach=' :drew_pushup_coach

-- ===========================================================================
-- FINDING A — correction request authorization
-- ===========================================================================

\echo '=== A1 POSITIVE: an ACTIVE, correctly designated coach CAN request a correction (BRANCH scope, so is_branch_staff() is exercised in the ALLOW direction) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, active, Branch B, Alex's designated coach
select * from request_challenge_result_correction(:'alex_target', 101, 'reps', now()) \gset a1_
reset role;
select status as confirm_a1_status from challenge_results where id = :'a1_result_id' \gset
\echo 'CONFIRM: (A1) active coach correction status=' :confirm_a1_status '(expect correction_pending)'

\echo '=== deactivate Coach Two (Drew''s designated coach on Push-Up) ==='
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000004';
select is_active as confirm_coach_two_off from profiles where id = '00000000-0000-0000-0000-000000000004' \gset
select designated_coach_id as confirm_drew_designation_intact from challenge_participants
  where id = :'drew_pushup_participant_id' \gset
\echo 'CONFIRM: (A2 setup) Coach Two is_active=' :confirm_coach_two_off '(expect f) designation still=' :confirm_drew_designation_intact

\echo '=== A2: a DEACTIVATED coach whose designation still exists requests a correction -> must be REJECTED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select * from request_challenge_result_correction(:'drew_target', 102, 'reps', now());
reset role;
select count(*) as confirm_a2_rows from challenge_results where corrects_result_id = :'drew_target' \gset
\echo 'CONFIRM: (A2) correction rows created by the DEACTIVATED coach=' :confirm_a2_rows '(expect 0)'

\echo '=== A3: NULL identity -> must be rejected by AUTHORIZATION, not by the entered_by_profile_id NOT NULL constraint ==='
-- Pre-fix this caller fell past the identity gate and reached the INSERT,
-- where the not-null column (not any authorization rule) stopped it. The
-- assertion below is the authorization message AND a row count, so a
-- constraint violation could not satisfy it.
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select * from request_challenge_result_correction(:'drew_target', 103, 'reps', now());
reset role;
select count(*) as confirm_a3_rows from challenge_results where corrects_result_id = :'drew_target' \gset
\echo 'CONFIRM: (A3) correction rows created by a NULL-identity caller=' :confirm_a3_rows '(expect 0)'

-- A4 and A5 each get their OWN correction target. They must not reuse
-- Drew's Push-Up result: uq_challenge_results_one_pending_correction
-- allows at most one correction_pending per target, so once A2 has (in a
-- no-fix world) successfully created one there, a later attempt would be
-- stopped by that UNIQUE index rather than by authorization — and the
-- A/B run could not tell the two apart.

\echo '=== A4: an INVALID role — the designation forced onto a non-staff member profile, who then calls -> rejected by the role conjunct ==='
-- Target: Blair's GLOBAL result, approved by the M-3 concurrency race in
-- 80/81 and never corrected since, so it is genuinely uncontended. (Alex's
-- Push-Up result is NOT usable here: 60 left a correction_pending against
-- it, so uq_challenge_results_one_pending_correction would reject a second
-- attempt before authorization was ever consulted.) The branch conjunct
-- short-circuits on GLOBAL scope, which is what makes this a clean test of
-- the ROLE conjunct on its own.
select id as blair_global_participant_id from challenge_participants
  where challenge_id = :'global_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a2' \gset
select designated_coach_id as blair_global_coach from challenge_participants
  where id = :'blair_global_participant_id' \gset
select id as blair_target from challenge_results
  where challenge_id = :'global_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a2'
    and status = 'approved' and superseded_by_result_id is null limit 1 \gset
select count(*) as confirm_a4_target_clean from challenge_results where corrects_result_id = :'blair_target' \gset
\echo 'CONFIRM: (A4 setup) uncontended target=' :blair_target 'existing corrections against it=' :confirm_a4_target_clean '(expect 0)'

update challenge_participants set designated_coach_id = '00000000-0000-0000-0000-0000000000a1'
  where id = :'blair_global_participant_id';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1'; -- Alex: an ordinary customer (role = member), now the designated coach
select * from request_challenge_result_correction(:'blair_target', 104, 'reps', now());
reset role;
select count(*) as confirm_a4_rows from challenge_results where corrects_result_id = :'blair_target' \gset
\echo 'CONFIRM: (A4) correction rows created by a member-role designee=' :confirm_a4_rows '(expect 0)'
update challenge_participants set designated_coach_id = :'blair_global_coach'
  where id = :'blair_global_participant_id';

\echo '=== A5: CROSS-BRANCH — the designation forced onto an ACTIVE coach from another branch -> rejected by the branch-scope clause ==='
-- Target: a fresh approved result of Casey''s on the guard challenge,
-- built here so A5 has an uncontended target of its own.
select id as casey_participant_for_a5 from challenge_participants
  where challenge_id = :'guard_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
select designated_coach_id as casey_coach_for_a5 from challenge_participants
  where id = :'casey_participant_for_a5' \gset
set role authenticated;
set request.jwt.claim.sub = :'casey_coach_for_a5'; -- Casey's own active designated coach
select * from submit_challenge_result(:'guard_challenge_id', '00000000-0000-0000-0000-0000000000a3', 30, 'reps', now()) \gset a5t_
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona approves it (not the author)
select approve_challenge_result(:'a5t_result_id', 'Approved to build the A5 target.');
reset role;
select status as confirm_a5_target_status from challenge_results where id = :'a5t_result_id' \gset
\echo 'CONFIRM: (A5 setup) independent target status=' :confirm_a5_target_status '(expect approved)'

update challenge_participants set designated_coach_id = '00000000-0000-0000-0000-00000000000d'
  where id = :'casey_participant_for_a5';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Coach Three: ACTIVE, real coach, genuinely designated, Branch C
select * from request_challenge_result_correction(:'a5t_result_id', 105, 'reps', now());
reset role;
select count(*) as confirm_a5_rows from challenge_results where corrects_result_id = :'a5t_result_id' \gset
\echo 'CONFIRM: (A5) correction rows created cross-branch=' :confirm_a5_rows '(expect 0)'

-- restore Casey's and Drew's legitimate designations, and reactivate Coach Two
update challenge_participants set designated_coach_id = :'casey_coach_for_a5'
  where id = :'casey_participant_for_a5';
update challenge_participants set designated_coach_id = :'drew_pushup_coach'
  where id = :'drew_pushup_participant_id';
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000004';

\echo '=== A5b POSITIVE CONTROL: the REACTIVATED designated coach CAN now request the same correction -> proves A2 turned on active status alone ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select * from request_challenge_result_correction(:'drew_target', 106, 'reps', now()) \gset a5b_
reset role;
select status as confirm_a5b_status from challenge_results where id = :'a5b_result_id' \gset
\echo 'CONFIRM: (A5b) reactivated coach correction status=' :confirm_a5b_status '(expect correction_pending)'

\echo '=== A5c SCOPE REGRESSION GUARD: a GLOBAL participant has branch_id NULL, so an UNGUARDED is_branch_staff() would deny every legitimate GLOBAL correction ==='
-- Drew's GLOBAL result (submitted in 97) is still pending; approve it so
-- there is a current approved result to correct.
select id as drew_global_result from challenge_results
  where challenge_id = :'global_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4'
    and status = 'pending' limit 1 \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona: active branch_manager, not the author; GLOBAL scope admits her
select approve_challenge_result(:'drew_global_result', 'Confirmed for the scope regression guard.');
reset role;
select status as confirm_global_approved from challenge_results where id = :'drew_global_result' \gset
\echo 'CONFIRM: (A5c setup) GLOBAL result approved=' :confirm_global_approved '(expect approved)'

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One: Branch B, designated for a participant with NO branch
select * from request_challenge_result_correction(:'drew_global_result', 107, 'reps', now()) \gset a5c_
reset role;
select status as confirm_a5c_status from challenge_results where id = :'a5c_result_id' \gset
\echo 'CONFIRM: (A5c) GLOBAL correction by an in-scope coach status=' :confirm_a5c_status '(expect correction_pending)'

\echo '=== A6: review and approval remain SEPARATE, independently authorized operations ==='
\echo '--- A6a: the correction''s own author cannot approve it (self-review ban intact) ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One authored the A1 correction
select approve_challenge_result_correction(:'a1_result_id', 'Approving my own correction.');
reset role;
select status as confirm_a6a_status from challenge_results where id = :'a1_result_id' \gset
\echo 'CONFIRM: (A6a) own correction status after self-approval attempt=' :confirm_a6a_status '(expect correction_pending)'

\echo '--- A6b: a DEACTIVATED reviewer cannot approve a correction (review authorization is its own check) ---'
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000002';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select approve_challenge_result_correction(:'a1_result_id', 'Approving while deactivated.');
reset role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000002';
select status as confirm_a6b_status from challenge_results where id = :'a1_result_id' \gset
\echo 'CONFIRM: (A6b) correction status after deactivated approval attempt=' :confirm_a6b_status '(expect correction_pending)'

\echo '--- A6c: an AUTHORIZED active reviewer CAN approve it -> original superseded, ledger recomputed ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, reactivated, not the author
select approve_challenge_result_correction(:'a1_result_id', 'Confirmed with review.');
reset role;
select status as confirm_a6c_status from challenge_results where id = :'a1_result_id' \gset
select superseded_by_result_id as confirm_a6c_superseded from challenge_results where id = :'alex_target' \gset
\echo 'CONFIRM: (A6c) correction status=' :confirm_a6c_status '(expect approved) original superseded_by=' :confirm_a6c_superseded
select coalesce(sum(points_delta), 0) as confirm_a6c_ledger from challenge_points_ledger
  where challenge_id = :'guard_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
\echo 'CONFIRM: (A6c) Alex ledger total on the guard challenge=' :confirm_a6c_ledger '(expect 300 — rank unchanged, no double-award)'

-- ===========================================================================
-- FINDING B — coach designation
-- ===========================================================================
select id as casey_guard_participant_id from challenge_participants
  where challenge_id = :'guard_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
select designated_coach_id as casey_coach_before from challenge_participants
  where id = :'casey_guard_participant_id' \gset
\echo 'CONFIRM: (B setup) Casey''s designated coach before any B test=' :casey_coach_before

\echo '=== B7 POSITIVE: an ACTIVE coach with the right role and branch CAN be designated ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, active branch_manager of Branch B
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-000000000004', 'Designating the active Coach Two.');
reset role;
select designated_coach_id as confirm_b7 from challenge_participants where id = :'casey_guard_participant_id' \gset
\echo 'CONFIRM: (B7) Casey''s designated coach=' :confirm_b7 '(expect Coach Two = 00000000-0000-0000-0000-000000000004)'

\echo '=== B8: a DEACTIVATED coach CANNOT be newly designated ==='
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000003'; -- Coach One off
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-000000000003', 'Trying to designate a deactivated coach.');
reset role;
select designated_coach_id as confirm_b8 from challenge_participants where id = :'casey_guard_participant_id' \gset
\echo 'CONFIRM: (B8) Casey''s designated coach after the deactivated attempt=' :confirm_b8 '(expect STILL Coach Two = 00000000-0000-0000-0000-000000000004)'

\echo '=== B12: existing designations pointing at a DEACTIVATED coach are NOT silently deleted or rewritten ==='
-- Coach One is still deactivated here and is still the designated coach
-- for Alex and Drew on the guard challenge. Nothing in the fix touches data.
select designated_coach_id as confirm_b12_alex from challenge_participants
  where challenge_id = :'guard_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
select designated_coach_id as confirm_b12_drew from challenge_participants
  where challenge_id = :'guard_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
select count(*) as confirm_b12_null_designations from challenge_participants where designated_coach_id is null \gset
\echo 'CONFIRM: (B12) existing designations to the deactivated Coach One preserved: alex=' :confirm_b12_alex 'drew=' :confirm_b12_drew
\echo 'CONFIRM: (B12) participants left with a NULL designation=' :confirm_b12_null_designations '(expect 3 — the three never designated, unchanged)'

update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000003';

\echo '=== B9: a profile whose role is NOT coach cannot be designated ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-0000000000a1', 'Trying to designate a customer.');
reset role;
select designated_coach_id as confirm_b9 from challenge_participants where id = :'casey_guard_participant_id' \gset
\echo 'CONFIRM: (B9) Casey''s designated coach after the member-role attempt=' :confirm_b9 '(expect STILL Coach Two)'

\echo '=== B9b: a non-existent profile cannot be designated (fails on the role check, not a NULL slip) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-0000000000ff', 'Trying to designate a ghost.');
reset role;
select designated_coach_id as confirm_b9b from challenge_participants where id = :'casey_guard_participant_id' \gset
\echo 'CONFIRM: (B9b) Casey''s designated coach after the ghost attempt=' :confirm_b9b '(expect STILL Coach Two)'

\echo '=== B11: cross-branch designation remains rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-00000000000d', 'Trying a Branch C coach for a Branch B participant.');
reset role;
select designated_coach_id as confirm_b11 from challenge_participants where id = :'casey_guard_participant_id' \gset
\echo 'CONFIRM: (B11) Casey''s designated coach after the cross-branch attempt=' :confirm_b11 '(expect STILL Coach Two)'

\echo '=== B10: the acting caller''s authorization rules are unchanged ==='
\echo '--- B10a: a coach (not a manager) cannot designate ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, active but not a manager
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-000000000004', 'A coach trying to designate.');
reset role;

\echo '--- B10b: a branch_manager from ANOTHER branch cannot designate ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- Carl, branch_manager of Branch C
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-000000000004', 'Branch C manager on a Branch B participant.');
reset role;

\echo '--- B10c: a DEACTIVATED branch_manager cannot designate ---'
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000002';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'casey_guard_participant_id', '00000000-0000-0000-0000-000000000004', 'Deactivated manager designating.');
reset role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000002';

\echo '--- B10d: a branch_manager CANNOT designate for a branchless (GLOBAL) participant, but a super_admin CAN ---'
select id as drew_global_participant_id from challenge_participants
  where challenge_id = :'global_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'drew_global_participant_id', '00000000-0000-0000-0000-000000000004', 'Manager on a branchless participant.');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- Sam, super_admin
select designate_challenge_coach(:'drew_global_participant_id', '00000000-0000-0000-0000-000000000004', 'Super admin on a branchless participant.');
reset role;
select designated_coach_id as confirm_b10d from challenge_participants where id = :'drew_global_participant_id' \gset
\echo 'CONFIRM: (B10d) branchless participant''s coach after manager-then-superadmin=' :confirm_b10d '(expect Coach Two, set by the super admin)'

select designated_coach_id as confirm_b10_unchanged from challenge_participants where id = :'casey_guard_participant_id' \gset
\echo 'CONFIRM: (B10) Casey''s coach unchanged by every rejected caller=' :confirm_b10_unchanged '(expect STILL Coach Two)'

-- ---------------------------------------------------------------------------
-- Restoration + final invariants
-- ---------------------------------------------------------------------------
update profiles set is_active = true where id in (
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d');

select count(*) as confirm_no_null_authors from challenge_results where entered_by_profile_id is null \gset
\echo 'CONFIRM: results anywhere with a NULL author=' :confirm_no_null_authors '(expect 0)'
select count(*) as confirm_all_active from profiles where is_active = false \gset
\echo 'CONFIRM: profiles left deactivated=' :confirm_all_active '(expect 0)'
