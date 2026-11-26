-- LOCAL ONLY. Smart Reminders P3 (20261127000001_sales_reminders_push.sql), part A: devices + fixtures for claiming.
\set ON_ERROR_STOP on
\set salesA  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set salesA2 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c2"}'',false); set role authenticated;'
\set recep   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}'',false); set role authenticated;'
\set inact   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c5"}'',false); set role authenticated;'
\set anon    'select set_config(''request.jwt.claims'',''{"role":"anon"}'',false); set role anon;'
\set su      'reset role; select set_config(''request.jwt.claims'','''',false);'
\set K1 '''BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'''
\set A1 '''tBHItJI5svbpez7KI4CCXg'''
\pset tuples_only on
:salesA
select scr.val('P01','sales A','register a device (Chrome / FCM endpoint)',
  $q$select 'ok' from (select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/devA1', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$, 'android', 'UA')) x$q$, 'ok');
select scr.val('P02','sales A','register an iPhone Home Screen device (web.push.apple.com)',
  $q$select 'ok' from (select public.register_push_subscription('https://web.push.apple.com/QAbc-devA2', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$, 'ios', 'UA')) x$q$, 'ok');
select scr.t('P03','sales A','internal / non-push endpoints refused (no SSRF)',
  $q$select public.register_push_subscription('https://169.254.169.254/latest/meta-data', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$)$q$, 'DENIED 22023');
select scr.t('P04','sales A','plain http / look-alike host refused',
  $q$select public.register_push_subscription('https://fcm.googleapis.com.evil.example/x', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$)$q$, 'DENIED 22023');
select scr.t('P05','sales A','malformed keys refused', $q$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'short', 'k')$q$, 'DENIED 22023');
select scr.t('P06','sales A','direct write to push_subscriptions refused', $q$update public.push_subscriptions set user_id = gen_random_uuid()$q$, 'DENIED 42501');
select scr.t('P07','sales A','employee cannot call the dispatcher functions', $q$select * from public.claim_due_reminders(1)$q$, 'DENIED 42501');
select scr.t('P08','sales A','employee cannot complete a delivery', $q$select public.complete_reminder_delivery(gen_random_uuid(), gen_random_uuid(), 'sent')$q$, 'DENIED 42501');
:recep
select scr.t('P09','reception','reception cannot register a device', $q$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/r', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$)$q$, 'DENIED 42501');
:inact
select scr.t('P10','inactive emp.','deactivated employee cannot register a device', $q$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/i', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$)$q$, 'DENIED 42501');
:anon
select scr.t('P11','anon','anonymous cannot register', $q$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/a', 'x', 'y')$q$, 'DENIED 42501');
:salesA2
select scr.val('P12','sales A2','own device + a shared phone previously registered by sales A (moves to the signed-in employee)',
  $q$select 'ok' from (select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/devC1', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$, 'android'),
                             public.register_push_subscription('https://fcm.googleapis.com/fcm/send/devShared', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$, 'android')) x$q$, 'ok');
select scr.val('P13','sales A2','sees only own devices', $q$select count(*)::text||'/'||count(*) filter (where user_id = auth.uid()) from public.push_subscriptions$q$, '2/2');
:salesA
select scr.val('P14','sales A','sees only own devices (not the colleague''s)', $q$select string_agg(right(endpoint, 5), ',' order by endpoint) from public.push_subscriptions$q$, 'devA1,devA2');
select scr.val('P15','sales A','turn reminders off on one device', $q$select 'ok' from (select public.unregister_push_subscription('https://web.push.apple.com/QAbc-devA2')) x$q$, 'ok');
select scr.val('P16','sales A','cannot turn off a colleague''s device', $q$select 'ok' from (select public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/devC1')) x$q$, 'ok');
:su
select scr.eq('P17','postgres','unregister revoked only the caller''s own device', $q$select string_agg(right(endpoint,5)||':'||(revoked_at is not null), ',' order by endpoint) from public.push_subscriptions$q$, 'devA1:false,devC1:false,hared:false,devA2:true');
select scr.eq('P18','postgres','shared phone now belongs to sales A2', $q$select user_id::text from public.push_subscriptions where endpoint like '%devShared'$q$, '00000000-0000-0000-0000-0000000000c2');
\o /dev/null
-- device limit check as sales A: 9 more devices allowed (10 active), the 11th refused
:salesA
select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/lim'||g, :K1, :A1) from generate_series(1,9) g;
\o
select scr.t('P19','sales A','11th active device refused', $q$select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/lim10', $q$ || quote_literal(:K1) || $q$, $q$ || quote_literal(:A1) || $q$)$q$, 'DENIED 22023');
:su
\o /dev/null
update public.push_subscriptions set revoked_at = now() where endpoint like '%/lim%';
-- fixtures for claiming: due reminders (follow-up in 10 min; sales A reminds 30 min before -> already due)
insert into public.leads (full_name, phone, branch_id, assigned_to, created_by)
select 'push'||g, '0150000'||lpad(g::text,4,'0'), 'aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a2' from generate_series(1,12) g;
insert into public.leads (full_name, phone, branch_id, assigned_to, created_by) values
 ('pushI','01500009901','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c5','00000000-0000-0000-0000-0000000000a2'),
 ('pushD','01500009902','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a2'),
 ('pushN','01500009903','bbbbbbbb-0000-0000-0000-00000000000b','00000000-0000-0000-0000-0000000000c4','00000000-0000-0000-0000-0000000000c3'),
 ('pushP','01500009904','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a2');
insert into public.sales_reminder_settings (user_id, minutes_before) values ('00000000-0000-0000-0000-0000000000c5', 30), ('00000000-0000-0000-0000-0000000000c4', 30)
  on conflict (user_id) do update set minutes_before = 30;
update public.sales_reminder_settings set minutes_before = 30, push_enabled = false where user_id = '00000000-0000-0000-0000-0000000000c2';
insert into public.lead_followups (lead_id, branch_id, due_at, status, created_by)
select id, branch_id, case when full_name = 'pushP' then now() + interval '1 second' else now() + interval '10 minutes' end, 'pending', created_by
  from public.leads where full_name like 'push%';
select pg_sleep(1.2);
\o
select scr.eq('P20','postgres','fixtures: 16 due reminders scheduled (12 for sales A + inactive + push-off + no-device + about-to-pass)',
  $q$select count(*)::text from public.sales_reminders r join public.leads l on l.id = r.lead_id where l.full_name like 'push%' and r.status = 'scheduled' and r.remind_at <= now()$q$, '16');
