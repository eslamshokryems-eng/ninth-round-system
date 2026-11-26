-- Sales Smart Reminders — P3 (Web Push delivery). Additive; requires P1 (20261126000001_sales_reminders.sql).
--
--   push_subscriptions        an employee's devices (browser / Home Screen PWA). Written only through register / unregister RPCs.
--   sales_reminders           + claim_token / claimed_until: a short lease so concurrent dispatchers never send the same reminder twice.
--   claim_due_reminders()     service-only. FOR UPDATE SKIP LOCKED + lease. Re-checks the LIVE follow-up / lead / owner before claiming.
--   confirm_reminder_claim()  service-only. Called right before sending: the claim is still current (not rescheduled / cancelled /
--                             reassigned / owner deactivated).
--   complete_reminder_delivery() service-only. Records sent / retry (backoff, max 3 attempts) / failed; revokes gone (404/410) devices.
--                             A result for a stale claim is ignored.
-- No customer name or phone is stored or returned: ids, times and the follow-up kind only.
-- Rollback: supabase/rollback/sales_reminders_push_rollback.sql.

-- ---------------------------------------------------------------------------
-- 1. devices
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  platform        text not null default 'other' check (platform in ('android', 'ios', 'desktop', 'other')),
  user_agent      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count   integer not null default 0,
  revoked_at      timestamptz
);
create index idx_push_subscriptions_user on public.push_subscriptions (user_id) where revoked_at is null;
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated, service_role;
grant select on table public.push_subscriptions to authenticated;
create policy "own push devices read" on public.push_subscriptions for select using (user_id = (select auth.uid()));
comment on table public.push_subscriptions is 'Employee devices for Web Push reminders. Only register_push_subscription / unregister_push_subscription write here.';

-- Only the real browser push services may be called by the dispatcher (no SSRF to internal hosts).
create or replace function public.push_endpoint_allowed(p_endpoint text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    p_endpoint ~ '^https://[A-Za-z0-9.-]+(:443)?/[^\s]*$' and length(p_endpoint) <= 1024 and (
      substring(p_endpoint from '^https://([^/:]+)') in ('fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com')
      or substring(p_endpoint from '^https://([^/:]+)') ~ '\.(push\.apple\.com|notify\.windows\.com|push\.services\.mozilla\.com)$'
    ), false);
$$;

-- ---------------------------------------------------------------------------
-- 2. lease columns on P1's table (additive)
-- ---------------------------------------------------------------------------
alter table public.sales_reminders add column claim_token uuid, add column claimed_until timestamptz;

-- Any change of time / owner / status made by P1's sync (reschedule, cancel, reassign, lost, converted) voids an in-flight claim,
-- so a dispatcher holding the old claim can neither confirm it nor record it as sent.
create or replace function public.trg_reminder_void_claim()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.claim_token is not distinct from old.claim_token then
    new.claim_token := null;
    new.claimed_until := null;
  end if;
  return new;
end $$;
revoke all on function public.trg_reminder_void_claim() from public, anon, authenticated, service_role;
create trigger trg_sales_reminder_void_claim
  before update on public.sales_reminders
  for each row when (old.claim_token is not null and (old.due_at, old.remind_at, old.owner_id, old.status) is distinct from (new.due_at, new.remind_at, new.owner_id, new.status))
  execute function public.trg_reminder_void_claim();

-- ---------------------------------------------------------------------------
-- 3. employee RPCs
-- ---------------------------------------------------------------------------
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_platform text default 'other', p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if (select public.auth_role()) not in ('sales_employee', 'branch_manager', 'super_admin')
     or not coalesce((select p.is_active from public.profiles p where p.id = v_uid), false) then
    raise exception 'Reminders are available to active Sales accounts only.' using errcode = '42501'; end if;
  if not public.push_endpoint_allowed(p_endpoint) then
    raise exception 'This browser''s push service is not supported.' using errcode = '22023'; end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{16,32}={0,2}$' then
    raise exception 'Invalid push subscription keys.' using errcode = '22023'; end if;
  if (select count(*) from public.push_subscriptions s where s.user_id = v_uid and s.revoked_at is null and s.endpoint <> p_endpoint) >= 10 then
    raise exception 'Too many devices. Turn reminders off on a device you no longer use.' using errcode = '22023'; end if;
  -- the same browser signed in by another employee now belongs to the current one (shared devices)
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, platform, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth,
          case when p_platform in ('android', 'ios', 'desktop') then p_platform else 'other' end, left(p_user_agent, 300))
  on conflict (endpoint) do update
     set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, platform = excluded.platform,
         user_agent = excluded.user_agent, revoked_at = null, failure_count = 0, updated_at = now();
end $$;
revoke all on function public.register_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  update public.push_subscriptions set revoked_at = now(), updated_at = now()
   where endpoint = p_endpoint and user_id = auth.uid() and revoked_at is null;
end $$;
revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. dispatcher (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_due_reminders(p_limit integer default 50)
returns table (reminder_id uuid, claim_token uuid, lead_id uuid, owner_id uuid, due_at timestamptz, kind text, subscriptions jsonb)
language plpgsql security definer set search_path = '' as $$
declare
  r public.sales_reminders%rowtype;
  v_ok boolean; v_active boolean; v_push boolean; v_kind text; v_subs jsonb; v_token uuid;
begin
  -- never notify after the follow-up time has passed
  update public.sales_reminders s set status = 'expired', claim_token = null, claimed_until = null, updated_at = now()
   where s.status = 'scheduled' and s.due_at <= now();

  for r in select * from public.sales_reminders s
            where s.status = 'scheduled' and s.remind_at <= now() and (s.claimed_until is null or s.claimed_until < now())
            order by s.remind_at
            limit greatest(1, least(coalesce(p_limit, 50), 200))
            for update skip locked loop
    -- live re-check: follow-up still pending at the same time, lead still open and owned by the same employee
    select (f.status = 'pending' and f.due_at = r.due_at and l.assigned_to is not distinct from r.owner_id and l.status not in ('converted', 'lost')), f.kind
      into v_ok, v_kind
      from public.lead_followups f join public.leads l on l.id = f.lead_id where f.id = r.followup_id;
    if not coalesce(v_ok, false) then
      perform public.refresh_sales_reminder(r.followup_id);   -- out of sync: recompute from the live data, never send stale
      continue;
    end if;
    select coalesce(p.is_active, false) into v_active from public.profiles p where p.id = r.owner_id;
    if not coalesce(v_active, false) then
      update public.sales_reminders set status = 'failed', last_error = 'owner_inactive', claim_token = null, claimed_until = null, updated_at = now() where id = r.id;
      continue;
    end if;
    select coalesce((select st.push_enabled from public.sales_reminder_settings st where st.user_id = r.owner_id), true) into v_push;
    if not v_push then
      update public.sales_reminders set status = 'failed', last_error = 'push_disabled', claim_token = null, claimed_until = null, updated_at = now() where id = r.id;
      continue;
    end if;
    if r.attempts >= 3 then
      update public.sales_reminders set status = 'failed', last_error = coalesce(r.last_error, 'max_attempts'), claim_token = null, claimed_until = null, updated_at = now() where id = r.id;
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth) order by ps.created_at), '[]'::jsonb)
      into v_subs from public.push_subscriptions ps where ps.user_id = r.owner_id and ps.revoked_at is null;
    if jsonb_array_length(v_subs) = 0 then
      update public.sales_reminders set status = 'failed', last_error = 'no_device', claim_token = null, claimed_until = null, updated_at = now() where id = r.id;
      continue;
    end if;
    v_token := gen_random_uuid();
    update public.sales_reminders set claim_token = v_token, claimed_until = now() + interval '2 minutes', attempts = attempts + 1, updated_at = now() where id = r.id;
    reminder_id := r.id; claim_token := v_token; lead_id := r.lead_id; owner_id := r.owner_id; due_at := r.due_at; kind := v_kind; subscriptions := v_subs;
    return next;
  end loop;
end $$;
revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

create or replace function public.confirm_reminder_claim(p_reminder_id uuid, p_claim_token uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select true from public.sales_reminders r
      join public.lead_followups f on f.id = r.followup_id
      join public.leads l on l.id = r.lead_id
      join public.profiles p on p.id = r.owner_id
     where r.id = p_reminder_id and r.claim_token = p_claim_token and r.status = 'scheduled' and r.claimed_until > now()
       and f.status = 'pending' and f.due_at = r.due_at and f.due_at > now()
       and l.assigned_to = r.owner_id and l.status not in ('converted', 'lost') and p.is_active), false);
$$;
revoke all on function public.confirm_reminder_claim(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_reminder_claim(uuid, uuid) to service_role;

create or replace function public.complete_reminder_delivery(
  p_reminder_id uuid, p_claim_token uuid, p_outcome text, p_error text default null,
  p_ok_endpoints text[] default '{}', p_gone_endpoints text[] default '{}')
returns boolean language plpgsql security definer set search_path = '' as $$
declare r public.sales_reminders%rowtype; v_n integer;
begin
  if p_outcome not in ('sent', 'retry', 'failed') then raise exception 'Unknown outcome %', p_outcome using errcode = '22023'; end if;
  select * into r from public.sales_reminders where id = p_reminder_id for update;
  if r.id is null then return false; end if;
  -- device bookkeeping (only that owner's devices)
  update public.push_subscriptions set revoked_at = now(), updated_at = now()
   where user_id = r.owner_id and endpoint = any(coalesce(p_gone_endpoints, '{}')) and revoked_at is null;
  update public.push_subscriptions set last_success_at = now(), failure_count = 0, updated_at = now()
   where user_id = r.owner_id and endpoint = any(coalesce(p_ok_endpoints, '{}'));
  -- a result for a stale claim (rescheduled / cancelled / reassigned / re-claimed meanwhile) changes nothing
  if r.claim_token is distinct from p_claim_token or r.status <> 'scheduled' then return false; end if;
  if p_outcome = 'sent' then
    update public.sales_reminders set status = 'sent', sent_at = now(), last_error = null, claim_token = null, claimed_until = null, updated_at = now() where id = r.id;
  elsif p_outcome = 'failed' or r.attempts >= 3 then
    update public.sales_reminders set status = 'failed', last_error = left(coalesce(p_error, 'failed'), 300), claim_token = null, claimed_until = null, updated_at = now() where id = r.id;
  else
    -- retry with backoff 1, 2, 4 minutes (claimed_until doubles as the "not before" time)
    update public.sales_reminders set last_error = left(coalesce(p_error, 'retry'), 300), claim_token = null,
           claimed_until = now() + make_interval(mins => power(2, greatest(r.attempts - 1, 0))::integer), updated_at = now() where id = r.id;
  end if;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;
revoke all on function public.complete_reminder_delivery(uuid, uuid, text, text, text[], text[]) from public, anon, authenticated;
grant execute on function public.complete_reminder_delivery(uuid, uuid, text, text, text[], text[]) to service_role;

-- cheap "is there work?" probe for the cron job (no data returned)
create or replace function public.reminders_due_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.sales_reminders s
   where s.status = 'scheduled' and s.remind_at <= now() and (s.claimed_until is null or s.claimed_until < now());
$$;
revoke all on function public.reminders_due_count() from public, anon, authenticated;
grant execute on function public.reminders_due_count() to service_role;
