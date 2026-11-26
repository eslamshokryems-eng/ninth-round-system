-- Smart Reminders P3 — scheduler (Supabase pg_cron + pg_net). NOT a migration: run once per environment, after
-- 20261127000001_sales_reminders_push.sql, by the owner with explicit approval. Needs two Vault secrets created beforehand
-- (dashboard → Vault, never in this file or in git):
--   reminder_dispatch_url     e.g. https://app.9throundegypt.com/api/reminders/dispatch
--   reminder_dispatch_secret  the same random value as the app's REMINDER_DISPATCH_SECRET env var
-- Every minute the job checks for due work in the database and calls the app ONLY when something is due.
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'sales-reminders-dispatch',
  '* * * * *',
  $job$
  select net.http_post(
           url := (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_dispatch_url'),
           headers := jsonb_build_object('Content-Type', 'application/json',
                        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'reminder_dispatch_secret')),
           body := '{}'::jsonb,
           timeout_milliseconds := 20000)
   where public.reminders_due_count() > 0;
  $job$
);

-- Teardown (sales_reminders_cron_teardown): select cron.unschedule('sales-reminders-dispatch');
