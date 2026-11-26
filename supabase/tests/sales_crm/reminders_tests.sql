-- LOCAL ONLY. Smart Reminders P1 (20261126000001_sales_reminders.sql) on Production's shape (Release A + B + Production trigger).
-- Runs as the superuser; employee actions run as the real API role (set role authenticated + JWT claims). Results -> scr.res.
\set ON_ERROR_STOP on
\set salesA  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set salesA2 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c2"}'',false); set role authenticated;'
\set mgrA    'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set mgrB    'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c3"}'',false); set role authenticated;'
\set super   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}'',false); set role authenticated;'
\set recep   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}'',false); set role authenticated;'
\set anon    'select set_config(''request.jwt.claims'',''{"role":"anon"}'',false); set role anon;'
\set su      'reset role; select set_config(''request.jwt.claims'','''',false);'
\pset tuples_only on
\o /dev/null
:su
select scr.keep('own1', $q$select id from public.leads where full_name='own1'$q$), scr.keep('own2', $q$select id from public.leads where full_name='own2'$q$),
       scr.keep('own3', $q$select id from public.leads where full_name='own3'$q$), scr.keep('own4', $q$select id from public.leads where full_name='own4'$q$),
       scr.keep('own5', $q$select id from public.leads where full_name='own5'$q$), scr.keep('pool1', $q$select id from public.leads where full_name='pool1'$q$),
       scr.keep('other1', $q$select id from public.leads where full_name='other1'$q$),
       scr.keep('fu_own1_future', $q$select f.id from public.lead_followups f join public.leads l on l.id=f.lead_id where l.full_name='own1' and f.due_at > now()$q$);
\o
-- ---------------- backfill ----------------
select scr.eq('R01','postgres','backfill: one reminder per pending follow-up of an owned, open lead (none for the unassigned pool, none for completed)',
  $q$select (select count(*) from public.sales_reminders) = (select count(*) from public.lead_followups f join public.leads l on l.id=f.lead_id where f.status='pending' and l.assigned_to is not null and l.status not in ('converted','lost'))
         and not exists (select 1 from public.sales_reminders r join public.leads l on l.id=r.lead_id where l.assigned_to is null)
         and not exists (select 1 from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.status<>'pending')$q$, 'true');
select scr.eq('R02','postgres','backfill: past-due follow-ups -> expired (never sent); future -> scheduled at due - 15 min, owner = lead owner',
  $q$select (select count(*) from public.sales_reminders where due_at <= now() and status <> 'expired') = 0
        and (select status||'/'||(due_at - remind_at)::text||'/'||(owner_id = '00000000-0000-0000-0000-0000000000a4') from public.sales_reminders where followup_id = scr.id('fu_own1_future')) = 'scheduled/00:15:00/true'$q$, 'true');
-- ---------------- create (both write paths) ----------------
:salesA
select scr.val('R03','sales A','legacy screen path: direct INSERT into lead_followups is allowed as before',
  $q$with i as (insert into public.lead_followups (lead_id, branch_id, due_at, note) select id, branch_id, now() + interval '2 days', 'legacy create' from public.leads where full_name='own2' returning id) select count(*)::text from i$q$, '1');
:su
select scr.eq('R04','postgres','legacy create -> exactly one scheduled reminder for the lead owner at due - 15 min',
  $q$select count(*)::text||'/'||min(r.status)||'/'||min((r.due_at - r.remind_at)::text) from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='legacy create'$q$, '1/scheduled/00:15:00');
:salesA
select scr.val('R05','sales A','Release B path: log_lead_interaction with a next action',
  $q$select (public.log_lead_interaction(scr.id('own3'), 'call', 'interested', 'b path', 'call', now() + interval '3 days')) is not null$q$, 'true');
:su
select scr.eq('R06','postgres','Release B: closed follow-ups -> reminders cancelled; the new next action -> one scheduled reminder',
  $q$select (select count(*) from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where r.lead_id=scr.id('own3') and f.status='completed' and r.status<>'cancelled') || '/' ||
            (select count(*) from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where r.lead_id=scr.id('own3') and f.status='pending' and r.status='scheduled')$q$, '0/1');
-- ---------------- reschedule ----------------
\o /dev/null
select scr.keep('r_legacy', $q$select r.id from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='legacy create'$q$);
\o
:salesA
select scr.val('R07','sales A','legacy reschedule: UPDATE due_at',
  $q$with u as (update public.lead_followups set due_at = now() + interval '5 days' where note='legacy create' returning 1) select count(*)::text from u$q$, '1');
:su
select scr.eq('R08','postgres','reschedule moves the SAME reminder row (no duplicate), remind_at = new due - 15 min',
  $q$select count(*)::text||'/'||bool_and(r.id = scr.id('r_legacy'))||'/'||bool_and(r.remind_at = f.due_at - interval '15 minutes')||'/'||min(r.status) from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='legacy create'$q$, '1/true/true/scheduled');
:salesA
select scr.val('R09','sales A','Release B reschedule: set_lead_next_action',
  $q$select (public.set_lead_next_action(scr.id('own3'), 'whatsapp', now() + interval '4 days', 'moved')) is not null$q$, 'true');
:su
select scr.eq('R10','postgres','set_lead_next_action: the replaced follow-up''s reminder cancelled, exactly one scheduled for the lead',
  $q$select count(*) filter (where status='scheduled')::text||'/'||count(*) filter (where status='scheduled' and due_at > now() + interval '3 days 23 hours') from public.sales_reminders where lead_id=scr.id('own3')$q$, '1/1');
-- ---------------- complete / cancel ----------------
:salesA
select scr.val('R11','sales A','legacy complete', $q$with u as (update public.lead_followups set status='completed', completed_at=now() where note='legacy create' returning 1) select count(*)::text from u$q$, '1');
:su
select scr.eq('R12','postgres','complete -> reminder cancelled', $q$select status from public.sales_reminders where id=scr.id('r_legacy')$q$, 'cancelled');
:salesA
select scr.val('R13','sales A','legacy cancel', $q$with u as (update public.lead_followups set status='cancelled' where id=scr.id('fu_own1_future') returning 1) select count(*)::text from u$q$, '1');
:su
select scr.eq('R14','postgres','cancel -> reminder cancelled', $q$select status from public.sales_reminders where followup_id=scr.id('fu_own1_future')$q$, 'cancelled');
-- ---------------- owner change ----------------
\o /dev/null
select scr.su($q$insert into public.lead_followups (lead_id, branch_id, due_at, note) select id, branch_id, now() + interval '2 days', 'own4 future' from public.leads where full_name='own4'$q$);
select scr.su($q$insert into public.sales_reminder_settings (user_id, minutes_before) values ('00000000-0000-0000-0000-0000000000c2', 60)$q$);
\o
:mgrA
select scr.val('R15','manager A','assign_leads own4 -> sales A2 (reason required)',
  $q$select public.assign_leads(array[scr.id('own4')], '00000000-0000-0000-0000-0000000000c2', 'balance workload')::text$q$, '1');
:su
select scr.eq('R16','postgres','owner change: reminder moves to the new owner with the NEW owner''s minutes (60)',
  $q$select (r.owner_id='00000000-0000-0000-0000-0000000000c2')::text||'/'||r.status||'/'||(r.due_at - r.remind_at)::text from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='own4 future'$q$, 'true/scheduled/01:00:00');
:mgrA
select scr.val('R17','manager A','direct unassign of own4 (legacy manager path)', $q$with u as (update public.leads set assigned_to=null where id=scr.id('own4') returning 1) select count(*)::text from u$q$, '1');
:su
select scr.eq('R18','postgres','unassigned lead -> reminders cancelled', $q$select string_agg(distinct status, ',') from public.sales_reminders where lead_id=scr.id('own4')$q$, 'cancelled');
:mgrA
select scr.val('R19','manager A','re-assign own4 -> sales A', $q$select public.assign_leads(array[scr.id('own4')], '00000000-0000-0000-0000-0000000000a4', 'back to A')::text$q$, '1');
:su
select scr.eq('R20','postgres','re-assigned: the future follow-up is scheduled again for sales A (15 min), still ONE row',
  $q$select count(*)::text||'/'||min(r.status)||'/'||min((r.due_at - r.remind_at)::text)||'/'||bool_and(r.owner_id='00000000-0000-0000-0000-0000000000a4') from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='own4 future'$q$, '1/scheduled/00:15:00/true');
-- ---------------- lost / converted ----------------
\o /dev/null
select scr.su($q$insert into public.lead_followups (lead_id, branch_id, due_at, note) select id, branch_id, now() + interval '2 days', 'own5 future' from public.leads where full_name='own5'$q$);
select scr.su($q$insert into public.lead_followups (lead_id, branch_id, due_at, note) select id, branch_id, now() + interval '2 days', 'own2 future2' from public.leads where full_name='own2'$q$);
\o
:salesA
select scr.val('R21','sales A','legacy "mark lost" (direct status update, follow-ups left pending)',
  $q$with u as (update public.leads set status='lost', lost_reason='too_expensive', lost_at=now() where id=scr.id('own5') returning 1) select count(*)::text from u$q$, '1');
:su
select scr.eq('R22','postgres','lost lead -> every reminder of the lead cancelled', $q$select string_agg(distinct status, ',') from public.sales_reminders where lead_id=scr.id('own5')$q$, 'cancelled');
\o /dev/null
select scr.su($q$update public.leads set status='converted', converted_at=now() where full_name='own2'$q$);
\o
select scr.eq('R23','postgres','converted lead -> every reminder cancelled', $q$select string_agg(distinct status, ',') from public.sales_reminders where lead_id=scr.id('own2')$q$, 'cancelled');
\o /dev/null
select scr.su($q$update public.leads set status='follow_up', lost_reason=null, lost_at=null where full_name='own5'$q$);
\o
select scr.eq('R24','postgres','lead reopened -> its pending future follow-up is scheduled again (same row)',
  $q$select count(*)::text||'/'||min(r.status) from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='own5 future'$q$, '1/scheduled');
-- ---------------- duplicate prevention / re-sync ----------------
\o /dev/null
select scr.su($q$create table scr.snap as select id, followup_id, status, remind_at, owner_id from public.sales_reminders$q$);
select scr.su($q$do $d$ declare v uuid; begin for v in select id from public.lead_followups loop perform public.refresh_sales_reminder(v); perform public.refresh_sales_reminder(v); end loop; end $d$$q$);
\o
select scr.eq('R25','postgres','full re-sync twice over every follow-up: no new rows, nothing changed (lists any difference)',
  $q$select string_agg(coalesce(s.status,'NEW')||'->'||coalesce(r.status,'GONE')||' '||coalesce((f.due_at)::text,'')||' lead='||coalesce(l.full_name,'?')||' fstatus='||coalesce(f.status::text,'?'), '; ')
     from public.sales_reminders r full join scr.snap s on s.id = r.id left join public.lead_followups f on f.id = coalesce(r.followup_id, s.followup_id) left join public.leads l on l.id = f.lead_id
     where (s.status, s.remind_at, s.owner_id) is distinct from (r.status, r.remind_at, r.owner_id)$q$, 'NULL');
select scr.tsu('R26','postgres','a second reminder for the same follow-up is impossible (unique followup_id)',
  $q$insert into public.sales_reminders (followup_id, lead_id, branch_id, due_at, remind_at) select followup_id, lead_id, branch_id, due_at, remind_at from public.sales_reminders limit 1$q$, 'DENIED 23505');
\o /dev/null
select scr.su($q$update public.sales_reminders set status='sent', sent_at=now() where followup_id = (select id from public.lead_followups where note='own4 future')$q$);
select scr.su($q$select public.refresh_sales_reminder((select id from public.lead_followups where note='own4 future'))$q$);
\o
select scr.eq('R27','postgres','re-sync never re-sends: a sent reminder stays sent', $q$select r.status from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='own4 future'$q$, 'sent');
\o /dev/null
select scr.su($q$update public.lead_followups set due_at = due_at + interval '1 day' where note='own4 future'$q$);
\o
select scr.eq('R28','postgres','a sent reminder whose follow-up is rescheduled -> scheduled again, sent_at cleared',
  $q$select r.status||'/'||(r.sent_at is null) from public.sales_reminders r join public.lead_followups f on f.id=r.followup_id where f.note='own4 future'$q$, 'scheduled/true');
-- ---------------- settings ----------------
:salesA
select scr.val('R29','sales A','default settings = 15 / push on / calendar off', $q$select minutes_before||'/'||push_enabled||'/'||calendar_enabled from public.get_my_reminder_settings()$q$, '15/true/false');
select scr.val('R30','sales A','change own reminder time to 30', $q$select 'ok' from (select public.set_my_reminder_settings(30)) x$q$, 'ok');
:su
select scr.eq('R31','postgres','changing the minutes re-times only that owner''s scheduled reminders',
  $q$select bool_and((due_at - remind_at) = interval '30 minutes') from public.sales_reminders where owner_id='00000000-0000-0000-0000-0000000000a4' and status='scheduled'$q$, 'true');
:salesA
select scr.t('R32','sales A','out-of-range minutes refused', $q$select public.set_my_reminder_settings(2000)$q$, 'DENIED 22023');
select scr.t('R33','sales A','direct write to the settings table refused', $q$update public.sales_reminder_settings set minutes_before=1$q$, 'DENIED 42501');
select scr.val('R34','sales A','cannot read another employee''s settings', $q$select count(*)::text from public.sales_reminder_settings where user_id <> auth.uid()$q$, '0');
:recep
select scr.t('R35','reception','reception cannot set reminder settings', $q$select public.set_my_reminder_settings(10)$q$, 'DENIED 42501');
-- ---------------- role isolation ----------------
:salesA
select scr.val('R36','sales A','sees only own reminders', $q$select (count(*) = count(*) filter (where owner_id = auth.uid()) and count(*) > 0)::text from public.sales_reminders$q$, 'true');
select scr.t('R37','sales A','cannot write reminders (insert)', $q$insert into public.sales_reminders (followup_id, lead_id, branch_id, due_at, remind_at) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), now(), now())$q$, 'DENIED 42501');
select scr.t('R38','sales A','cannot update / delete reminders', $q$update public.sales_reminders set status='sent'$q$, 'DENIED 42501');
select scr.t('R39','sales A','cannot call the internal sync function', $q$select public.refresh_sales_reminder(gen_random_uuid())$q$, 'DENIED 42501');
:salesA2
select scr.val('R40','sales A2','does not see sales A''s reminders', $q$select count(*)::text from public.sales_reminders where owner_id='00000000-0000-0000-0000-0000000000a4'$q$, '0');
:mgrA
select scr.val('R41','manager A','sees the whole branch A (own + colleagues), nothing from branch B',
  $q$select (count(*) = count(*) filter (where branch_id='aaaaaaaa-0000-0000-0000-00000000000a') and count(distinct owner_id) >= 2)::text from public.sales_reminders$q$, 'true');
:mgrB
select scr.val('R42','manager B','sees no branch A reminder', $q$select count(*)::text from public.sales_reminders where branch_id='aaaaaaaa-0000-0000-0000-00000000000a'$q$, '0');
:super
select scr.val('R43','super admin','sees every reminder', $q$select (count(*) > 0)::text from public.sales_reminders$q$, 'true');
:recep
select scr.val('R44','reception','sees no reminder', $q$select count(*)::text from public.sales_reminders$q$, '0');
:anon
select scr.t('R45','anon','no access at all', $q$select count(*) from public.sales_reminders$q$, 'DENIED 42501');
select scr.t('R46','anon','cannot call reminder RPCs', $q$select public.get_my_reminder_settings()$q$, 'DENIED 42501');
:su
select scr.eq('R47','postgres','no customer name / phone column in the reminder tables',
  $q$select count(*)::text from information_schema.columns where table_schema='public' and table_name in ('sales_reminders','sales_reminder_settings') and (column_name ilike '%name%' or column_name ilike '%phone%')$q$, '0');
