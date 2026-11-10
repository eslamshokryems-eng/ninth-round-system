-- H-1 / M-2 regression: EXECUTE permissions on the two audit-log entry
-- points, verified both by catalogue privilege (has_function_privilege)
-- and by actually attempting execution under each role.
--
-- Fixed in 20261111000001_audit_log_function_execute_lockdown.sql.
--
-- Every denial is checked TWICE — the refusal itself AND the admin_audit_log
-- row count — because a privilege error alone would not prove that nothing
-- was written. The baseline count is captured first and compared after the
-- whole denial battery.
\set ON_ERROR_STOP off
\pset pager off

select count(*) as rows_before from admin_audit_log \gset
\echo 'CONFIRM: (baseline) admin_audit_log rows before any attempt=' :rows_before

-- ===========================================================================
-- ACL TESTS (14-17) — catalogue privilege, independent of execution
-- ===========================================================================
\echo '=== (14) PUBLIC must not retain EXECUTE on either function ==='
-- has_function_privilege('public', ...) is the ONLY correct test here. A
-- function whose proacl is NULL has the default grant, which IS "EXECUTE to
-- PUBLIC" — exactly the state H-1 was in — yet it has no explicit "=X" ACL
-- entry to pattern-match against, so scanning proacl reports a false
-- negative on the very case that matters. Verified on an isolated cluster:
-- a NULL-acl function returns t here, and f once revoked from public.
select
  case when has_function_privilege('public','public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)','EXECUTE')
       then 'HAS_EXECUTE' else 'NO_PUBLIC_EXECUTE' end as log_audit_event_as_public,
  case when has_function_privilege('public','public.log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)','EXECUTE')
       then 'HAS_EXECUTE' else 'NO_PUBLIC_EXECUTE' end as log_audit_event_public,
  coalesce((select proacl::text from pg_proc where proname='log_audit_event_as'),'NULL (= PUBLIC default)') as acl_as,
  coalesce((select proacl::text from pg_proc where proname='log_audit_event'),'NULL (= PUBLIC default)') as acl_e \gset
\echo 'CONFIRM: (14) PUBLIC on log_audit_event_as=' :log_audit_event_as_public 'on log_audit_event=' :log_audit_event_public
\echo 'CONFIRM: (14) raw ACL log_audit_event_as=' :acl_as
\echo 'CONFIRM: (14) raw ACL log_audit_event=' :acl_e

\echo '=== (15)(16)(17) per-role EXECUTE, straight from has_function_privilege ==='
select
  has_function_privilege('anon',          'public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as as_anon,
  has_function_privilege('authenticated', 'public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as as_auth,
  has_function_privilege('service_role',  'public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as as_svc,
  has_function_privilege('postgres',      'public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as as_owner \gset
\echo 'CONFIRM: (15) log_audit_event_as EXECUTE -> anon=' :as_anon 'authenticated=' :as_auth 'service_role=' :as_svc 'postgres=' :as_owner
select
  has_function_privilege('anon',          'public.log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as e_anon,
  has_function_privilege('authenticated', 'public.log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as e_auth,
  has_function_privilege('service_role',  'public.log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as e_svc,
  has_function_privilege('postgres',      'public.log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') as e_owner \gset
\echo 'CONFIRM: (16) log_audit_event EXECUTE -> anon=' :e_anon 'authenticated=' :e_auth 'service_role=' :e_svc 'postgres=' :e_owner

\echo '=== (17) no OTHER role inherits access through PUBLIC ==='
-- Any non-superuser role that still reports EXECUTE on log_audit_event_as
-- other than service_role would mean a PUBLIC grant survived somewhere.
select coalesce(string_agg(rolname, ', ' order by rolname), 'NONE') as unexpected_as
from pg_roles
where not rolsuper
  and rolname not in ('service_role')
  and rolname not like 'pg\_%'
  and has_function_privilege(rolname, 'public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') \gset
\echo 'CONFIRM: (17) non-superuser roles besides service_role with EXECUTE on log_audit_event_as=' :unexpected_as '(expect NONE)'
select coalesce(string_agg(rolname, ', ' order by rolname), 'NONE') as unexpected_e
from pg_roles
where not rolsuper
  and rolname not in ('authenticated')
  and rolname not like 'pg\_%'
  and has_function_privilege(rolname, 'public.log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)', 'EXECUTE') \gset
\echo 'CONFIRM: (17) non-superuser roles besides authenticated with EXECUTE on log_audit_event=' :unexpected_e '(expect NONE)'

-- ===========================================================================
-- H-1 EXECUTION TESTS (1-6) — log_audit_event_as must reject every client
-- ===========================================================================
\echo '=== (1) anon cannot execute log_audit_event_as ==='
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select log_audit_event_as('00000000-0000-0000-0000-000000000001', 'delete_user', 'staff',
  '00000000-0000-0000-0000-0000000000a1', null, '{"forged_by":"anon"}'::jsonb, '{}'::jsonb);
reset role;

\echo '=== (2) an authenticated CUSTOMER cannot execute it ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select log_audit_event_as('00000000-0000-0000-0000-000000000001', 'delete_user', 'staff',
  '00000000-0000-0000-0000-0000000000a1', null, '{"forged_by":"customer"}'::jsonb, '{}'::jsonb);
reset role;

\echo '=== (3) an authenticated COACH cannot execute it ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select log_audit_event_as('00000000-0000-0000-0000-000000000001', 'disable_user', 'staff',
  '00000000-0000-0000-0000-000000000003', null, '{"forged_by":"coach"}'::jsonb, '{}'::jsonb);
reset role;

\echo '=== (4) a BRANCH MANAGER cannot execute it ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select log_audit_event_as('00000000-0000-0000-0000-000000000001', 'disable_user', 'staff',
  '00000000-0000-0000-0000-000000000002', null, '{"forged_by":"branch_manager"}'::jsonb, '{}'::jsonb);
reset role;

\echo '=== (5) a SUPER ADMIN cannot execute it through the client role either ==='
-- The privilege belongs to the ROLE the client connects as, not to the
-- profile's business role: a super admin on a normal session is still
-- `authenticated`, so they are refused too. Admin actions reach this
-- function only through the server-side service-role path.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select log_audit_event_as('00000000-0000-0000-0000-000000000002', 'change_role', 'staff',
  '00000000-0000-0000-0000-000000000002', null, '{"forged_by":"super_admin_client"}'::jsonb, '{}'::jsonb);
reset role;

\echo '=== (6) NO forged audit record was inserted by any of the five attempts ==='
select count(*) as forged_rows from admin_audit_log
  where after ? 'forged_by' \gset
\echo 'CONFIRM: (6) audit rows carrying a forged_by marker=' :forged_rows '(expect 0)'
select coalesce(string_agg(distinct action, ', ' order by action), 'NONE') as forged_actions
  from admin_audit_log where after ? 'forged_by' \gset
\echo 'CONFIRM: (6) forged actions present=' :forged_actions '(expect NONE)'

-- ===========================================================================
-- H-1 (7) — the trusted server-side path must still work
-- ===========================================================================
\echo '=== (7) service_role CAN still execute log_audit_event_as (7 route handlers depend on it) ==='
set role service_role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select log_audit_event_as('00000000-0000-0000-0000-000000000001', 'create_user', 'staff',
  '00000000-0000-0000-0000-000000000004', null, '{"legit_server_side":true}'::jsonb, '{}'::jsonb)
  as svc_log_id \gset
reset role;
select set_config('request.jwt.claims', '', false);
select admin_id as svc_admin, actor_role as svc_role, actor_full_name as svc_name, action as svc_action
  from admin_audit_log where id = :'svc_log_id' \gset
\echo 'CONFIRM: (7) service-role entry written, attributed to=' :svc_admin :svc_role :svc_name 'action=' :svc_action

-- ===========================================================================
-- M-2 EXECUTION TESTS (8-13) — log_audit_event
-- ===========================================================================
\echo '=== (8) anon cannot execute log_audit_event ==='
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select log_audit_event('anon_direct', 'staff', '00000000-0000-0000-0000-0000000000a1',
  null, '{"anon_attempt":true}'::jsonb, '{}'::jsonb);
reset role;
select count(*) as anon_rows from admin_audit_log where after ? 'anon_attempt' \gset
\echo 'CONFIRM: (8) rows written by anon=' :anon_rows '(expect 0)'

\echo '=== (9) an authenticated user CAN execute log_audit_event ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Rita, reception
select log_audit_event('update_staff', 'staff', '00000000-0000-0000-0000-000000000004',
  null, '{"authenticated_direct":true}'::jsonb, '{}'::jsonb) as auth_log_id \gset
reset role;
select admin_id as a_admin, actor_role as a_role from admin_audit_log where id = :'auth_log_id' \gset
\echo 'CONFIRM: (9) authenticated direct call wrote a row attributed to=' :a_admin :a_role

\echo '=== (10) the membership-REGISTRATION dependency still works ==='
-- A SECURITY INVOKER function calling log_audit_event as the caller — the
-- exact shape of register_membership(). If the authenticated grant had been
-- revoked, this is what would break.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select harness_invoker_logs_audit('create_membership') as reg_log_id \gset
reset role;
select admin_id as reg_admin, action as reg_action from admin_audit_log where id = :'reg_log_id' \gset
\echo 'CONFIRM: (10) security-invoker registration path wrote=' :reg_action 'attributed to=' :reg_admin

\echo '=== (11) the membership-RENEWAL dependency still works ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select harness_invoker_logs_audit('renew_membership') as ren_log_id \gset
reset role;
select admin_id as ren_admin, action as ren_action from admin_audit_log where id = :'ren_log_id' \gset
\echo 'CONFIRM: (11) security-invoker renewal path wrote=' :ren_action 'attributed to=' :ren_admin

\echo '=== (12) the record is attributed to the AUTHENTICATED actor, never client-supplied ==='
select case
         when admin_id = '00000000-0000-0000-0000-000000000004'
              and actor_role = 'reception'
              and actor_full_name = 'Rita Reception'
         then 'CORRECTLY_ATTRIBUTED' else 'MISATTRIBUTED' end as attribution
  from admin_audit_log where id = :'ren_log_id' \gset
\echo 'CONFIRM: (12) attribution of the authenticated write=' :attribution

\echo '=== (13) the audit log is unchanged by the unauthorized attempts ==='
-- Six denied calls were attempted (five on log_audit_event_as, one on
-- log_audit_event). Four legitimate writes followed (service_role, the
-- direct authenticated call, and the two invoker paths), so the only
-- correct delta is exactly 4.
select count(*) as rows_after from admin_audit_log \gset
select case when count(*) = 0 then 'NO_UNAUTHORIZED_ROWS' else 'LEAKED' end as unauthorized
  from admin_audit_log where after ? 'forged_by' or after ? 'anon_attempt' \gset
\echo 'CONFIRM: (13) unauthorized rows in the audit log=' :unauthorized
\echo 'CONFIRM: (13) row count before=' :rows_before 'after=' :rows_after '(delta must be exactly the 4 legitimate writes)'
select case when :rows_after - :rows_before = 4 then 'DELTA_OK' else 'DELTA_WRONG' end as delta \gset
\echo 'CONFIRM: (13) delta verdict=' :delta
