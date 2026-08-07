-- 9th Round Reception & Membership System — Attendance Check-in.
-- Development order item 6 (see the project roadmap). A member can only be
-- checked in if they currently have an active, unexpired membership — the
-- same rule any real front-desk system enforces (an expired member is
-- turned away, or sent to Reception to renew first, not silently let in).
--
-- check_ins is append-only, like membership_payments: attendance is a
-- permanent record, never edited/deleted after the fact — enforced below
-- by granting insert/select only, never update/delete, in RLS.

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id) on delete cascade,
  branch_id uuid not null references branches (id),
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index idx_check_ins_member on check_ins (member_id);
create index idx_check_ins_branch on check_ins (branch_id);
create index idx_check_ins_checked_in_at on check_ins (checked_in_at);

alter table check_ins enable row level security;

create policy "branch staff read check-ins" on check_ins for select
  using (is_branch_staff(branch_id));
create policy "reception/branch_manager insert check-ins" on check_ins for insert
  with check (is_branch_staff(branch_id) and auth_role() in ('reception', 'branch_manager', 'super_admin'));

-- ---------------------------------------------------------------------------
-- check_in_member() — the "Check In" action's single write. `security
-- invoker`, same rationale as register_membership()/renew_membership(): RLS
-- is enforced exactly as if the client had inserted the row itself.
-- ---------------------------------------------------------------------------

create or replace function check_in_member(p_member_id uuid)
returns table (check_in_id uuid, checked_in_at timestamptz)
language plpgsql
security invoker
as $$
declare
  v_branch_id uuid;
  v_has_active_membership boolean;
  v_check_in_id uuid;
  v_checked_in_at timestamptz;
begin
  select branch_id into v_branch_id from members where id = p_member_id;
  if v_branch_id is null then
    raise exception 'Unknown member: %', p_member_id;
  end if;

  select exists(
    select 1 from memberships
    where member_id = p_member_id and status = 'active' and end_date >= current_date
  ) into v_has_active_membership;

  if not v_has_active_membership then
    -- Prefixed so the calling application can distinguish this from any
    -- other error by message, the same way register_membership()'s unique
    -- constraint violations are distinguished by name (see
    -- SupabaseRegistrationRepository) — Postgres exceptions don't carry a
    -- structured error code of our own choosing, only SQLSTATE.
    raise exception 'NO_ACTIVE_MEMBERSHIP: member % has no active membership', p_member_id;
  end if;

  insert into check_ins (member_id, branch_id, checked_in_by)
  values (p_member_id, v_branch_id, auth.uid())
  returning id, check_ins.checked_in_at into v_check_in_id, v_checked_in_at;

  return query select v_check_in_id, v_checked_in_at;
end;
$$;
