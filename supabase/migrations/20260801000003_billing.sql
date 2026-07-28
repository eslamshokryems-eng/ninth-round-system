-- Phase 1 — subscription plans, subscriptions, payments, coupons.
-- All writes to subscriptions/payments happen via Edge Functions using the
-- service-role key after Stripe webhook verification — see docs/07-security-plan.md §7.2.

create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier subscription_tier not null,
  billing_interval billing_interval not null,
  price_cents int not null,
  stripe_price_id text not null unique,
  features jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  plan_id uuid not null references subscription_plans (id),
  stripe_subscription_id text unique,
  stripe_customer_id text,
  status subscription_status not null default 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

create index idx_subscriptions_profile on subscriptions (profile_id);

-- AI-readiness / audit trail: every status transition is worth having in the
-- domain_events stream (churn-risk signals for AI progress analysis, dunning
-- automation, etc.) — see docs/04-database-schema.md §4.7.
create or replace function trg_subscriptions_emit_event()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) or tg_op = 'INSERT' then
    perform emit_domain_event(
      'subscription.status_changed',
      'subscription',
      new.id,
      new.profile_id,
      jsonb_build_object('status', new.status, 'plan_id', new.plan_id)
    );
  end if;
  return new;
end;
$$;

create trigger trg_subscriptions_domain_event
  after insert or update on subscriptions
  for each row execute function trg_subscriptions_emit_event();

create table payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  subscription_id uuid references subscriptions (id),
  stripe_payment_intent_id text unique,
  amount_cents int not null,
  currency text not null default 'usd',
  status payment_status not null,
  created_at timestamptz not null default now()
);

create index idx_payments_profile on payments (profile_id);

-- Idempotency ledger for the stripe-webhook Edge Function.
create table processed_stripe_events (
  stripe_event_id text primary key,
  processed_at timestamptz not null default now()
);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type coupon_discount_type not null,
  amount int not null,
  max_redemptions int,
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references coupons (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, profile_id)
);

-- ---------------------------------------------------------------------------
-- Reception support: front-desk member lookup without granting reception a
-- broad SELECT on `profiles` (which would expose goal, DOB, referral data,
-- etc. that front-desk staff have no legitimate need for). RLS is row-level,
-- not column-level, so a narrow SECURITY DEFINER function is the correct
-- primitive here — it is also, not incidentally, a plain PostgREST RPC call,
-- so mobile and web hit the same endpoint (API-first, docs/05 §5.1).
-- ---------------------------------------------------------------------------

create or replace function reception_member_lookup(search_term text default null)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  has_active_subscription boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.full_name,
    p.avatar_url,
    exists (
      select 1 from subscriptions s
      where s.profile_id = p.id and s.status = 'active'
    ) as has_active_subscription
  from profiles p
  where auth_role() in ('reception', 'admin', 'super_admin')
    and (search_term is null or p.full_name ilike '%' || search_term || '%')
  order by p.full_name
  limit 25;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table subscription_plans enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table processed_stripe_events enable row level security;
alter table coupons enable row level security;
alter table coupon_redemptions enable row level security;

create policy "anyone reads active plans" on subscription_plans for select using (is_active = true);
create policy "admins manage plans" on subscription_plans for all using (is_admin());

create policy "read own subscription" on subscriptions for select using (profile_id = auth.uid());
create policy "reception reads active subscriptions for check-in" on subscriptions for select
  using (auth_role() = 'reception' and status = 'active');
create policy "admins manage subscriptions" on subscriptions for all using (is_admin());
-- No client insert/update policy: subscriptions are written exclusively by
-- Edge Functions via the service-role key, which bypasses RLS by design.

create policy "read own payments" on payments for select using (profile_id = auth.uid());
create policy "admins manage payments" on payments for all using (is_admin());
-- Refund issuance is an application-layer (Edge Function) concern gated to
-- super_admin specifically — see docs/12-roles-and-permissions.md §12.3;
-- RLS grants admin+super_admin equal row access since the distinction here
-- is an *action* permission, not a *visibility* one.

create policy "admins only: processed_stripe_events" on processed_stripe_events for all using (is_admin());

create policy "anyone reads active coupons by code lookup" on coupons for select using (is_active = true);
create policy "admins manage coupons" on coupons for all using (is_admin());

create policy "read own redemptions" on coupon_redemptions for select using (profile_id = auth.uid());
create policy "admins manage redemptions" on coupon_redemptions for all using (is_admin());
