-- Sales Performance dashboard redesign — three new READ-ONLY aggregation
-- functions backing the daily trend chart, the by-program breakdown/donut,
-- and the per-employee transaction drill-down. No schema change: no new
-- column, no new table, no new enum value. All three reuse
-- memberships.sold_by/program_type exactly as get_sales_performance()
-- (20260918000001) already does, with the identical security posture
-- (security invoker — no elevated privilege; branch isolation and role
-- gating come from the same RLS already in force on memberships/
-- membership_payments, nothing new is granted here).

-- ---------------------------------------------------------------------------
-- get_sales_daily_trend() — one row per day with payments in range, for the
-- "Sales Revenue Trend" chart. Sums membership_payments.amount directly
-- (not the two-level CTE the other functions use) because collected
-- revenue is legitimately additive across every payment row on a given
-- day — there is nothing here to double-count (price/discount/final_price
-- aren't part of this function's output at all).
-- ---------------------------------------------------------------------------

create function get_sales_daily_trend(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_staff_id uuid default null,
  p_program_type program_type default null
)
returns table (
  day date,
  collected_revenue numeric
)
language sql
stable
security invoker
as $$
  select
    mp.payment_date as day,
    coalesce(sum(mp.amount), 0) as collected_revenue
  from membership_payments mp
  join memberships m on m.id = mp.membership_id
  where m.branch_id = p_branch_id
    and m.sold_by is not null
    and mp.payment_date between p_start_date and p_end_date
    and (p_staff_id is null or m.sold_by = p_staff_id)
    and (p_program_type is null or m.program_type = p_program_type)
  group by mp.payment_date
  order by mp.payment_date;
$$;

-- ---------------------------------------------------------------------------
-- get_sales_by_program() — one row per program_type, for the donut chart,
-- the Membership Type Breakdown table, and Top Performing Programs (same
-- underlying grouping, three different presentations — one function, not
-- three). Same two-level CTE (group by membership_id first) get_sales_
-- performance() already uses, so a membership with more than one payment
-- is never double-counted. A null program_type (never backfilled on
-- historical rows — see 20260916000001) comes back as its own row with
-- program_type = null; the UI maps that to "Other" using real data,
-- rather than inventing a category the schema doesn't have.
-- ---------------------------------------------------------------------------

create function get_sales_by_program(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_staff_id uuid default null
)
returns table (
  program_type program_type,
  membership_count bigint,
  collected_revenue numeric
)
language sql
stable
security invoker
as $$
  with membership_agg as (
    select
      m.id as membership_id,
      m.program_type,
      sum(mp.amount) as collected_amount
    from membership_payments mp
    join memberships m on m.id = mp.membership_id
    where m.branch_id = p_branch_id
      and m.sold_by is not null
      and mp.payment_date between p_start_date and p_end_date
      and (p_staff_id is null or m.sold_by = p_staff_id)
    group by m.id, m.program_type
  )
  select
    ma.program_type,
    count(*) as membership_count,
    coalesce(sum(ma.collected_amount), 0) as collected_revenue
  from membership_agg ma
  group by ma.program_type
  order by collected_revenue desc;
$$;

-- ---------------------------------------------------------------------------
-- get_sales_transactions() — the Employee Detail drill-down's transaction
-- table: one row per payment (not deduped/aggregated — this is meant to be
-- a literal list, same grain the Receipts page already shows). p_staff_id
-- is required (no default): this function only makes sense scoped to one
-- employee, unlike the other two which report across everyone.
-- ---------------------------------------------------------------------------

create function get_sales_transactions(
  p_branch_id uuid,
  p_start_date date,
  p_end_date date,
  p_staff_id uuid,
  p_program_type program_type default null
)
returns table (
  payment_id uuid,
  payment_date date,
  member_full_name text,
  membership_number text,
  program_type program_type,
  price numeric,
  discount numeric,
  final_price numeric,
  collected_amount numeric,
  receipt_number text
)
language sql
stable
security invoker
as $$
  select
    mp.id as payment_id,
    mp.payment_date,
    mem.full_name as member_full_name,
    m.membership_number,
    m.program_type,
    m.price,
    m.discount,
    m.final_price,
    mp.amount as collected_amount,
    m.receipt_number
  from membership_payments mp
  join memberships m on m.id = mp.membership_id
  join members mem on mem.id = m.member_id
  where m.branch_id = p_branch_id
    and m.sold_by = p_staff_id
    and mp.payment_date between p_start_date and p_end_date
    and (p_program_type is null or m.program_type = p_program_type)
  order by mp.payment_date desc;
$$;

grant execute on function get_sales_daily_trend(uuid, date, date, uuid, program_type) to authenticated;
grant execute on function get_sales_by_program(uuid, date, date, uuid) to authenticated;
grant execute on function get_sales_transactions(uuid, date, date, uuid, program_type) to authenticated;
