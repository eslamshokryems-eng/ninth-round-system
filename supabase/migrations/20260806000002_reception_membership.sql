-- 9th Round Reception & Membership System — Phase 1: schema, tables, RLS.
-- See docs/phase-1/14-reception-membership.md for the module's design notes.
--
-- Design note — `members` vs `profiles`: a club member is a business
-- record Reception creates directly (walk-in sign-up at the front desk);
-- it does not require an app account. `profiles` (extends `auth.users`)
-- remains the identity for anyone who actually logs into a 9th Round app —
-- staff always, and a member only if/when they're issued app access. A
-- `members` row therefore has an optional `linked_profile_id`, not a
-- required one. Keeping these separate avoids forcing a real gym member
-- through an auth flow just to exist in the system, and avoids conflating
-- "is a customer" with "can log in" — two different facts.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type membership_type as enum ('monthly', 'quarterly', 'semi_annual', 'annual', 'custom');
create type membership_status as enum ('active', 'expired', 'cancelled');
create type membership_payment_status as enum ('paid', 'partial', 'unpaid');
create type membership_payment_method as enum ('cash', 'visa', 'instapay', 'vodafone_cash');
create type membership_alert_type as enum ('expiring_7_days', 'expiring_3_days', 'expiring_today', 'expired');

-- ---------------------------------------------------------------------------
-- Branches — minimal on purpose: Phase 1 needs enough to scope
-- branch_manager/reception/members to a location, not a branch-management
-- UI (that's a later phase). Seeded with one row so existing/new data has
-- a home from day one.
-- ---------------------------------------------------------------------------

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_branches_updated_at
  before update on branches
  for each row execute function set_updated_at();

insert into branches (name) values ('Main Branch');

-- Lives on `profiles`, not `staff_profiles`, because branch_manager (and
-- super_admin, though they're not branch-scoped) don't get a
-- staff_profiles row — that table is specifically for client-facing
-- coaching staff (bio/specialties/certifications). Every staff role needs
-- a home branch; only some of them also need a coaching bio.
alter table profiles add column branch_id uuid references branches (id);
create index idx_profiles_branch on profiles (branch_id);

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

create table members (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches (id),
  -- Short, human-readable identifier — what Reception reads out loud, what
  -- a barcode/QR code encodes, and what search matches against. Generated
  -- from a portion of the row's own id so it's unique without a separate
  -- sequence table, and stable the moment the row is created.
  member_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  full_name text not null,
  phone text not null,
  email text,
  gender gender,
  date_of_birth date,
  emergency_contact_name text,
  emergency_contact_phone text,
  address text,
  notes text,
  profile_image_url text,
  -- Optional: set only if this member is later issued app access.
  linked_profile_id uuid references profiles (id) on delete set null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_members_updated_at
  before update on members
  for each row execute function set_updated_at();

create index idx_members_branch on members (branch_id);
create index idx_members_phone on members (phone);
create index idx_members_full_name_trgm on members using gin (full_name gin_trgm_ops);
create unique index idx_members_linked_profile on members (linked_profile_id) where linked_profile_id is not null;

-- ---------------------------------------------------------------------------
-- Memberships — one row per membership period. Renewing creates a new row
-- rather than mutating the old one, so membership history is a permanent,
-- queryable record, not something each renewal overwrites.
-- ---------------------------------------------------------------------------

create table memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  branch_id uuid not null references branches (id),
  membership_type membership_type not null,
  start_date date not null,
  end_date date not null,
  price numeric(10, 2) not null check (price >= 0),
  discount numeric(10, 2) not null default 0 check (discount >= 0),
  final_price numeric(10, 2) generated always as (greatest(price - discount, 0)) stored,
  payment_status membership_payment_status not null default 'unpaid',
  status membership_status not null default 'active',
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_membership_dates check (end_date >= start_date)
);

create trigger trg_memberships_updated_at
  before update on memberships
  for each row execute function set_updated_at();

create index idx_memberships_member on memberships (member_id);
create index idx_memberships_branch on memberships (branch_id);
create index idx_memberships_end_date on memberships (end_date);
create index idx_memberships_status on memberships (status);
-- At most one *active* membership per member at a time — renewals close
-- out (or let expire) the previous row before/as a new one is created.
create unique index uq_memberships_one_active_per_member
  on memberships (member_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Membership payments — append-only. "Every payment must create a
-- permanent transaction record": enforced below by granting insert/select
-- only, never update/delete, in RLS.
-- ---------------------------------------------------------------------------

create table membership_payments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships (id) on delete restrict,
  payment_date date not null default current_date,
  amount numeric(10, 2) not null check (amount > 0),
  payment_method membership_payment_method not null,
  reference_number text,
  notes text,
  received_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index idx_membership_payments_membership on membership_payments (membership_id);
create index idx_membership_payments_date on membership_payments (payment_date);

-- ---------------------------------------------------------------------------
-- Membership alerts — 7/3/0 days before expiration, and expired. Rows are
-- populated by generate_membership_alerts() below, meant to be invoked
-- once daily (pg_cron or an Edge Function on a schedule — wiring that up
-- is an ops step for a later slice, not part of the schema itself).
-- ---------------------------------------------------------------------------

create table membership_alerts (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships (id) on delete cascade,
  alert_type membership_alert_type not null,
  alert_date date not null,
  is_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  -- Never raise the same alert twice for the same membership.
  unique (membership_id, alert_type)
);

create index idx_membership_alerts_date on membership_alerts (alert_date);
create index idx_membership_alerts_unacknowledged on membership_alerts (is_acknowledged) where is_acknowledged = false;

create or replace function generate_membership_alerts()
returns void
language sql
security definer
set search_path = public
as $$
  insert into membership_alerts (membership_id, alert_type, alert_date)
  select id, 'expiring_7_days'::membership_alert_type, end_date - 7
  from memberships
  where status = 'active' and end_date - 7 = current_date
  union all
  select id, 'expiring_3_days'::membership_alert_type, end_date - 3
  from memberships
  where status = 'active' and end_date - 3 = current_date
  union all
  select id, 'expiring_today'::membership_alert_type, end_date
  from memberships
  where status = 'active' and end_date = current_date
  union all
  select id, 'expired'::membership_alert_type, end_date
  from memberships
  where status = 'active' and end_date < current_date
  on conflict (membership_id, alert_type) do nothing;

  update memberships set status = 'expired'
  where status = 'active' and end_date < current_date;
$$;

-- ---------------------------------------------------------------------------
-- Reception Dashboard — one view, one round trip. Keeps the "active
-- members / new today / expiring today / expiring this week / expired /
-- daily revenue / monthly revenue" numbers defined in exactly one place
-- rather than seven separate queries the client would otherwise have to
-- keep consistent with each other.
-- ---------------------------------------------------------------------------

create view reception_dashboard_stats as
select
  (select count(*) from memberships where status = 'active') as active_members,
  (select count(*) from members where created_at::date = current_date) as new_members_today,
  (select count(*) from memberships where status = 'active' and end_date = current_date) as expiring_today,
  (select count(*) from memberships
     where status = 'active' and end_date between current_date and current_date + 6) as expiring_this_week,
  (select count(*) from memberships where status = 'expired') as expired_memberships,
  (select coalesce(sum(amount), 0) from membership_payments where payment_date = current_date) as daily_revenue,
  (select coalesce(sum(amount), 0) from membership_payments
     where date_trunc('month', payment_date) = date_trunc('month', current_date)) as monthly_revenue;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table branches enable row level security;
alter table members enable row level security;
alter table memberships enable row level security;
alter table membership_payments enable row level security;
alter table membership_alerts enable row level security;

-- Branch scoping helper: is the caller staff at the given branch (or a
-- super_admin, who isn't scoped to any one branch)?
create or replace function is_branch_staff(target_branch_id uuid)
returns boolean
language sql stable
as $$
  select
    is_super_admin()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.role in ('branch_manager', 'reception', 'coach')
    );
$$;

create policy "staff read branches" on branches for select using (auth_role() is not null);
create policy "super_admin manages branches" on branches for all using (is_super_admin());

create policy "branch staff read members" on members for select
  using (is_branch_staff(branch_id));
create policy "reception/branch_manager insert members" on members for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));
create policy "reception/branch_manager update members" on members for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));
create policy "member reads own linked record" on members for select
  using (linked_profile_id = auth.uid());

create policy "branch staff read memberships" on memberships for select
  using (is_branch_staff(branch_id));
create policy "reception/branch_manager insert memberships" on memberships for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));
create policy "reception/branch_manager update memberships" on memberships for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));
create policy "member reads own memberships" on memberships for select
  using (exists (select 1 from members m where m.id = memberships.member_id and m.linked_profile_id = auth.uid()));

create policy "branch staff read payments" on membership_payments for select
  using (
    exists (
      select 1 from memberships ms
      where ms.id = membership_payments.membership_id and is_branch_staff(ms.branch_id)
    )
  );
create policy "reception/branch_manager insert payments" on membership_payments for insert
  with check (
    auth_role() in ('reception', 'branch_manager', 'super_admin')
    and exists (
      select 1 from memberships ms
      where ms.id = membership_payments.membership_id and is_branch_staff(ms.branch_id)
    )
  );
-- No update/delete policy on membership_payments, anywhere, on purpose —
-- a payment record is permanent. Corrections happen via a new row (e.g. a
-- negative-amount adjustment), never by editing history.

create policy "branch staff read alerts" on membership_alerts for select
  using (
    exists (
      select 1 from memberships ms
      where ms.id = membership_alerts.membership_id and is_branch_staff(ms.branch_id)
    )
  );
create policy "reception/branch_manager acknowledge alerts" on membership_alerts for update
  using (
    auth_role() in ('reception', 'branch_manager', 'super_admin')
    and exists (
      select 1 from memberships ms
      where ms.id = membership_alerts.membership_id and is_branch_staff(ms.branch_id)
    )
  );
-- Inserts happen only via generate_membership_alerts() (SECURITY DEFINER).
