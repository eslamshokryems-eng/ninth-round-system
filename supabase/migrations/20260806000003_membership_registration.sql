-- 9th Round Reception & Membership System — Membership Registration refinements.
-- See docs/phase-1/14-reception-membership.md §14.5 for the design notes.
--
-- Evolves the schema landed in 20260806000002 based on the real reception
-- desk workflow: a formatted sequential membership number, a required
-- unique receipt number, a configurable membership-type catalog instead of
-- a fixed enum (so pricing/duration can change without a migration), a
-- national ID field, and phone-number uniqueness. Applied as an ALTER, not
-- a fresh table, since no real membership data exists yet to migrate.

-- ---------------------------------------------------------------------------
-- Membership types — a real table, not an enum, so a branch_manager can
-- add/reprice types (e.g. a seasonal promo) without a code deploy. Seeded
-- with the 6 named types and their durations; price is intentionally left
-- at 0 rather than a fabricated number — Reception always confirms/enters
-- the real price on each registration (the type's price is only a
-- pre-fill convenience), so seeding a fake price here would be exactly the
-- "mock data" the product explicitly rules out.
-- ---------------------------------------------------------------------------

create table membership_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  duration_days int not null check (duration_days > 0),
  price numeric(10, 2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_membership_types_updated_at
  before update on membership_types
  for each row execute function set_updated_at();

insert into membership_types (name, duration_days) values
  ('One Month', 30),
  ('Three Months', 90),
  ('Six Months', 180),
  ('Annual', 365),
  ('Personal Training', 30),
  ('VIP', 30);

-- ---------------------------------------------------------------------------
-- Members — add National ID; enforce the "phone cannot be duplicated"
-- business rule at the database level, not just in application code.
-- ---------------------------------------------------------------------------

alter table members add column national_id text;
alter table members add constraint uq_members_phone unique (phone);

-- ---------------------------------------------------------------------------
-- Memberships — sequential membership number, required unique receipt
-- number, membership_type_id replacing the fixed enum, and payment_method
-- captured directly on the row (the common case: one payment at
-- registration). membership_payments — added in 20260806000002 — remains
-- the permanent, append-only transaction ledger; this column is a
-- convenience denormalization for "how was this paid" at a glance, not a
-- replacement for it. The application layer writes both rows together.
-- ---------------------------------------------------------------------------

create sequence membership_number_seq start 1;
-- Sequences aren't covered by table-level grants — without this, inserting
-- a membership (which hits the sequence via the column default below)
-- fails with "permission denied for sequence" for any non-owner role,
-- i.e. every real request Supabase ever makes.
grant usage on sequence membership_number_seq to authenticated;

alter table memberships
  add column membership_number text not null
    default ('9R-' || lpad(nextval('membership_number_seq')::text, 6, '0')),
  add column receipt_number text,
  add column payment_method membership_payment_method,
  add column membership_type_id uuid references membership_types (id);

-- Backfill membership_type_id is unnecessary — no real rows exist yet
-- (verified via the Reception Dashboard before this migration was written).
-- Drop the now-superseded enum column and its type.
alter table memberships drop column membership_type;
drop type membership_type;

alter table memberships alter column membership_type_id set not null;
alter table memberships alter column receipt_number set not null;
alter table memberships alter column payment_method set not null;

alter table memberships add constraint uq_memberships_receipt_number unique (receipt_number);
alter table memberships add constraint uq_memberships_number unique (membership_number);

create index idx_memberships_type on memberships (membership_type_id);

-- ---------------------------------------------------------------------------
-- register_membership() — the "+ New Membership" form's single write. Runs
-- member + membership + payment inserts inside one function body (so a
-- mid-way failure can't leave a member with no membership, or a membership
-- with no payment record) as `security invoker`, meaning it runs with the
-- *calling* user's privileges — every RLS insert policy on members/
-- memberships/membership_payments still applies exactly as if the client
-- had inserted each row directly. This is atomicity, not a privilege
-- escalation.
-- ---------------------------------------------------------------------------

create or replace function register_membership(
  p_branch_id uuid,
  p_full_name text,
  p_phone text,
  p_gender gender,
  p_date_of_birth date,
  p_national_id text,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_start_date date,
  p_payment_method membership_payment_method,
  p_notes text
)
returns table (member_id uuid, membership_id uuid, membership_number text)
language plpgsql
security invoker
as $$
declare
  v_member_id uuid;
  v_membership_id uuid;
  v_membership_number text;
  v_duration_days int;
  v_end_date date;
begin
  select duration_days into v_duration_days
  from membership_types where id = p_membership_type_id and is_active;

  if v_duration_days is null then
    raise exception 'Unknown or inactive membership type: %', p_membership_type_id;
  end if;

  v_end_date := p_start_date + v_duration_days;

  insert into members (branch_id, full_name, phone, gender, date_of_birth, national_id, created_by)
  values (p_branch_id, p_full_name, p_phone, p_gender, p_date_of_birth, p_national_id, auth.uid())
  returning id into v_member_id;

  insert into memberships (
    member_id, branch_id, membership_type_id, receipt_number, price, discount,
    start_date, end_date, payment_method, notes, created_by
  )
  values (
    v_member_id, p_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    p_start_date, v_end_date, p_payment_method, p_notes, auth.uid()
  )
  returning id, memberships.membership_number into v_membership_id, v_membership_number;

  insert into membership_payments (membership_id, amount, payment_method, received_by)
  values (v_membership_id, greatest(p_price - p_discount, 0), p_payment_method, auth.uid());

  return query select v_member_id, v_membership_id, v_membership_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — membership_types is reference data every branch reads; only
-- super_admin manages the catalog (adding a type / repricing is a
-- business decision, not a day-to-day reception action).
-- ---------------------------------------------------------------------------

alter table membership_types enable row level security;

create policy "staff read membership types" on membership_types for select
  using (auth_role() is not null);
create policy "super_admin manages membership types" on membership_types for all
  using (is_super_admin());
