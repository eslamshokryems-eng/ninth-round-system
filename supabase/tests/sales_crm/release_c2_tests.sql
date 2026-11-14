-- LOCAL ONLY. Release C part 2: safe conversion + write-path integrity. Runs after B and C1 tests on the same database, with Production's
-- leftover 20-argument register_membership overload present (prodshape_overload.sql), i.e. Production's real shape.
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off
\set act_super  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}'',false); set role authenticated;'
\set act_mgrA   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set act_recepA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}'',false); set role authenticated;'
\set act_salesA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set act_salesA2 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c2"}'',false); set role authenticated;'
\set act_mgrB   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c3"}'',false); set role authenticated;'
\set act_salesB 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c4"}'',false); set role authenticated;'
\set act_anon   'select set_config(''request.jwt.claims'',''{"role":"anon"}'',false); set role anon;'
\set done 'reset role;'
\set MT '''cccccccc-0000-0000-0000-0000000000c1'''

select scr.su($f$create or replace function scr.v(p text) returns text language sql stable as $b$ select v from scr.ctx where k=p $b$; grant execute on function scr.v(text) to public$f$);
-- fixtures (as postgres): conversion leads, each with one pending follow-up
select scr.su($f$
  insert into public.leads (full_name, phone, branch_id, assigned_to, created_by, gender) values
   ('conv1','0150000001','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2','male'),
   ('conv2','0150000002','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2','female'),
   ('conv3','0150000003','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null),
   ('conv4','0150000004','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null),
   ('conv5','0150000005','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null),
   ('convpool','0150000006','aaaaaaaa-0000-0000-0000-00000000000a',null,'00000000-0000-0000-0000-0000000000a2',null),
   ('convinactive','0150000007','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000a2',null),
   ('convA2','0150000008','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2',null),
   ('convB','0150000009','bbbbbbbb-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000c3',null),
   ('convdupe','0150000010','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null),
   ('convlost','0150000011','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null),
   ('convrace','0150000012','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null),
   ('convrace2','0150000013','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null),
   ('convwrap','0150000014','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2',null);
  insert into public.lead_followups (lead_id, branch_id, due_at, status, created_by)
  select id, branch_id, now() + interval '1 day', 'pending', created_by from public.leads where full_name like 'conv%';
  insert into public.members (branch_id, full_name, phone) values ('aaaaaaaa-0000-0000-0000-00000000000a','Existing member','0150000010');
  insert into public.membership_types (id, name, duration_days, price, is_active) values ('cccccccc-0000-0000-0000-0000000000c9','RS Retired',30,500,false) on conflict (id) do nothing;
$f$);
select scr.keep(n, format('select id::text from public.leads where full_name=%L', n)) from unnest(array['conv1','conv2','conv3','conv4','conv5','convpool','convinactive','convA2','convB','convdupe','convlost','convrace','convrace2','convwrap']) n;
select scr.keep('ms_before', 'select count(*)::text from public.memberships');
select scr.keep('pay_before', 'select count(*)::text from public.membership_payments');

-- ---------------- the Production bug, reproduced ----------------
select scr.valsu('V00','postgres','Production shape: two register_membership overloads exist (20 and 21 arguments)','select count(*)::text from pg_proc where proname=''register_membership''','2');
:act_salesA
select scr.t('V00b','sales A','the OLD positional call used by Production''s convert_lead_to_member (19 arguments)',
 $q$select * from public.register_membership('aaaaaaaa-0000-0000-0000-00000000000a','x','0159999999',null,null,null,'cccccccc-0000-0000-0000-0000000000c1','RX-0',1000,0,current_date,'cash',null,null,null,null,null,null,null)$q$,
 '^DENIED 42725 function public.register_membership');
:done

-- ---------------- happy path: owner converts own lead ----------------
:act_salesA
select membership_id as v01_ms, membership_number as v01_no, already_converted as v01_ac
  from public.convert_lead(p_lead_id => (select scr.id('conv1')), p_membership_type_id => :MT, p_receipt_number => 'RC-0001', p_price => 1000, p_discount => 100,
                           p_start_date => current_date, p_payment_method => 'cash', p_program_type => 'boxing') \gset
:done
select scr.keep('v01_ms', format('select %L', :'v01_ms')), scr.keep('v01_no', format('select %L', :'v01_no')), scr.keep('v01_ac', format('select %L', :'v01_ac'));
select scr.eq('V01','sales A (owner)','convert own lead: membership created, first time','select (scr.v(''v01_ac'')=''f'' and coalesce(scr.v(''v01_no''),'''')<>'''')::text','true');
select scr.eq('V02','sales A (owner)','attribution: sold_by = lead owner, created_by = converter, payment received_by = converter, amount = price - discount, program kept',
 $q$select concat_ws('/', ms.sold_by='00000000-0000-0000-0000-0000000000a4', ms.created_by='00000000-0000-0000-0000-0000000000a4',
        (select received_by='00000000-0000-0000-0000-0000000000a4' and amount=900 from public.membership_payments p where p.membership_id=ms.id), ms.program_type='boxing')
    from public.memberships ms where ms.id=scr.id('v01_ms')$q$,'t/t/t/t');
select scr.eq('V03','sales A (owner)','lead converted & linked; exactly one membership + one payment; pending follow-ups closed; conversion row + history + audit event',
 $q$select concat_ws('/', l.status, l.converted_member_id = c.member_id,
    (select count(*) from public.memberships where id=c.membership_id), (select count(*) from public.membership_payments where membership_id=c.membership_id),
    (select count(*) from public.lead_followups where lead_id=l.id and status='pending'),
    (select count(*) from public.lead_activities where lead_id=l.id and kind='conversion'),
    (select count(*) from public.admin_audit_log where action='convert_lead' and target_id=l.id))
    from public.leads l join public.lead_conversions c on c.lead_id=l.id where l.id=scr.id('conv1')$q$,'converted/t/1/1/0/1/1');

-- retry / double-click: same call again -> same result, nothing new
:act_salesA
select membership_id as v04_ms, already_converted as v04_ac
  from public.convert_lead(p_lead_id => (select scr.id('conv1')), p_membership_type_id => :MT, p_receipt_number => 'RC-0001-RETRY', p_price => 1000, p_discount => 0,
                           p_start_date => current_date, p_payment_method => 'cash') \gset
:done
select scr.keep('v04_ms', format('select %L', :'v04_ms')), scr.keep('v04_ac', format('select %L', :'v04_ac'));
select scr.eq('V04','sales A (owner)','retry after success (double click, network retry with other data): returns the SAME membership, already_converted, nothing created',
 $q$select concat_ws('/', scr.v('v04_ms')=scr.v('v01_ms'), scr.v('v04_ac')='t', (select count(*) from public.memberships where receipt_number='RC-0001-RETRY'),
   (select count(*) from public.memberships)::bigint - scr.v('ms_before')::bigint, (select count(*) from public.membership_payments)::bigint - scr.v('pay_before')::bigint)$q$,'t/t/0/1/1');

-- ---------------- manager converts an employee's lead: credit stays with the owner ----------------
:act_mgrA
select membership_id as v05_ms from public.convert_lead(p_lead_id => (select scr.id('conv2')), p_membership_type_id => :MT, p_receipt_number => 'RC-0002', p_price => 1000, p_discount => 0,
                           p_start_date => current_date, p_payment_method => 'visa') \gset
:done
select scr.keep('v05_ms', format('select %L', :'v05_ms'));
select scr.eq('V05','manager A','manager converts sales A''s lead: sold_by = sales A (owner), created_by = received_by = manager',
 $q$select concat_ws('/', ms.sold_by='00000000-0000-0000-0000-0000000000a4', ms.created_by='00000000-0000-0000-0000-0000000000a2',
   (select received_by from public.membership_payments where membership_id=ms.id)='00000000-0000-0000-0000-0000000000a2',
   (select lead_owner='00000000-0000-0000-0000-0000000000a4' and converted_by='00000000-0000-0000-0000-0000000000a2' from public.lead_conversions where membership_id=ms.id))
   from public.memberships ms where ms.id=scr.id('v05_ms')$q$,'t/t/t/t');

-- ---------------- authorization ----------------
:act_salesA
select scr.t('V06','sales A','convert a colleague''s lead (IDOR by id)',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X6', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('convA2')),'^DENIED 42501');
select scr.t('V07','sales A','convert a branch B lead',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X7', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('convB')),'^DENIED 42501');
select scr.t('V08','sales A','convert an unknown lead id','select * from public.convert_lead(p_lead_id=>gen_random_uuid(), p_membership_type_id=>''cccccccc-0000-0000-0000-0000000000c1'', p_receipt_number=>''RC-X8'', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>''cash'')','^DENIED 42501');
:done
:act_mgrB
select scr.t('V09','manager B','convert a branch A lead',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X9', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 42501');
:done
:act_recepA
select scr.t('V10','reception A','convert a lead of its own branch (not a Sales role)',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X10', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 42501');
:done
:act_anon
select scr.t('V11','anon','convert','select * from public.convert_lead(p_lead_id=>gen_random_uuid(), p_membership_type_id=>''cccccccc-0000-0000-0000-0000000000c1'', p_receipt_number=>''RC-X11'', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>''cash'')','^DENIED 42501');
select scr.t('V11b','anon','finalize a conversion directly','select public.finalize_lead_conversion(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())','^DENIED 42501');
:done

-- ---------------- business rules / validation (nothing may be created) ----------------
:act_mgrA
select scr.t('V12','manager A','convert an UNASSIGNED lead (no owner to credit)',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X12', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('convpool')),'^DENIED 22023 Assign this lead');
select scr.t('V13','manager A','convert a lead whose owner is deactivated',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X13', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('convinactive')),'^DENIED 22023 The lead owner is no longer active');
:done
:act_salesA
select scr.t('V14a','sales A','no membership type',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>null, p_receipt_number=>'RC-X14', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 22023 Choose the membership');
select scr.t('V14b','sales A','blank receipt number',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'  ', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 22023 Enter the receipt');
select scr.t('V14c','sales A','negative price',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X14c', p_price=>-1, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 22023 Enter a valid price');
select scr.t('V14d','sales A','discount larger than the price',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X14d', p_price=>100, p_discount=>200, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 22023 The discount');
select scr.t('V14e','sales A','no payment method',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X14e', p_price=>100, p_discount=>0, p_start_date=>current_date, p_payment_method=>null)$q$, scr.id('conv3')),'^DENIED 22023 Choose the payment');
select scr.t('V14f','sales A','no start date',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X14f', p_price=>100, p_discount=>0, p_start_date=>null, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 22023 Choose the start');
select scr.t('V15','sales A','receipt number already used by another membership',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-0001', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('conv3')),'^DENIED 23505 Receipt number RC-0001 is already used');
select scr.t('V16','sales A','lead phone already belongs to a member',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X16', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('convdupe')),'^DENIED 23505 This phone number already belongs');
:done
-- registration itself fails AFTER the checks (inactive membership type raised inside register_membership): everything rolls back
:act_salesA
\set ON_ERROR_STOP off
select * from public.convert_lead(p_lead_id => (select scr.id('conv3')), p_membership_type_id => 'cccccccc-0000-0000-0000-0000000000c9', p_receipt_number => 'RC-FAIL', p_price => 500, p_discount => 0, p_start_date => current_date, p_payment_method => 'cash');
:done
select scr.eq('V17b','postgres','after the failed conversion: no member, no membership, no payment, lead untouched with its pending follow-up, no history row',
 $q$select concat_ws('/', (select count(*) from public.members where phone='0150000003'), (select count(*) from public.memberships where receipt_number='RC-FAIL'),
    (select status from public.leads where id=scr.id('conv3')), (select count(*) from public.lead_followups where lead_id=scr.id('conv3') and status='pending'),
    (select count(*) from public.lead_activities where lead_id=scr.id('conv3') and kind not in ('assignment')), (select count(*) from public.lead_conversions where lead_id=scr.id('conv3')))$q$,'0/0/new/1/0/0');

-- ---------------- lost / reopen ----------------
:act_salesA
select scr.t('V18','sales A','mark own lead lost',format('select public.mark_lead_lost(%L, ''too_expensive'', ''budget'')', scr.id('convlost')),'^ALLOWED');
select public.mark_lead_lost(scr.id('convlost'), 'too_expensive', 'budget');
select scr.t('V19','sales A','convert a LOST lead',format($q$select * from public.convert_lead(p_lead_id=>%L, p_membership_type_id=>'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number=>'RC-X19', p_price=>1000, p_discount=>0, p_start_date=>current_date, p_payment_method=>'cash')$q$, scr.id('convlost')),'^DENIED 22023 This lead is marked lost');
select scr.t('V20','sales A','reopen without a next action time',format('select public.reopen_lead(%L, ''call'', null)', scr.id('convlost')),'^DENIED 22023');
select public.reopen_lead(scr.id('convlost'), 'call', now() + interval '2 days', 'came back');
select scr.t('V21','sales A','reopen a lead that is not lost',format('select public.reopen_lead(%L, ''call'', now()+interval ''1 day'')', scr.id('conv4')),'^DENIED 22023 Only a lost lead');
select scr.t('V22','sales A','mark a colleague''s lead lost',format('select public.mark_lead_lost(%L, ''other'')', scr.id('convA2')),'^DENIED 42501');
:done
select scr.eq('V23','postgres','lost -> reopened: status follow_up, lost fields cleared, exactly one pending follow-up, two status_change history rows',
 $q$select concat_ws('/', status, lost_reason is null, (select count(*) from public.lead_followups where lead_id=l.id and status='pending'),
   (select count(*) from public.lead_activities where lead_id=l.id and kind='status_change')) from public.leads l where id=scr.id('convlost')$q$,'follow_up/t/1/2');

-- ---------------- direct writes can no longer bypass the rules ----------------
:act_salesA
select scr.t('W01','sales A','direct UPDATE status=converted on own lead (fake conversion, finding F3)',format('update public.leads set status=''converted'' where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W02','sales A','direct UPDATE converted_member_id on own lead',format('update public.leads set converted_member_id=(select id from public.members limit 1) where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W03','sales A','direct UPDATE status=lost (bypassing reason + history)',format('update public.leads set status=''lost'' where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W04','sales A','direct UPDATE interest_level',format('update public.leads set interest_level=''hot'' where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W05','sales A','direct UPDATE assigned_to (give own lead away)',format('update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000c2'' where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W06','sales A','profile fields stay editable (name / phone / notes)',format('update public.leads set full_name=''conv4 renamed'', interest_notes=''likes boxing'' where id=%L', scr.id('conv4')),'^ALLOWED rows=1$');
select scr.t('W07','sales A','INSERT a lead already converted',$q$insert into public.leads (full_name, phone, branch_id, status, created_by) values ('fake','0159990001','aaaaaaaa-0000-0000-0000-00000000000a','converted','00000000-0000-0000-0000-0000000000a4')$q$,'^(BLOCKED-BY-GUARD|DENIED) 42501');
select scr.t('W08','sales A','INSERT a normal new lead (still allowed, owned by self)',$q$insert into public.leads (full_name, phone, branch_id, created_by) values ('fresh','0159990002','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4')$q$,'^ALLOWED rows=1$');
select scr.t('W09','sales A','direct INSERT of a follow-up',format('insert into public.lead_followups (lead_id, branch_id, due_at, created_by) values (%L,''aaaaaaaa-0000-0000-0000-00000000000a'',now()+interval ''1 day'',''00000000-0000-0000-0000-0000000000a4'')', scr.id('conv4')),'^(BLOCKED-BY-GUARD|DENIED) 42501');
select scr.t('W10','sales A','direct UPDATE completing a follow-up (lead left without next action)',format('update public.lead_followups set status=''completed'' where lead_id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W11','sales A','direct DELETE of a follow-up',format('delete from public.lead_followups where lead_id=%L', scr.id('conv4')),'^(BLOCKED-BY-GUARD 42501|ALLOWED rows=0$)');
select scr.t('W12','sales A','finalize with a membership that was NOT created in this transaction (link an old sale to a lead)',format('select public.finalize_lead_conversion(%L, (select member_id from public.memberships where id=%L), %L)', scr.id('conv4'), scr.id('v01_ms'), scr.id('v01_ms')),'^BLOCKED-BY-GUARD 42501');
select member_id as w12_mem, membership_id as w12_ms from public.register_membership(p_branch_id => 'aaaaaaaa-0000-0000-0000-00000000000a', p_full_name => 'Earlier walk-in sale', p_phone => '0158888888', p_gender => null,
   p_date_of_birth => null, p_national_id => null, p_membership_type_id => 'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number => 'RC-EARLIER', p_price => 1000, p_discount => 0,
   p_start_date => current_date, p_payment_method => 'cash', p_notes => null, p_sold_by => '00000000-0000-0000-0000-0000000000a4') \gset
select scr.t('W12b','sales A','finalize with a valid, UNLINKED membership the same employee sold earlier (separate transaction) — claim an old sale as a lead conversion',
 format('select public.finalize_lead_conversion(%L, %L, %L)', scr.id('conv4'), :'w12_mem', :'w12_ms'),'^BLOCKED-BY-GUARD 42501');
select scr.t('W13','sales A','write to lead_conversions directly',format('insert into public.lead_conversions (lead_id, branch_id, member_id, membership_id) select %L, branch_id, member_id, id from public.memberships where id=%L', scr.id('conv4'), scr.id('v01_ms')),'^DENIED 42501');
:done
:act_mgrA
select scr.t('W14','manager A','direct UPDATE status=converted (manager too)',format('update public.leads set status=''converted'' where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W15','manager A','direct reassignment without a reason (must use Assign)',format('update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000c2'' where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
select scr.t('W16','manager A','edit or delete conversion history',format('delete from public.lead_conversions where lead_id=%L', scr.id('conv1')),'^(DENIED 42501|BLOCKED-BY-GUARD 42501|ALLOWED rows=0$)');
:done
:act_super
select scr.t('W17','super admin','direct UPDATE status=converted',format('update public.leads set status=''converted'' where id=%L', scr.id('conv4')),'^BLOCKED-BY-GUARD 42501');
:done
select scr.tsu('W18','postgres (owner)','UPDATE / DELETE / TRUNCATE lead_conversions',format('delete from public.lead_conversions where lead_id=%L', scr.id('conv1')),'^BLOCKED-BY-GUARD 42501');

-- ---------------- visibility of conversions ----------------
:act_salesA
select scr.val('X01','sales A','reads own conversions only (conv1, conv2 credited to sales A)','select count(*)::text from public.lead_conversions','2');
select scr.val('X02','sales A','conversion details on the lead page',format('select converted_by_name from public.get_lead_conversion(%L)', scr.id('conv2')),'RS Manager A');
:done
:act_salesA2
select scr.val('X03','sales A2','sees no conversion credited to someone else','select count(*)::text from public.lead_conversions','0');
:done
:act_mgrB
select scr.val('X04','manager B','sees no branch A conversion','select count(*)::text from public.lead_conversions','0');
:done
:act_mgrA
select scr.val('X05','manager A','sees every branch A conversion','select count(*)::text from public.lead_conversions','2');
select scr.val('X06','manager A','team summary counts the conversions in the period','select converted_in_period::text from public.get_sales_team_summary()', (select count(*)::text from public.leads where status='converted' and branch_id='aaaaaaaa-0000-0000-0000-00000000000a'));
:done

-- ---------------- old entry point ----------------
:act_salesA
select membership_number as v24_no from public.convert_lead_to_member(scr.id('convwrap'), :MT, 'RC-WRAP', 1000, 0, current_date, 'instapay', null) \gset
:done
select scr.keep('v24_no', format('select %L', :'v24_no'));
select scr.eq('V24','sales A','the old convert_lead_to_member signature now works (was 42725 in Production) and credits the owner',
 $q$select concat_ws('/', (select status from public.leads where id=scr.id('convwrap')), ms.sold_by='00000000-0000-0000-0000-0000000000a4', ms.membership_number=scr.v('v24_no'))
    from public.memberships ms where ms.receipt_number='RC-WRAP'$q$,'converted/t/t');

-- ---------------- catalog ----------------
select scr.valsu('G01','postgres','convert_lead is INVOKER (member/membership/payment RLS applies); finalize_lead_conversion, mark_lead_lost, reopen_lead are DEFINER with empty search_path',
 $q$select string_agg(proname||':'||case when prosecdef then 'definer' else 'invoker' end||':'||coalesce(array_to_string(proconfig,','),''), ' ' order by proname) from pg_proc
    where pronamespace='public'::regnamespace and proname in ('convert_lead','finalize_lead_conversion','mark_lead_lost','reopen_lead')$q$,
 'convert_lead:invoker:search_path=public, pg_temp finalize_lead_conversion:definer:search_path="" mark_lead_lost:definer:search_path="" reopen_lead:definer:search_path=""');
select scr.valsu('G02','postgres','no EXECUTE for anon / PUBLIC on the new functions',
 $q$select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in ('convert_lead','finalize_lead_conversion','mark_lead_lost','reopen_lead','get_lead_conversion','convert_lead_to_member')
   and (has_function_privilege('anon', p.oid, 'execute') or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type='EXECUTE'))$q$,'0');
