-- 9. Existing gym-system regression checks, run AFTER all race migrations.
-- (run.sh step 4 already proves every non-race object is unchanged; these
-- prove the existing business flows still behave the same end-to-end.)
reset role;

select race_test.login('gym_reception');
select race_test.ok(has_permission('members.view') and has_permission('checkins.create')
                    and not has_permission('race.events.create') and not has_permission('audit_logs.view'),
  'gym: reception permission set unchanged (members/check-ins yes; race/audit no)');

select race_test.put('member_1', (select member_id from register_membership(
  p_branch_id => race_test.id('branch_a'), p_full_name => 'Gym Member One', p_phone => '01099990001',
  p_gender => 'male', p_date_of_birth => '1990-01-01', p_national_id => null,
  p_membership_type_id => (select id from membership_types where name = 'One Month'),
  p_receipt_number => 'R-RACE-0001', p_price => 1000, p_discount => 0, p_start_date => current_date,
  p_payment_method => 'cash', p_notes => null)));
select race_test.ok(race_test.id('member_1') is not null, 'gym: register_membership() works for reception');
select race_test.ok((select member_code is not null from members where id = race_test.id('member_1')),
  'gym: sequential member code still assigned');
select race_test.ok((select count(*) = 1 from check_in_member(race_test.id('member_1'))), 'gym: check_in_member() works');
select race_test.ok(race_test.count($$select 1 from members where id = race_test.id('member_1')$$) = 1,
  'gym: reception reads members of own branch');
select race_test.eq(race_test.count($$select 1 from admin_audit_log$$), 0::bigint, 'gym: reception still cannot read the audit log');
select race_test.throws($$update profiles set role = 'super_admin' where id = auth.uid()$$, 'Only a branch manager',
  'gym: self-promotion still blocked by protect_privileged_profile_columns()');

select race_test.login('bm_b');
select race_test.eq(race_test.count($$select 1 from members where id = race_test.id('member_1')$$), 0::bigint,
  'gym: branch isolation intact — branch B manager cannot see branch A member');
select race_test.ok(has_permission('members.view') and has_permission('race.events.create'),
  'gym: branch manager keeps gym permissions (+ additive race.events.create)');

select race_test.login('super');
select race_test.ok(exists (select 1 from admin_audit_log where action = 'check_in')
                    and exists (select 1 from admin_audit_log where target_table = 'member' or target_table = 'members' or action like '%member%'),
  'gym: existing audit triggers still log gym actions (check_in, membership)');
select race_test.ok(race_test.count($$select 1 from admin_audit_log where target_table like 'race\_%'$$) > 0
                    and race_test.count($$select 1 from admin_audit_log where target_table not like 'race\_%'$$) > 0,
  'gym: super admin audit view shows gym and race entries together (single audit log)');

select race_test.login('master');  -- gym role: coach
select race_test.ok(has_permission('members.view') and not has_permission('members.create'),
  'gym: a coach who is also race MASTER_CONTROL gains no extra gym permissions');
select race_test.eq(race_test.count($$select 1 from membership_payments$$), 0::bigint,
  'gym: race role does not open gym financial data to a coach');

select race_test.login('judge1');  -- gym role: member (external official)
select race_test.eq(race_test.count($$select 1 from members$$), 0::bigint,
  'gym: an external judge (gym role member) sees no gym members');
reset role;
