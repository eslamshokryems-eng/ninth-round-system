-- designate_challenge_coach() must check BOTH the caller's branch
-- authorization (against the PARTICIPANT's own chosen branch_id — their
-- own registration choice, never a membership or staff-assigned branch)
-- AND the designated coach's own branch, never role alone. Covers both
-- unauthorized and authorized cases, including that even super_admin
-- cannot designate a coach from a different branch than the participant.
-- Also covers the new carve-out this phase introduces: a participant
-- with NO branch at all (a GLOBAL registration) can only have a coach
-- designated by a super_admin, since there is no "home branch" to check
-- a branch_manager's authority against.
\set ON_ERROR_STOP off
select id as challenge_id from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
-- Alex, Branch B — by this point her designated coach is Coach Two (0004), per 60_review_and_corrections.sql.
select id as participant_id from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset

\echo '=== UNAUTHORIZED (A): branch_manager at Branch B designates a coach from Branch C for a Branch B participant -> rejected (coach wrong branch) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- branch_manager, Branch B
select designate_challenge_coach(:'participant_id', '00000000-0000-0000-0000-00000000000d', 'Attempting a cross-branch coach.'); -- Coach Three, Branch C
reset role;

\echo '=== UNAUTHORIZED (B): branch_manager at Branch C (not the participant''s branch) attempts to designate a coach for a Branch B participant -> rejected (caller wrong branch) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- branch_manager, Branch C
select designate_challenge_coach(:'participant_id', '00000000-0000-0000-0000-000000000003', 'Branch C manager attempting a Branch B participant.'); -- Coach One, Branch B
reset role;

\echo '=== UNAUTHORIZED (C): even super_admin cannot designate a cross-branch coach -> rejected (coach branch check is unconditional) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- super_admin
select designate_challenge_coach(:'participant_id', '00000000-0000-0000-0000-00000000000d', 'Super admin attempting a cross-branch coach.'); -- Coach Three, Branch C
reset role;

select designated_coach_id as confirm_unchanged from challenge_participants where id = :'participant_id' \gset
\echo 'CONFIRM: designated_coach_id after all 3 unauthorized attempts=' :confirm_unchanged ' (expect still Coach Two = 00000000-0000-0000-0000-000000000004, never coach3/000d)'

\echo '=== AUTHORIZED (D): branch_manager at Branch B designates a Branch B coach for a Branch B participant -> succeeds ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'participant_id', '00000000-0000-0000-0000-000000000003', 'Restoring Coach One as the designated coach.'); -- Coach One, Branch B
reset role;
select designated_coach_id as confirm_d from challenge_participants where id = :'participant_id' \gset
\echo 'CONFIRM: designated_coach_id=' :confirm_d ' (expect Coach One = 00000000-0000-0000-0000-000000000003)'

\echo '=== AUTHORIZED (E): super_admin designates a same-branch coach -> succeeds ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select designate_challenge_coach(:'participant_id', '00000000-0000-0000-0000-000000000004', 'Super admin reassigning within the same branch.'); -- Coach Two, Branch B
reset role;
select designated_coach_id as confirm_e from challenge_participants where id = :'participant_id' \gset
\echo 'CONFIRM: designated_coach_id=' :confirm_e ' (expect Coach Two = 00000000-0000-0000-0000-000000000004)'

\echo '=== NEW: a participant with no branch at all (a GLOBAL registration, already made in 45_registration_and_branch_selection.sql) ==='
select id as global_challenge_id from challenges where title = 'Global Challenge' order by created_at desc limit 1 \gset
select id as casey_participant_id, branch_id as casey_branch_id
  from challenge_participants where challenge_id = :'global_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
\echo 'CONFIRM: Casey''s participation branch_id=' :casey_branch_id ' (expect empty/null)'

\echo '=== UNAUTHORIZED (F): a branch_manager cannot designate a coach for a branchless (GLOBAL) participant, even for their own branch coach ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- branch_manager, Branch B
select designate_challenge_coach(:'casey_participant_id', '00000000-0000-0000-0000-000000000003', 'Branch manager attempting a branchless participant.');
reset role;

\echo '=== AUTHORIZED (G): only a super_admin may designate a coach for a branchless (GLOBAL) participant -> succeeds ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- super_admin
select designate_challenge_coach(:'casey_participant_id', '00000000-0000-0000-0000-000000000003', 'Super admin designating a coach for a global participant.');
reset role;
select designated_coach_id as confirm_g from challenge_participants where id = :'casey_participant_id' \gset
\echo 'CONFIRM: designated_coach_id=' :confirm_g ' (expect Coach One = 00000000-0000-0000-0000-000000000003)'
