-- Sales Smart Reminders — P1 (database only). Additive; requires Release B (20261124000001).
--
-- One reminder per follow-up, kept in sync by triggers, so EVERY write path is covered: the legacy screens that write
-- lead_followups directly (insert / reschedule / complete / cancel) and the Release B functions (log_lead_interaction,
-- set_lead_next_action). Owner = the lead's CURRENT owner (leads.assigned_to), never the follow-up's creator.
--
--   sales_reminder_settings  per employee: minutes_before (default 15), push / calendar switches. Changed only via RPC.
--   sales_reminders          desired state of each follow-up's reminder; written only by definer functions.
--     scheduled  pending follow-up, owned, lead open, due in the future      -> P3 dispatcher sends it at remind_at
--     expired    pending follow-up whose due time had already passed when the reminder was (re)computed (never sent;
--                avoids a burst of notifications for old overdue follow-ups at backfill)
--     sent       delivered by P3 (kept while due_at / owner do not change)
--     cancelled  follow-up completed / cancelled, lead unassigned / lost / converted
--     failed     reserved for P3 (delivery gave up)
-- The sync trigger NEVER blocks the follow-up / lead write: an unexpected error is downgraded to a WARNING.
-- No customer name or phone is stored here (minimal data: ids and times only).
-- Rollback: supabase/rollback/sales_reminders_rollback.sql (reminders are derived data and can be rebuilt).

-- ---------------------------------------------------------------------------
-- 1. tables
-- ---------------------------------------------------------------------------
create table public.sales_reminder_settings (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  minutes_before   integer not null default 15 check (minutes_before between 0 and 1440),
  push_enabled     boolean not null default true,
  calendar_enabled boolean not null default false,
  updated_at       timestamptz not null default now()
);
comment on table public.sales_reminder_settings is 'Per-employee reminder preferences. Missing row = defaults (15 minutes, push on, calendar off). Written only through set_my_reminder_settings().';

create table public.sales_reminders (
  id           uuid primary key default gen_random_uuid(),
  followup_id  uuid not null unique references public.lead_followups(id) on delete cascade,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  branch_id    uuid not null references public.branches(id),
  owner_id     uuid references public.profiles(id) on delete set null,
  due_at       timestamptz not null,
  remind_at    timestamptz not null,
  status       text not null default 'scheduled' check (status in ('scheduled', 'expired', 'sent', 'cancelled', 'failed')),
  sent_at      timestamptz,
  attempts     integer not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_sales_reminders_due on public.sales_reminders (remind_at) where status = 'scheduled';
create index idx_sales_reminders_owner on public.sales_reminders (owner_id, status);
create index idx_sales_reminders_lead on public.sales_reminders (lead_id);
comment on table public.sales_reminders is 'One reminder per follow-up (followup_id unique = no duplicates). Desired state maintained by triggers on lead_followups, leads and sales_reminder_settings.';

-- ---------------------------------------------------------------------------
-- 2. RLS / grants: read own (manager: branch, Super Admin: all). Nobody writes directly.
-- ---------------------------------------------------------------------------
alter table public.sales_reminder_settings enable row level security;
alter table public.sales_reminders enable row level security;
revoke all on table public.sales_reminder_settings, public.sales_reminders from public, anon, authenticated, service_role;
grant select on table public.sales_reminder_settings, public.sales_reminders to authenticated;

create policy "own reminder settings read" on public.sales_reminder_settings for select
  using (user_id = (select auth.uid()));
create policy "sales reminders read" on public.sales_reminders for select
  using (
    owner_id = (select auth.uid())
    or (select public.auth_role()) = 'super_admin'
    or ((select public.auth_role()) = 'branch_manager' and branch_id = (select public.my_sales_branch()))
  );

-- ---------------------------------------------------------------------------
-- 3. the single sync rule
-- ---------------------------------------------------------------------------
create or replace function public.refresh_sales_reminder(p_followup_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  f public.lead_followups%rowtype;
  l public.leads%rowtype;
  r public.sales_reminders%rowtype;
  v_minutes integer;
  v_active boolean;
  v_status text;
  v_remind timestamptz;
begin
  select * into f from public.lead_followups where id = p_followup_id;
  if f.id is null then return; end if;
  select * into l from public.leads where id = f.lead_id;
  select * into r from public.sales_reminders where followup_id = p_followup_id;

  v_active := f.status = 'pending' and l.id is not null and l.assigned_to is not null and l.status not in ('converted', 'lost');
  if not v_active then
    if r.id is not null and r.status in ('scheduled', 'expired') then
      update public.sales_reminders set status = 'cancelled', updated_at = now() where id = r.id;
    end if;
    return;   -- no row is created for a follow-up that never needs a reminder
  end if;

  select coalesce((select s.minutes_before from public.sales_reminder_settings s where s.user_id = l.assigned_to), 15) into v_minutes;
  v_remind := f.due_at - make_interval(mins => v_minutes);

  -- already delivered for this exact time and owner: keep it 'sent' (re-sync must never re-send)
  if r.id is not null and r.status = 'sent' and r.due_at = f.due_at and r.owner_id is not distinct from l.assigned_to then
    return;
  end if;
  v_status := case when f.due_at <= now() then 'expired' else 'scheduled' end;

  insert into public.sales_reminders (followup_id, lead_id, branch_id, owner_id, due_at, remind_at, status)
  values (f.id, f.lead_id, f.branch_id, l.assigned_to, f.due_at, v_remind, v_status)
  on conflict (followup_id) do update
     set lead_id = excluded.lead_id, branch_id = excluded.branch_id, owner_id = excluded.owner_id,
         due_at = excluded.due_at, remind_at = excluded.remind_at, status = excluded.status,
         sent_at = case when public.sales_reminders.status = 'sent' and excluded.status = 'scheduled' then null else public.sales_reminders.sent_at end,
         attempts = case when excluded.status = 'scheduled' then 0 else public.sales_reminders.attempts end,
         last_error = case when excluded.status = 'scheduled' then null else public.sales_reminders.last_error end,
         updated_at = now()
   where (public.sales_reminders.lead_id, public.sales_reminders.branch_id, public.sales_reminders.owner_id,
          public.sales_reminders.due_at, public.sales_reminders.remind_at, public.sales_reminders.status)
         is distinct from
         (excluded.lead_id, excluded.branch_id, excluded.owner_id, excluded.due_at, excluded.remind_at, excluded.status);
end $$;
revoke all on function public.refresh_sales_reminder(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. triggers (never block the business write)
-- ---------------------------------------------------------------------------
create or replace function public.trg_sync_reminder_from_followup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.refresh_sales_reminder(new.id);
  exception when others then
    raise warning 'sales reminder sync skipped for follow-up %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.trg_sync_reminder_from_followup() from public, anon, authenticated, service_role;
create trigger trg_sales_reminder_followup
  after insert or update of due_at, status, lead_id on public.lead_followups
  for each row execute function public.trg_sync_reminder_from_followup();

create or replace function public.trg_sync_reminders_from_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  begin
    for v_id in select f.id from public.lead_followups f where f.lead_id = new.id and f.status = 'pending'
                union select s.followup_id from public.sales_reminders s where s.lead_id = new.id and s.status in ('scheduled', 'expired', 'sent') loop
      perform public.refresh_sales_reminder(v_id);
    end loop;
  exception when others then
    raise warning 'sales reminder sync skipped for lead %: %', new.id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.trg_sync_reminders_from_lead() from public, anon, authenticated, service_role;
create trigger trg_sales_reminder_lead
  after update of assigned_to, status on public.leads
  for each row when (old.assigned_to is distinct from new.assigned_to or old.status is distinct from new.status)
  execute function public.trg_sync_reminders_from_lead();

create or replace function public.trg_sync_reminders_from_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  begin
    for v_id in select s.followup_id from public.sales_reminders s where s.owner_id = new.user_id and s.status in ('scheduled', 'expired') loop
      perform public.refresh_sales_reminder(v_id);
    end loop;
  exception when others then
    raise warning 'sales reminder sync skipped for settings of %: %', new.user_id, sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.trg_sync_reminders_from_settings() from public, anon, authenticated, service_role;
create trigger trg_sales_reminder_settings
  after insert or update of minutes_before on public.sales_reminder_settings
  for each row execute function public.trg_sync_reminders_from_settings();

-- ---------------------------------------------------------------------------
-- 5. employee RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_my_reminder_settings()
returns table (minutes_before integer, push_enabled boolean, calendar_enabled boolean)
language sql stable security definer set search_path = '' as $$
  select coalesce(s.minutes_before, 15), coalesce(s.push_enabled, true), coalesce(s.calendar_enabled, false)
  from (select auth.uid() as uid) me
  left join public.sales_reminder_settings s on s.user_id = me.uid
  where me.uid is not null;
$$;
revoke all on function public.get_my_reminder_settings() from public, anon;
grant execute on function public.get_my_reminder_settings() to authenticated;

create or replace function public.set_my_reminder_settings(p_minutes_before integer default null, p_push_enabled boolean default null, p_calendar_enabled boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if (select public.auth_role()) not in ('sales_employee', 'branch_manager', 'super_admin') then
    raise exception 'Reminders are available to Sales accounts only.' using errcode = '42501'; end if;
  if p_minutes_before is not null and (p_minutes_before < 0 or p_minutes_before > 1440) then
    raise exception 'Reminder time must be between 0 and 1440 minutes.' using errcode = '22023'; end if;
  insert into public.sales_reminder_settings (user_id, minutes_before, push_enabled, calendar_enabled)
  values (v_uid, coalesce(p_minutes_before, 15), coalesce(p_push_enabled, true), coalesce(p_calendar_enabled, false))
  on conflict (user_id) do update
     set minutes_before   = coalesce(p_minutes_before, public.sales_reminder_settings.minutes_before),
         push_enabled     = coalesce(p_push_enabled, public.sales_reminder_settings.push_enabled),
         calendar_enabled = coalesce(p_calendar_enabled, public.sales_reminder_settings.calendar_enabled),
         updated_at = now();
end $$;
revoke all on function public.set_my_reminder_settings(integer, boolean, boolean) from public, anon;
grant execute on function public.set_my_reminder_settings(integer, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. backfill: pending follow-ups only (past-due ones become 'expired' = never sent)
-- ---------------------------------------------------------------------------
do $$
declare v_id uuid;
begin
  for v_id in select id from public.lead_followups where status = 'pending' order by id loop
    perform public.refresh_sales_reminder(v_id);
  end loop;
end $$;
