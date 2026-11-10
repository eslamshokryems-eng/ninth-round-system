-- Phase D items 1-11: the profile privilege-escalation fix (F-1) and the
-- fail-closed authorization guards, asserted against the REAL fix
-- migration applied by run.sh on top of the pre-fix definitions.
--
-- Deactivation is simulated exactly as production does it — setting
-- profiles.is_active = false — because that is what makes auth_role()
-- return NULL, which is the root cause.
\set ON_ERROR_STOP off

\echo '################ (1) ACTIVE non-admin cannot change their OWN ROLE ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Rita, reception, active
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-000000000003';
reset role;
select role as c1 from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (1) role after attempt=' :c1 '(expect reception)'

\echo '################ (2) ACTIVE non-admin cannot change their OWN is_active ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000003';
reset role;
select is_active as c2 from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (2) is_active after attempt=' :c2 '(expect t)'

\echo '################ deactivate Rita via the admin path, to set up (3)-(5) ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- Sam, super_admin
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000003';
reset role;
select is_active as setup from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: Rita deactivated by admin=' :setup '(expect f — this is Phase D item 6)'

\echo '################ (3) DEACTIVATED user cannot reactivate themselves ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Rita, now deactivated, token still valid
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000003';
reset role;
select is_active as c3 from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (3) is_active after self-reactivation attempt=' :c3 '(expect f)'

\echo '################ (4) DEACTIVATED user cannot promote themselves to super_admin ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-000000000003';
reset role;
select role as c4 from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (4) role after self-promotion attempt=' :c4 '(expect reception)'

\echo '################ (5) DEACTIVATED user cannot change their own branch ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
update profiles set branch_id = '00000000-0000-0000-0000-00000000000c' where id = '00000000-0000-0000-0000-000000000003';
reset role;
select coalesce(branch_id::text, 'null') as c5 from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (5) branch after attempt=' :c5 '(expect ...000b)'

\echo '################ (4b) the full exploit chain in ONE statement must also fail ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
update profiles set role = 'super_admin', is_active = true where id = '00000000-0000-0000-0000-000000000003';
reset role;
select role || '/' || is_active::text as c4b from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (4b) role/is_active after combined attempt=' :c4b '(expect reception/false)'

\echo '################ (7) authorized administrator CAN reactivate another employee ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- Sam, super_admin
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000003';
reset role;
select is_active as c7 from profiles where id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (7) is_active after admin reactivation=' :c7 '(expect t)'

\echo '################ (6b) a branch_manager can also deactivate/reactivate (is_admin, not just super) ################'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, branch_manager
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000004';
reset role;
select is_active as c6b from profiles where id = '00000000-0000-0000-0000-000000000004' \gset
\echo 'CONFIRM: (6b) Sally is_active after branch_manager deactivation=' :c6b '(expect f)'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000004';
reset role;

\echo '################ (8) SERVICE-ROLE account creation still works (role+branch+employee_code) ################'
-- Exactly what /api/staff/create-account does: handle_new_user() has
-- already inserted a default member row, then the route promotes it on a
-- service-role client (auth.uid() null, claims role=service_role).
insert into profiles (id, full_name, role, is_active) values
  ('00000000-0000-0000-0000-0000000000b1', 'Newly Hired', 'member', true);
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
update profiles
   set role = 'reception', branch_id = '00000000-0000-0000-0000-00000000000b', employee_code = 'EMP-000099'
 where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select role || '/' || coalesce(employee_code,'none') as c8 from profiles where id = '00000000-0000-0000-0000-0000000000b1' \gset
\echo 'CONFIRM: (8) service-role promotion result=' :c8 '(expect reception/EMP-000099)'

\echo '################ (9) SERVICE-ROLE activation/deactivation still works ################'
set role service_role;
update profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select is_active as c9a from profiles where id = '00000000-0000-0000-0000-0000000000b1' \gset
set role service_role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select is_active as c9b from profiles where id = '00000000-0000-0000-0000-0000000000b1' \gset
\echo 'CONFIRM: (9) service-role deactivate=' :c9a 'reactivate=' :c9b '(expect f then t)'

\echo '################ (9b) SERVICE-ROLE can still run prepare_staff_deletion ################'
set role service_role;
select prepare_staff_deletion('00000000-0000-0000-0000-0000000000b1');
reset role;

\echo '################ anon CANNOT run prepare_staff_deletion (guard closed + EXECUTE revoked) ################'
select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select prepare_staff_deletion('00000000-0000-0000-0000-000000000004');
reset role;

\echo '################ DEACTIVATED sales employee cannot reassign a lead ################'
-- Deactivate via the service_role path; a bare psql session now has
-- is_admin() = false and the trigger would refuse (intended).
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000004';
reset role;
select set_config('request.jwt.claims', '', false);
select is_active as clead_setup from profiles where id = '00000000-0000-0000-0000-000000000004' \gset
\echo 'CONFIRM: (lead setup) Sally deactivated=' :clead_setup '(expect f)'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Sally, deactivated
update leads set assigned_to = '00000000-0000-0000-0000-000000000003'
 where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
select coalesce(assigned_to::text,'null') as clead from leads where id = '00000000-0000-0000-0000-0000000000f1' \gset
\echo 'CONFIRM: lead assigned_to after deactivated reassignment attempt=' :clead '(expect ...000004, unchanged)'
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000004';
reset role;
select set_config('request.jwt.claims', '', false);

\echo '################ (10) audit records remain correctly attributed ################'
-- An admin-performed deactivation must log disable_user attributed to
-- the acting admin; a service-role write must NOT be logged by the
-- trigger (the route logs it via log_audit_event_as instead).
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000003';
update profiles set is_active = true  where id = '00000000-0000-0000-0000-000000000003';
reset role;
select (count(*) >= 1) as c10a from admin_audit_log
  where action = 'disable_user' and target_id = '00000000-0000-0000-0000-000000000003'
    and admin_id = '00000000-0000-0000-0000-000000000001' \gset
select (count(*) >= 1) as c10b from admin_audit_log
  where action = 'enable_user' and target_id = '00000000-0000-0000-0000-000000000003'
    and admin_id = '00000000-0000-0000-0000-000000000001' \gset
-- Also assert nothing was logged against the WRONG actor.
select (count(*) = 0) as c10c from admin_audit_log
  where target_id = '00000000-0000-0000-0000-000000000003'
    and admin_id is distinct from '00000000-0000-0000-0000-000000000001' \gset
\echo 'CONFIRM: (10) disable_user attributed=' :c10a 'enable_user attributed=' :c10b 'no_misattributed_rows=' :c10c '(expect t t t)'

select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select count(*) as before_sr from admin_audit_log where target_id = '00000000-0000-0000-0000-0000000000b1' \gset
set role service_role;
update profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select count(*) as after_sr from admin_audit_log where target_id = '00000000-0000-0000-0000-0000000000b1' \gset
\echo 'CONFIRM: (10b) audit rows for a service-role write before=' :before_sr 'after=' :after_sr '(expect equal — the route logs it instead)'

\echo '################ (11) NULL authorization checks fail CLOSED ################'
select set_config('request.jwt.claims', '', false);
select set_config('request.jwt.claim.sub', '', false);
select public.auth_role() is null as c11_authrole_null,
       public.is_admin()          as c11_is_admin,
       public.is_super_admin()    as c11_is_super_admin,
       public.is_branch_staff('00000000-0000-0000-0000-00000000000b') as c11_is_branch_staff,
       public.is_service_role()   as c11_is_service_role \gset
\echo 'CONFIRM: (11) auth_role_is_null=' :c11_authrole_null 'is_admin=' :c11_is_admin 'is_super_admin=' :c11_is_super_admin 'is_branch_staff=' :c11_is_branch_staff 'is_service_role=' :c11_is_service_role '(expect t,f,f,f,f — never NULL)'

\echo '################ (11b) a deactivated staff member also resolves to false, not NULL ################'
-- Deactivate Mona through a LEGITIMATE path. A bare psql session carries
-- no JWT claims, so after the fix is_admin() is false there and the
-- trigger correctly refuses to touch is_active — which is itself the
-- intended new behaviour, so the setup uses the service_role path the
-- real /api/staff/set-active-status route uses.
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select set_config('request.jwt.claim.sub', '', false);
set role service_role;
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000002';
reset role;
select set_config('request.jwt.claims', '', false);
select is_active as c11b_setup from profiles where id = '00000000-0000-0000-0000-000000000002' \gset
\echo 'CONFIRM: (11b setup) Mona deactivated via service_role=' :c11b_setup '(expect f)'
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select public.is_admin() as c11b_is_admin,
       public.is_super_admin() as c11b_is_super,
       public.is_branch_staff('00000000-0000-0000-0000-00000000000b') as c11b_branch \gset
\echo 'CONFIRM: (11b) deactivated branch_manager -> is_admin=' :c11b_is_admin 'is_super_admin=' :c11b_is_super 'is_branch_staff=' :c11b_branch '(expect f,f,f)'
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000002';
reset role;
select set_config('request.jwt.claims', '', false);
