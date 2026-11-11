-- Regression: authorization guards must FAIL CLOSED when auth_role() is
-- NULL. auth_role() returns NULL (not a role) for an `anon` caller and
-- for a DEACTIVATED staff member who still holds an unexpired access
-- token, and SQL's three-valued logic turned every
-- `if not <check> then raise` guard into a no-op for them:
--
--   NULL in ('branch_manager','super_admin') -> NULL
--   not NULL                                 -> NULL
--   IF NULL THEN ... END IF                  -> branch NOT taken
--
-- Fixed in 20261107000001_fail_closed_authorization_guards.sql (the
-- shared helpers) plus the coalesce() guards in this phase's own
-- migration. These assertions pin the Challenges-side consequences.
--
-- Deactivation is simulated the way production does it — by setting
-- profiles.is_active = false — and every account is restored at the end
-- so later/repeat runs are unaffected.
\set ON_ERROR_STOP off
select id as season_id from challenge_seasons limit 1 \gset
select id as branch_challenge_id from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
select id as global_challenge_id from challenges where title = 'Global Challenge' order by created_at desc limit 1 \gset
-- Casey's still-pending result on the GLOBAL challenge (created in 95).
select id as global_pending_result_id from challenge_results
  where challenge_id = :'global_challenge_id' and status = 'pending' limit 1 \gset

\echo '=== deactivate the branch_manager and the super_admin (as production does: is_active = false) ==='
update profiles set is_active = false where id in (
  '00000000-0000-0000-0000-000000000002', -- Mona, branch_manager
  '00000000-0000-0000-0000-000000000001'  -- Sam, super_admin
);
select id, role, is_active from profiles where id in (
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002') order by id;

\echo '=== (1) DEACTIVATED branch_manager approving a GLOBAL-scope result -> must be REJECTED ==='
-- This is the case the fix exists for: on a GLOBAL challenge the branch
-- clause short-circuits true, so the whole guard hung on the role check
-- alone, which was NULL.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select approve_challenge_result(:'global_pending_result_id', 'Approving while deactivated.');
reset role;
select status as confirm_global_result_status from challenge_results where id = :'global_pending_result_id' \gset
\echo 'CONFIRM: global result status after deactivated approval attempt=' :confirm_global_result_status '(expect pending)'

\echo '=== (2) DEACTIVATED super_admin creating a season -> must be REJECTED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select * from create_challenge_season('Season By Deactivated Admin', null, '2027-03-01', '2027-05-31');
reset role;

\echo '=== (3) DEACTIVATED super_admin changing the weight range -> must be REJECTED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select set_challenge_weight_range(1, 99);
reset role;
select value as confirm_weight_unchanged from challenge_settings where key = 'max_weight' \gset
\echo 'CONFIRM: max_weight still=' :confirm_weight_unchanged '(expect 15, not 99)'

\echo '=== (4) DEACTIVATED branch_manager creating a challenge -> must be REJECTED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select * from create_challenge(
  :'season_id', 'Challenge By Deactivated Manager', null, 'strength', 'boxing', 'BRANCH', '00000000-0000-0000-0000-00000000000b',
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days'
);
reset role;

\echo '=== (5) ANON creating a season -> must be REJECTED (not silently permitted) ==='
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select * from create_challenge_season('Season By Anon', null, '2027-06-01', '2027-08-31');
reset role;

\echo '=== (6) DEACTIVATED branch_manager designating a coach for a branchless participant -> must be REJECTED ==='
select id as casey_participant_id from challenge_participants
  where challenge_id = :'global_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- deactivated super_admin
select designate_challenge_coach(:'casey_participant_id', '00000000-0000-0000-0000-000000000004', 'Reassigning while deactivated.');
reset role;

\echo '=== restore both accounts ==='
update profiles set is_active = true where id in (
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');

\echo '=== (7) POSITIVE CONTROL: the REACTIVATED super_admin can create a season again (no regression) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select * from create_challenge_season('Season After Reactivation', null, '2027-09-01', '2027-11-30') \gset ok_
reset role;
\echo 'CONFIRM: reactivated super_admin created season id=' :ok_season_id

\echo '=== (8) POSITIVE CONTROL: service_role is recognised explicitly (is_service_role) ==='
-- Both GUCs must be cleared for a true "no session at all" probe: the
-- sub claim set by the tests above would otherwise still identify a real
-- (and by now reactivated) profile, making is_super_admin() legitimately
-- true and telling us nothing about the NULL case.
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select public.is_service_role() as confirm_service_role_detected,
       public.is_super_admin() as confirm_super_admin_for_service_role \gset
\echo 'CONFIRM: is_service_role=' :confirm_service_role_detected 'is_super_admin=' :confirm_super_admin_for_service_role
select set_config('request.jwt.claims', '', false);
-- is_admin() is not reproduced in this harness (Challenges never calls
-- it); it is covered in supabase/tests/identity_authorization/.
select public.is_service_role() as confirm_not_service_role,
       public.is_super_admin() as confirm_super_admin_no_session,
       public.is_branch_staff('00000000-0000-0000-0000-00000000000b') as confirm_branch_staff_no_session \gset
\echo 'CONFIRM: no session ->' 'is_service_role=' :confirm_not_service_role 'is_super_admin=' :confirm_super_admin_no_session 'is_branch_staff=' :confirm_branch_staff_no_session '(expect all f, never NULL)'
