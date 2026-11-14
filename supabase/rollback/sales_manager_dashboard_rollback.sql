-- Rollback for 20261125000001_sales_manager_dashboard.sql — read-only functions only; no data involved.
drop function if exists public.get_attention_leads(text, uuid, uuid, integer, integer);
drop function if exists public.get_sales_team_summary(uuid, date, date);
drop function if exists public.get_sales_team_overview(uuid, date, date);
