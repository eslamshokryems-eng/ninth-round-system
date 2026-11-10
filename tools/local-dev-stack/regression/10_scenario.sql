\set QUIET on
\pset tuples_only on
\pset format unaligned
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set MT '''cccccccc-0000-0000-0000-0000000000c1'''

-- act as <role> <uuid|none>
\set act_super   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}'',false); set role authenticated;'
\set act_mgr     'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set act_recep   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}'',false); set role authenticated;'
\set act_sales   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set act_coach   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a5"}'',false); set role authenticated;'
\set act_recepb  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a6"}'',false); set role authenticated;'
\set act_cust    'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a7"}'',false); set role authenticated;'
\set act_anon    'select set_config(''request.jwt.claims'',''{"role":"anon"}'',false); set role anon;'
\set act_service 'select set_config(''request.jwt.claims'',''{"role":"service_role"}'',false); set role service_role;'

\echo '##### RECEPTION (branch A)'
:act_recep
select rs.val('recep who-am-i is_admin', 'select is_admin()::text');
select rs.val('recep is_super_admin', 'select is_super_admin()::text');
select rs.val('recep is_branch_staff(A)', format('select is_branch_staff(%L::uuid)::text', :A));
select rs.val('recep is_branch_staff(B)', format('select is_branch_staff(%L::uuid)::text', :B));
select rs.keep('m1', format($q$select member_id::text from register_membership(%L::uuid,'RS Member One','01000000001','male',date '1995-01-01','29501010000001',%L::uuid,'RS-R-001',1000,0,date '2026-01-10','cash',null)$q$, :A, :MT));
select rs.try('recep register in branch B', format($q$select * from register_membership(%L::uuid,'RS Cross','01000000002','male',date '1995-01-01','29501010000002',%L::uuid,'RS-R-002',1000,0,date '2026-01-10','cash',null)$q$, :B, :MT));
select rs.try('recep renew member', format($q$select * from renew_membership((select v from rs.ctx where k='m1')::uuid,%L::uuid,'RS-R-003',1000,0,'visa',null)$q$, :MT));
select rs.try('recep check-in member', $q$select * from check_in_member((select v from rs.ctx where k='m1')::uuid)$q$);
select rs.try('recep second check-in same day', $q$select * from check_in_member((select v from rs.ctx where k='m1')::uuid)$q$);
select rs.try('recep lookup', $q$select * from reception_member_lookup('RS Member')$q$);
select rs.cnt('recep sees members','members');
select rs.cnt('recep sees memberships','memberships');
select rs.cnt('recep sees membership_payments','membership_payments');
select rs.cnt('recep sees check_ins','check_ins');
select rs.cnt('recep sees leads','leads');
select rs.cnt('recep sees profiles','profiles');
select rs.cnt('recep sees admin_audit_log','admin_audit_log');
select rs.try('recep direct insert member', format($q$insert into members(branch_id,full_name,phone) values (%L::uuid,'x','1')$q$, :A));
select rs.try('recep direct delete payments', $q$delete from membership_payments$q$);
select rs.try('recep escalate own role', $q$update profiles set role='super_admin' where id='00000000-0000-0000-0000-0000000000a3'$q$);
select rs.try('recep move own branch', format($q$update profiles set branch_id=%L::uuid where id='00000000-0000-0000-0000-0000000000a3'$q$, :B));
select rs.try('recep log_audit_event (allowed)', $q$select log_audit_event('rs_test','rs_entity',null,null,null,'{}'::jsonb)$q$);
select rs.try('recep log_audit_event_as', $q$select log_audit_event_as('00000000-0000-0000-0000-0000000000a1','rs_forged','rs_entity',null,null,null,'{}'::jsonb)$q$);
select rs.try('recep delete_receipt', $q$select delete_receipt((select id from membership_payments order by created_at limit 1),'rs test')$q$);
reset role;

\echo '##### RECEPTION (branch B) isolation'
:act_recepb
select rs.cnt('recepB sees members (should be 0)','members');
select rs.try('recepB check-in A member', $q$select * from check_in_member((select v from rs.ctx where k='m1')::uuid)$q$);
select rs.try('recepB renew A member', format($q$select * from renew_membership((select v from rs.ctx where k='m1')::uuid,%L::uuid,'RS-R-009',1000,0,'cash',null)$q$, :MT));
reset role;

\echo '##### SALES (branch A)'
:act_sales
select rs.keep('l1', format($q$insert into leads(branch_id,full_name,phone,created_by,assigned_to) values (%L::uuid,'RS Lead','01100000001','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a4') returning id::text$q$, :A));
select rs.try('sales insert lead assigned to a colleague', format($q$insert into leads(branch_id,full_name,phone,created_by,assigned_to) values (%L::uuid,'RS Lead2','01100000002','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a3')$q$, :A));
select rs.try('sales update own lead status', $q$update leads set status='contacted' where id=(select v from rs.ctx where k='l1')::uuid$q$);
select rs.try('sales reassign lead to colleague', $q$update leads set assigned_to='00000000-0000-0000-0000-0000000000a3' where id=(select v from rs.ctx where k='l1')::uuid$q$);
select rs.try('sales lead in branch B', format($q$insert into leads(branch_id,full_name,phone,created_by) values (%L::uuid,'x','1','00000000-0000-0000-0000-0000000000a4')$q$, :B));
select rs.try('sales convert lead to member', format($q$select * from convert_lead_to_member((select v from rs.ctx where k='l1')::uuid,%L::uuid,'RS-S-001',1000,0,date '2026-01-11','cash',null)$q$, :MT));
select rs.try('sales sales_performance', format($q$select * from get_sales_performance(%L::uuid,date '2026-01-01',date '2026-12-31')$q$, :A));
select rs.cnt('sales sees leads','leads');
select rs.cnt('sales sees members','members');
select rs.cnt('sales sees memberships','memberships');
select rs.try('sales delete lead followups', $q$delete from lead_followups$q$);
select rs.try('sales escalate own role', $q$update profiles set role='branch_manager' where id='00000000-0000-0000-0000-0000000000a4'$q$);
reset role;

\echo '##### MANAGER (branch A)'
:act_mgr
select rs.val('mgr is_admin','select is_admin()::text');
select rs.val('mgr is_super_admin','select is_super_admin()::text');
select rs.try('mgr sell additional membership', format($q$select * from sell_additional_membership((select v from rs.ctx where k='m1')::uuid,%L::uuid,'RS-M-001',500,0,date '2026-02-01','cash',null)$q$, :MT));
select rs.cnt('mgr sees members','members');
select rs.cnt('mgr sees admin_audit_log','admin_audit_log');
select rs.try('mgr read branch B members', format($q$select * from members where branch_id=%L::uuid$q$, :B));
select rs.try('mgr changes role of own-branch reception (allowed for branch manager)', $q$update profiles set role='branch_manager' where id='00000000-0000-0000-0000-0000000000a3'$q$);
select rs.try('mgr log_audit_event_as', $q$select log_audit_event_as('00000000-0000-0000-0000-0000000000a1','rs_forged','rs_entity',null,null,null,'{}'::jsonb)$q$);
reset role;

\echo '##### COACH (branch A)'
:act_coach
select rs.try('coach check-in self path', $q$select * from check_in_member((select v from rs.ctx where k='m1')::uuid)$q$);
select rs.cnt('coach sees members','members');
select rs.cnt('coach sees leads','leads');
select rs.try('coach insert lead', format($q$insert into leads(branch_id,full_name,phone) values (%L::uuid,'x','1')$q$, :A));
reset role;

\echo '##### SUPER ADMIN'
:act_super
select rs.val('super is_admin','select is_admin()::text');
select rs.val('super is_super_admin','select is_super_admin()::text');
select rs.cnt('super sees members','members');
select rs.cnt('super sees admin_audit_log','admin_audit_log');
select rs.try('super reads both branches', 'select * from branches');
reset role;

\echo '##### CUSTOMER / ANON'
:act_cust
select rs.val('cust is_admin','select is_admin()::text');
select rs.cnt('cust sees members','members');
select rs.cnt('cust sees payments','membership_payments');
select rs.try('cust register membership', format($q$select * from register_membership(%L::uuid,'x','1','male',date '1990-01-01','1',%L::uuid,'RS-X',1,0,date '2026-01-10','cash',null)$q$, :A, :MT));
select rs.try('cust log_audit_event_as', $q$select log_audit_event_as('00000000-0000-0000-0000-0000000000a1','rs_forged','rs_entity',null,null,null,'{}'::jsonb)$q$);
reset role;
:act_anon
select rs.val('anon is_admin','select is_admin()::text');
select rs.cnt('anon sees members','members');
select rs.cnt('anon sees profiles','profiles');
select rs.try('anon log_audit_event', $q$select log_audit_event('rs','rs',null,null,null,'{}'::jsonb)$q$);
select rs.try('anon log_audit_event_as', $q$select log_audit_event_as('00000000-0000-0000-0000-0000000000a1','rs_forged','rs_entity',null,null,null,'{}'::jsonb)$q$);
reset role;

\echo '##### SERVICE ROLE (staff-management routes)'
:act_service
select rs.try('service promotes profile', $q$update profiles set phone='01234' where id='00000000-0000-0000-0000-0000000000a3'$q$);
select rs.try('service log_audit_event_as (staff routes depend on it)', $q$select log_audit_event_as('00000000-0000-0000-0000-0000000000a1','rs_staff_route','rs_entity',null,null,null,'{}'::jsonb)$q$);
select rs.try('service sets role', $q$update profiles set role='reception' where id='00000000-0000-0000-0000-0000000000a3'$q$);
reset role;

\echo '##### FINAL DATA STATE (superuser view)'
select 'members=' || count(*) from members;
select 'memberships=' || count(*) from memberships;
select 'membership_payments=' || count(*) from membership_payments;
select 'check_ins=' || count(*) from check_ins;
select 'leads=' || count(*) || ' converted=' || count(*) filter (where converted_member_id is not null) from leads;
select 'audit actions: ' || string_agg(action || 'x' || n, ', ' order by action) from (select action, count(*) n from admin_audit_log where action not like 'challenge%' group by action) s;
