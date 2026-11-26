-- Rollback of 20261126000001_sales_reminders.sql. Removes ONLY the reminder objects. Reminders are derived data
-- (rebuilt by re-applying the migration); employee reminder settings are lost. Leads / follow-ups are not touched.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop trigger if exists trg_sales_reminder_followup on public.lead_followups;
drop trigger if exists trg_sales_reminder_lead on public.leads;
drop trigger if exists trg_sales_reminder_settings on public.sales_reminder_settings;
drop function if exists public.trg_sync_reminder_from_followup();
drop function if exists public.trg_sync_reminders_from_lead();
drop function if exists public.trg_sync_reminders_from_settings();
drop function if exists public.set_my_reminder_settings(integer, boolean, boolean);
drop function if exists public.get_my_reminder_settings();
drop function if exists public.refresh_sales_reminder(uuid);
drop table if exists public.sales_reminders;
drop table if exists public.sales_reminder_settings;
commit;
