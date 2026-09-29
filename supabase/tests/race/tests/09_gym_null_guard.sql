-- Regression: NULL-bypass in the existing super-admin-only gym RPCs
-- (fixed by 20260929000001_fix_admin_rpc_null_guards.sql).
reset role;

-- Anonymous: every admin RPC must refuse, and nothing may change.
select race_test.anon();
select race_test.throws($$select set_role_permission('reception', 'audit_logs.view', true)$$, 'permission denied',
  'null-guard: anon cannot execute set_role_permission (EXECUTE revoked)');
select race_test.throws($$select set_user_permission_override(race_test.id('nobody'), 'members.view', true)$$, 'permission denied',
  'null-guard: anon cannot execute set_user_permission_override');
select race_test.throws($$select clear_user_permission_override(race_test.id('nobody'), 'members.view')$$, 'permission denied',
  'null-guard: anon cannot execute clear_user_permission_override');
select race_test.throws($$select prepare_staff_deletion(race_test.id('gym_reception'))$$, 'permission denied',
  'null-guard: anon cannot execute prepare_staff_deletion');
select race_test.throws($$select delete_receipt(gen_random_uuid(), 'x')$$, 'permission denied',
  'null-guard: anon cannot execute delete_receipt');

-- Defence in depth: even if EXECUTE were re-granted to anon, the body's own guard refuses.
reset role;
grant execute on function set_role_permission(user_role, text, boolean) to anon;
grant execute on function set_user_permission_override(uuid, text, boolean) to anon;
grant execute on function clear_user_permission_override(uuid, text) to anon;
grant execute on function prepare_staff_deletion(uuid) to anon;
select race_test.anon();
select race_test.throws($$select set_role_permission('reception', 'audit_logs.view', true)$$, 'Only super_admin',
  'null-guard: [guard alone] anon refused by set_role_permission body');
select race_test.throws($$select set_user_permission_override(race_test.id('nobody'), 'members.view', true)$$, 'Only super_admin',
  'null-guard: [guard alone] anon refused by set_user_permission_override body');
select race_test.throws($$select clear_user_permission_override(race_test.id('nobody'), 'members.view')$$, 'Only super_admin',
  'null-guard: [guard alone] anon refused by clear_user_permission_override body');
select race_test.throws($$select prepare_staff_deletion(race_test.id('gym_reception'))$$, 'Only Super Admin',
  'null-guard: [guard alone] anon refused by prepare_staff_deletion body');
reset role;
revoke execute on function set_role_permission(user_role, text, boolean) from anon;
revoke execute on function set_user_permission_override(uuid, text, boolean) from anon;
revoke execute on function clear_user_permission_override(uuid, text) from anon;
revoke execute on function prepare_staff_deletion(uuid) from anon;

-- Deactivated super admin: authenticated (EXECUTE granted) but auth_role() is NULL.
select race_test.make_user('ex_super', 'super_admin', null);
select race_test.login('super');
update profiles set is_active = false where id = race_test.id('ex_super');
select race_test.login('ex_super');
select race_test.throws($$select set_role_permission('reception', 'audit_logs.view', true)$$, 'Only super_admin',
  'null-guard: deactivated super admin refused by set_role_permission');
select race_test.throws($$select set_user_permission_override(race_test.id('nobody'), 'members.view', true)$$, 'Only super_admin',
  'null-guard: deactivated super admin refused by set_user_permission_override');
select race_test.throws($$select clear_user_permission_override(race_test.id('nobody'), 'members.view')$$, 'Only super_admin',
  'null-guard: deactivated super admin refused by clear_user_permission_override');
select race_test.throws($$select prepare_staff_deletion(race_test.id('gym_reception'))$$, 'Only Super Admin',
  'null-guard: deactivated super admin refused by prepare_staff_deletion');
select race_test.throws($$select delete_receipt(gen_random_uuid(), 'x')$$, 'Only Super Admin',
  'null-guard: deactivated super admin refused by delete_receipt');

-- Non-admin signed-in staff: still refused (unchanged behaviour).
select race_test.login('gym_reception');
select race_test.throws($$select set_role_permission('reception', 'audit_logs.view', true)$$, 'Only super_admin',
  'null-guard: reception still refused');
select race_test.throws($$select delete_receipt(gen_random_uuid(), 'x')$$, 'Only Super Admin', 'null-guard: reception still cannot delete receipts');

-- Nothing leaked: the permission matrix is unchanged.
reset role;
select race_test.ok(not exists (select 1 from role_permissions where role = 'reception' and permission_key = 'audit_logs.view')
                    and not exists (select 1 from user_permission_overrides where profile_id = race_test.id('nobody')),
  'null-guard: permission matrix untouched by all refused attempts');

-- Active super admin: still works (fixed guard must not lock out the legitimate caller).
select race_test.login('super');
select set_role_permission('reception', 'audit_logs.view', true);
select race_test.ok(exists (select 1 from role_permissions where role = 'reception' and permission_key = 'audit_logs.view'),
  'null-guard: active super admin can still grant a role permission');
select set_role_permission('reception', 'audit_logs.view', false);
select set_user_permission_override(race_test.id('nobody'), 'members.view', true);
select clear_user_permission_override(race_test.id('nobody'), 'members.view');
select race_test.ok(not exists (select 1 from role_permissions where role = 'reception' and permission_key = 'audit_logs.view')
                    and not exists (select 1 from user_permission_overrides where profile_id = race_test.id('nobody')),
  'null-guard: active super admin can still revoke, override and clear');
select race_test.throws($$select delete_receipt(gen_random_uuid(), '')$$, 'reason is required',
  'null-guard: active super admin passes the guard (fails later on the missing reason, as before)');
select race_test.throws($$select prepare_staff_deletion(auth.uid())$$, 'cannot delete your own',
  'null-guard: active super admin passes the guard (self-delete rule still applies)');
reset role;
