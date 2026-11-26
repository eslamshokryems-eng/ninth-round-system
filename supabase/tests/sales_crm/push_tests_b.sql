-- LOCAL ONLY. Smart Reminders P3, part B (after the concurrent-claim run): claim outcomes, stale claims, retries, gone devices.
\set ON_ERROR_STOP on
\set salesA  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set mgrA    'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set su      'reset role; select set_config(''request.jwt.claims'','''',false);'
\pset tuples_only on
:su
select scr.eq('P22','postgres','claim-time checks: inactive owner -> failed, push off -> failed, no device -> failed, due time passed -> expired (never sent)',
  $q$select string_agg(l.full_name||'='||r.status||coalesce(':'||r.last_error,''), ',' order by l.full_name) from public.sales_reminders r join public.leads l on l.id = r.lead_id where l.full_name in ('pushD','pushI','pushN','pushP')$q$,
  'pushD=failed:push_disabled,pushI=failed:owner_inactive,pushN=failed:no_device,pushP=expired');
\o /dev/null
-- fresh claims with tokens for the outcome tests (leases from the concurrent run cleared)
update public.sales_reminders set claim_token = null, claimed_until = null, attempts = 0 where lead_id in (select id from public.leads where full_name ~ '^push[0-9]+$');
create table scr.claims as select c.*, l.full_name from public.claim_due_reminders(50) c join public.leads l on l.id = c.lead_id;
\o
select scr.eq('P23','postgres','claim returns the 12 due reminders of sales A with his ACTIVE device only', $q$select count(*)||'/'||min(jsonb_array_length(subscriptions))||'/'||min(subscriptions->0->>'endpoint') from scr.claims$q$, '12/1/https://fcm.googleapis.com/fcm/send/devA1');
select scr.eq('P24','postgres','claim output carries no customer data (no name / phone fields)', $q$select string_agg(k, ',' order by k) from (select distinct jsonb_object_keys(to_jsonb(c) - 'full_name') k from scr.claims c) x$q$, 'claim_token,due_at,kind,lead_id,owner_id,reminder_id,subscriptions');
select scr.eq('P25','postgres','a second dispatcher right now gets nothing (lease)', $q$select count(*)::text from public.claim_due_reminders(50)$q$, '0');
-- stale: reschedule / cancel / reassign / lost / deactivated after the claim
:salesA
\o /dev/null
update public.lead_followups set due_at = now() + interval '1 hour' where lead_id = (select id from public.leads where full_name='push1') and status='pending';
update public.lead_followups set status = 'cancelled' where lead_id = (select id from public.leads where full_name='push2') and status='pending';
update public.leads set status = 'lost', lost_reason = 'too_expensive', lost_at = now() where full_name = 'push7';
\o
:mgrA
\o /dev/null
select public.assign_leads(array[(select id from public.leads where full_name='push3')], '00000000-0000-0000-0000-0000000000c2', 'cover shift');
\o
:su
select scr.eq('P26','postgres','confirm is FALSE for rescheduled / cancelled / reassigned / lost claims, TRUE for an untouched one',
  $q$select string_agg(full_name||'='||public.confirm_reminder_claim(reminder_id, claim_token), ',' order by full_name) from scr.claims where full_name in ('push1','push2','push3','push7','push4')$q$,
  'push1=false,push2=false,push3=false,push4=true,push7=false');
select scr.eq('P27','postgres','"sent" for a stale claim is ignored',
  $q$select string_agg(full_name||'='||public.complete_reminder_delivery(reminder_id, claim_token, 'sent', null, array['https://fcm.googleapis.com/fcm/send/devA1']), ',' order by full_name) from scr.claims where full_name in ('push1','push2','push3','push7')$q$,
  'push1=false,push2=false,push3=false,push7=false');
select scr.eq('P28','postgres','after the stale results: rescheduled -> scheduled for the NEW time; cancelled / lost -> cancelled; reassigned -> scheduled for the new owner',
  $q$select string_agg(l.full_name||'='||r.status||':'||(r.sent_at is null)||':'||(r.owner_id = '00000000-0000-0000-0000-0000000000c2'), ',' order by l.full_name) from public.sales_reminders r join public.leads l on l.id=r.lead_id join public.lead_followups f on f.id=r.followup_id where l.full_name in ('push1','push2','push3','push7') and f.created_at > now() - interval '1 hour'$q$,
  'push1=scheduled:true:false,push2=cancelled:true:false,push3=scheduled:true:true,push7=cancelled:true:false');
\o /dev/null
update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000a4';
\o
select scr.eq('P29','postgres','owner deactivated after the claim -> confirm FALSE', $q$select public.confirm_reminder_claim(reminder_id, claim_token)::text from scr.claims where full_name='push8'$q$, 'false');
\o /dev/null
update public.profiles set is_active = true where id = '00000000-0000-0000-0000-0000000000a4';
\o
-- normal delivery + duplicates
\o /dev/null
select scr.keep('p30', $q$select public.complete_reminder_delivery(reminder_id, claim_token, 'sent', null, array['https://fcm.googleapis.com/fcm/send/devA1'])::text from scr.claims where full_name='push4'$q$);
\o
select scr.eq('P30','postgres','delivered: sent once, device marked healthy',
  $q$select (select v from scr.ctx where k='p30')||'/'||r.status||'/'||(r.sent_at is not null)||'/'||(select (last_success_at is not null)::text from public.push_subscriptions where endpoint like '%devA1')
     from public.sales_reminders r join scr.claims c on c.reminder_id = r.id where c.full_name='push4'$q$, 'true/sent/true/true');
select scr.eq('P31','postgres','the same result again changes nothing (duplicate completion)', $q$select public.complete_reminder_delivery(reminder_id, claim_token, 'sent')::text from scr.claims where full_name='push4'$q$, 'false');
\o /dev/null
update public.sales_reminders set claim_token = null, claimed_until = null where lead_id in (select id from public.leads where full_name ~ '^push[0-9]+$') and status = 'scheduled';
\o
select scr.eq('P32','postgres','a sent reminder is never claimed again; re-claim after leases end returns only unsent ones',
  $q$select (not exists (select 1 from public.claim_due_reminders(50) c join public.leads l on l.id=c.lead_id where l.full_name in ('push4','push2','push7')))::text$q$, 'true');
-- retries with backoff, then give up after 3 attempts
\o /dev/null
drop table scr.claims;
update public.sales_reminders set claim_token = null, claimed_until = null, attempts = 0 where lead_id = (select id from public.leads where full_name='push5');
create table scr.claims as select c.*, l.full_name from public.claim_due_reminders(50) c join public.leads l on l.id = c.lead_id where l.full_name = 'push5';
select public.complete_reminder_delivery(reminder_id, claim_token, 'retry', 'push_transient_503') from scr.claims;
\o
select scr.eq('P33','postgres','transient failure -> stays scheduled, attempt 1, not claimable for ~1 minute (backoff)',
  $q$select r.status||'/'||r.attempts||'/'||(r.claimed_until between now() + interval '50 seconds' and now() + interval '70 seconds')||'/'||(select count(*) from public.claim_due_reminders(50) c where c.reminder_id = r.id) from public.sales_reminders r join public.leads l on l.id=r.lead_id where l.full_name='push5'$q$, 'scheduled/1/true/0');
\o /dev/null
do $d$ declare c record; i int; begin
  for i in 1..2 loop
    update public.sales_reminders set claimed_until = now() - interval '1 second' where lead_id = (select id from public.leads where full_name='push5');
    for c in select * from public.claim_due_reminders(50) x where x.lead_id = (select id from public.leads where full_name='push5') loop
      perform public.complete_reminder_delivery(c.reminder_id, c.claim_token, 'retry', 'push_transient_503');
    end loop;
  end loop; end $d$;
\o
select scr.eq('P34','postgres','third transient failure -> failed (max 3 attempts), never retried again',
  $q$select r.status||'/'||r.attempts||'/'||r.last_error from public.sales_reminders r join public.leads l on l.id=r.lead_id where l.full_name='push5'$q$, 'failed/3/push_transient_503');
-- gone device (HTTP 404/410)
\o /dev/null
drop table scr.claims;
update public.sales_reminders set claim_token = null, claimed_until = null where lead_id = (select id from public.leads where full_name='push6');
create table scr.claims as select c.*, l.full_name from public.claim_due_reminders(50) c join public.leads l on l.id = c.lead_id where l.full_name = 'push6';
select public.complete_reminder_delivery(reminder_id, claim_token, 'failed', 'all_devices_gone', '{}', array['https://fcm.googleapis.com/fcm/send/devA1','https://fcm.googleapis.com/fcm/send/devC1']) from scr.claims;
\o
select scr.eq('P35','postgres','410 / 404 -> that owner''s device revoked (a colleague''s device in the list is NOT touched); reminder failed',
  $q$select (select string_agg(right(endpoint,5)||':'||(revoked_at is not null), ',' order by endpoint) from public.push_subscriptions where endpoint ~ 'devA1|devC1')||'/'||
            (select r.status||':'||r.last_error from public.sales_reminders r join public.leads l on l.id=r.lead_id where l.full_name='push6')$q$, 'devA1:true,devC1:false/failed:all_devices_gone');
\o /dev/null
update public.sales_reminders set claim_token = null, claimed_until = null where status = 'scheduled';
\o
\o /dev/null
select scr.keep('p36', $q$select count(*)::text from public.claim_due_reminders(50)$q$);
\o
select scr.eq('P36','postgres','owner with no device left -> remaining due reminders fail as no_device at the next claim (nothing sent)',
  $q$select (select v from scr.ctx where k='p36')||'/'||(select count(*) from public.sales_reminders r join public.leads l on l.id=r.lead_id where l.full_name in ('push8','push9','push10','push11','push12') and r.status='failed' and r.last_error='no_device')$q$, '0/5');
select scr.eq('P37','postgres','no customer name / phone column in push_subscriptions', $q$select count(*)::text from information_schema.columns where table_schema='public' and table_name='push_subscriptions' and (column_name ilike '%name%' or column_name ilike '%phone%')$q$, '0');
select scr.eq('P38','postgres','cron probe reports only a count', $q$select pg_typeof(public.reminders_due_count())::text$q$, 'integer');
