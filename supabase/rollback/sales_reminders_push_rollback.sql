-- Rollback of 20261127000001_sales_reminders_push.sql (P3). Run sales_reminders_cron_teardown first if the cron job was set up.
-- Removes the push objects only; P1 reminders stay (the two lease columns are dropped). Registered devices are lost.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
drop function if exists public.reminders_due_count();
drop function if exists public.complete_reminder_delivery(uuid, uuid, text, text, text[], text[]);
drop function if exists public.confirm_reminder_claim(uuid, uuid);
drop function if exists public.claim_due_reminders(integer);
drop function if exists public.unregister_push_subscription(text);
drop function if exists public.register_push_subscription(text, text, text, text, text);
drop trigger if exists trg_sales_reminder_void_claim on public.sales_reminders;
drop function if exists public.trg_reminder_void_claim();
alter table public.sales_reminders drop column if exists claim_token, drop column if exists claimed_until;
drop table if exists public.push_subscriptions;
drop function if exists public.push_endpoint_allowed(text);
commit;
