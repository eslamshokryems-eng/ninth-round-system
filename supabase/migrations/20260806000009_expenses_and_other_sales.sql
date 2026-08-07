-- Reception side-menu additions: Expenses (المصروفات) and Other Sales /
-- sports equipment (مبيعات أخرى - أدوات رياضية), plus a non-consuming
-- "next membership number" preview for the New Membership form.
--
-- Both new tables follow the same branch-scoped RLS shape already
-- established for members/memberships (is_branch_staff() + role check on
-- write). Unlike membership_payments (a legally-significant, append-only
-- transaction record), both allow correcting a mis-entered row via
-- UPDATE — these are day-to-day operational entries a receptionist can
-- reasonably need to fix minutes after typing them — but never DELETE,
-- so a financial record is never silently erased; a wrong entry is
-- corrected in place (visible via updated_at), not removed.

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------

create type expense_category as enum (
  'rent', 'utilities', 'salaries', 'maintenance', 'supplies', 'marketing', 'other'
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches (id),
  category expense_category not null,
  description text,
  amount numeric(10, 2) not null check (amount > 0),
  expense_date date not null default current_date,
  payment_method membership_payment_method not null,
  receipt_reference text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_expenses_updated_at
  before update on expenses
  for each row execute function set_updated_at();

create index idx_expenses_branch on expenses (branch_id);
create index idx_expenses_date on expenses (expense_date);

alter table expenses enable row level security;

create policy "branch staff read expenses" on expenses for select
  using (is_branch_staff(branch_id));
create policy "reception/branch_manager insert expenses" on expenses for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));
create policy "reception/branch_manager update expenses" on expenses for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));

-- ---------------------------------------------------------------------------
-- Other Sales — walk-in sales of sports equipment/gear. `item_name` is
-- free text, not a managed product/inventory catalog with stock levels:
-- building real inventory management (SKUs, stock counts, suppliers) is a
-- meaningfully larger feature than "record what was sold today," and
-- nothing in this table pretends otherwise — a deliberate, documented v1
-- scope, not a shortcut standing in for something it claims to be.
-- ---------------------------------------------------------------------------

create table other_sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches (id),
  item_name text not null,
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  total_price numeric(10, 2) generated always as (quantity * unit_price) stored,
  payment_method membership_payment_method not null,
  buyer_name text,
  buyer_phone text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_other_sales_updated_at
  before update on other_sales
  for each row execute function set_updated_at();

create index idx_other_sales_branch on other_sales (branch_id);
create index idx_other_sales_created_at on other_sales (created_at);

alter table other_sales enable row level security;

create policy "branch staff read other sales" on other_sales for select
  using (is_branch_staff(branch_id));
create policy "reception/branch_manager insert other sales" on other_sales for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));
create policy "reception/branch_manager update other sales" on other_sales for update
  using (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));

-- ---------------------------------------------------------------------------
-- next_membership_number() — a read-only preview for the New Membership
-- form ("we didn't see the ID automatically"). Reads the sequence's
-- current position without advancing it (unlike nextval(), which would
-- burn a real number — and leave a permanent gap in membership_number —
-- just from opening the form without saving). The number shown is
-- therefore an estimate, not a reservation: if two receptionists open the
-- form at the same time, both preview the same next number, but only
-- whoever saves first actually gets it — the second save still gets the
-- correct next number from register_membership()'s own nextval() call,
-- it just won't match what was previewed. Acceptable for a preview label,
-- not acceptable for the real assignment, which is why register_membership()
-- was never changed to use this.
-- ---------------------------------------------------------------------------

create or replace function next_membership_number()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '9R-' || lpad(
    (case when is_called then last_value + 1 else last_value end)::text, 6, '0'
  )
  from public.membership_number_seq;
$$;

grant execute on function next_membership_number() to authenticated;
