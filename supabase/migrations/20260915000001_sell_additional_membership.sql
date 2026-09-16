-- Sell an additional, concurrent membership to an existing member (e.g. a
-- Personal Training package sold alongside their regular gym membership),
-- without expiring or otherwise touching their existing active
-- membership(s) — unlike renew_membership(), which replaces the current
-- one.
--
-- The previous "at most one active membership per member" invariant was
-- too strict for this: it assumed a member only ever holds one kind of
-- membership at a time. Loosened to "at most one active membership per
-- member PER TYPE" — a member can now hold one active regular membership
-- and one active Personal Training membership simultaneously, but still
-- never two active memberships of the *same* type at once (renewal
-- behavior for a given type is unchanged).
drop index uq_memberships_one_active_per_member;
create unique index uq_memberships_one_active_per_member_type
  on memberships (member_id, membership_type_id) where status = 'active';

-- Same atomic membership+payment insert pattern, and same `security
-- invoker` posture, as register_membership()/renew_membership() — RLS on
-- memberships/membership_payments (already covers reception, branch_manager,
-- sales_employee, super_admin) remains the real gate, unchanged.
create function sell_additional_membership(
  p_member_id uuid,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_start_date date,
  p_payment_method membership_payment_method,
  p_notes text,
  p_coach_id uuid default null,
  p_session_count integer default null
)
returns table (membership_id uuid, membership_number text, start_date date, end_date date)
language plpgsql
security invoker
as $$
declare
  v_branch_id uuid;
  v_duration_days int;
  v_end_date date;
  v_membership_id uuid;
  v_membership_number text;
begin
  select branch_id into v_branch_id from members where id = p_member_id;
  if v_branch_id is null then
    raise exception 'Unknown member: %', p_member_id;
  end if;

  select duration_days into v_duration_days
  from membership_types where id = p_membership_type_id and is_active;

  if v_duration_days is null then
    raise exception 'Unknown or inactive membership type: %', p_membership_type_id;
  end if;

  v_end_date := p_start_date + v_duration_days;

  insert into memberships (
    member_id, branch_id, membership_type_id, receipt_number, price, discount,
    start_date, end_date, payment_method, notes, coach_id, session_count, created_by
  )
  values (
    p_member_id, v_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    p_start_date, v_end_date, p_payment_method, p_notes, p_coach_id, p_session_count, auth.uid()
  )
  returning id, memberships.membership_number into v_membership_id, v_membership_number;

  insert into membership_payments (membership_id, amount, payment_method, received_by)
  values (v_membership_id, greatest(p_price - p_discount, 0), p_payment_method, auth.uid());

  return query select v_membership_id, v_membership_number, p_start_date, v_end_date;
end;
$$;
