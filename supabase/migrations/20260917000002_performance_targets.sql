-- Sales & Coaching Performance module — a management dashboard reading
-- revenue already attributed via memberships.sold_by (20260917000001) and
-- memberships.coach_id (20260812000002), plus a new performance_targets
-- table for setting/tracking per-employee goals. No new attribution
-- columns, no duplicate coach/sales relationship — this migration only adds
-- what doesn't already exist: targets, and two read-only aggregation
-- functions that do the revenue rollup server-side (Postgres GROUP BY/SUM)
-- rather than in the browser.

-- ---------------------------------------------------------------------------
-- performance_targets — one row per (employee, category, period). Read by
-- branch_manager (own branch) / super_admin (any branch) only, same
-- management-only boundary as Reports/Payroll.
-- ---------------------------------------------------------------------------

create table performance_targets (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id),
  branch_id uuid not null references branches (id),
  -- 'sales': target measured against memberships.sold_by revenue.
  -- 'coach': target measured against memberships.coach_id revenue.
  category text not null check (category in ('sales', 'coach')),
  period_type text not null check (period_type in ('weekly', 'monthly', 'yearly')),
  period_start date not null,
  period_end date not null,
  target_amount numeric(10, 2) not null check (target_amount >= 0),
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_performance_targets_dates check (period_end >= period_start),
  -- Prevents accidentally setting the same employee's target twice for the
  -- same category/period — mirrors uq_memberships_receipt_number's role as
  -- a guard rail, not a business rule invented here.
  unique (staff_id, category, period_type, period_start)
);

create trigger trg_performance_targets_updated_at
  before update on performance_targets
  for each row execute function set_updated_at();

create index idx_performance_targets_staff on performance_targets (staff_id);
create index idx_performance_targets_branch on performance_targets (branch_id);
create index idx_performance_targets_period on performance_targets (period_start, period_end);

-- Reuses the existing generic audit trigger (20260815000001) instead of
-- adding dedicated create/update/delete RPC functions for target CRUD.
create trigger trg_audit_performance_targets_insert
  after insert on performance_targets
  for each row execute function log_table_change('performance_target');

create trigger trg_audit_performance_targets_update
  after update on performance_targets
  for each row execute function log_table_change('performance_target');

create trigger trg_audit_performance_targets_delete
  after delete on performance_targets
  for each row execute function log_table_change('performance_target');

alter table performance_targets enable row level security;

-- Management-only branch scoping: is_branch_staff() also admits
-- reception/coach/sales_employee, which targets must not be visible or
-- editable to. security definer + set search_path = '' for the same
-- recursion-safety reason is_branch_staff() itself needed it
-- (20260914000001) — this function performs the same kind of internal
-- profiles lookup.
create or replace function is_branch_admin(target_branch_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.is_active
        and p.role = 'branch_manager'
    );
$$;

create policy "branch admins read targets" on performance_targets for select
  using (is_branch_admin(branch_id));
create policy "branch admins insert targets" on performance_targets for insert
  with check (is_branch_admin(branch_id));
create policy "branch admins update targets" on performance_targets for update
  using (is_branch_admin(branch_id));
create policy "branch admins delete targets" on performance_targets for delete
  using (is_branch_admin(branch_id));

-- ---------------------------------------------------------------------------
-- get_sales_performance() / get_coach_performance() — server-side revenue
-- rollup per employee for a date range. Both:
--   - filter on membership_payments.payment_date (when the money actually
--     came in — same basis get_revenue_report already uses), so a renewal
--     paid for today counts today, not on the membership's start_date.
--   - first GROUP BY membership_id to collapse a membership's payments into
--     one row before summing, so a membership with more than one payment
--     row is never counted more than once toward price/discount/final_price
--     (only collected_revenue, the SUM of that membership's payments, can
--     legitimately be built from multiple rows).
--   - security invoker (no elevated privilege): a caller only ever sees
--     rows their own RLS already allows on memberships/membership_payments/
--     profiles, so branch isolation is enforced by the same policies as
--     everywhere else, not re-implemented here.
--   - rows with no attribution (sold_by / coach_id is null — historical,
--     pre-feature memberships) are excluded: there is no employee to rank
--     them against, and inventing one would misattribute real revenue.
-- ---------------------------------------------------------------------------

create function get_sales_performance(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_staff_id uuid default null,
  p_program_type program_type default null
)
returns table (
  staff_id uuid,
  staff_name text,
  transaction_count bigint,
  gross_revenue numeric,
  discount_total numeric,
  net_revenue numeric,
  collected_revenue numeric
)
language sql
stable
security invoker
as $$
  with membership_agg as (
    select
      m.id as membership_id,
      m.sold_by,
      m.price,
      m.discount,
      m.final_price,
      sum(mp.amount) as collected_amount
    from membership_payments mp
    join memberships m on m.id = mp.membership_id
    where m.branch_id = p_branch_id
      and m.sold_by is not null
      and mp.payment_date between p_start_date and p_end_date
      and (p_staff_id is null or m.sold_by = p_staff_id)
      and (p_program_type is null or m.program_type = p_program_type)
    group by m.id, m.sold_by, m.price, m.discount, m.final_price
  )
  select
    ma.sold_by as staff_id,
    coalesce(p.full_name, '—') as staff_name,
    count(*) as transaction_count,
    coalesce(sum(ma.price), 0) as gross_revenue,
    coalesce(sum(ma.discount), 0) as discount_total,
    coalesce(sum(ma.final_price), 0) as net_revenue,
    coalesce(sum(ma.collected_amount), 0) as collected_revenue
  from membership_agg ma
  left join profiles p on p.id = ma.sold_by
  group by ma.sold_by, p.full_name
  order by collected_revenue desc;
$$;

create function get_coach_performance(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_staff_id uuid default null,
  p_program_type program_type default null
)
returns table (
  staff_id uuid,
  staff_name text,
  transaction_count bigint,
  gross_revenue numeric,
  discount_total numeric,
  net_revenue numeric,
  collected_revenue numeric
)
language sql
stable
security invoker
as $$
  with membership_agg as (
    select
      m.id as membership_id,
      m.coach_id,
      m.price,
      m.discount,
      m.final_price,
      sum(mp.amount) as collected_amount
    from membership_payments mp
    join memberships m on m.id = mp.membership_id
    where m.branch_id = p_branch_id
      and m.coach_id is not null
      and mp.payment_date between p_start_date and p_end_date
      and (p_staff_id is null or m.coach_id = p_staff_id)
      and (p_program_type is null or m.program_type = p_program_type)
    group by m.id, m.coach_id, m.price, m.discount, m.final_price
  )
  select
    ma.coach_id as staff_id,
    coalesce(p.full_name, '—') as staff_name,
    count(*) as transaction_count,
    coalesce(sum(ma.price), 0) as gross_revenue,
    coalesce(sum(ma.discount), 0) as discount_total,
    coalesce(sum(ma.final_price), 0) as net_revenue,
    coalesce(sum(ma.collected_amount), 0) as collected_revenue
  from membership_agg ma
  left join profiles p on p.id = ma.coach_id
  group by ma.coach_id, p.full_name
  order by collected_revenue desc;
$$;

grant execute on function get_sales_performance(uuid, date, date, uuid, program_type) to authenticated;
grant execute on function get_coach_performance(uuid, date, date, uuid, program_type) to authenticated;
