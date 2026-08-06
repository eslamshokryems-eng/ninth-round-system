-- 9th Round Reception & Membership System — one-click Membership Renewal.
-- See docs/phase-1/14-reception-membership.md and
-- packages/reception/README.md ("What's planned next") for the design note
-- this fulfils.
--
-- renew_membership() — mirrors register_membership()'s shape (single
-- `security invoker` transaction, RLS enforced exactly as if the client
-- had issued each statement itself) but for an existing member: closes
-- out their current `active` membership row (required by
-- uq_memberships_one_active_per_member, and because renewing must never
-- overwrite history — memberships is an append-only period log per
-- 20260806000002's design note), inserts the new period, and records its
-- payment atomically.
--
-- The new period's start date extends from the current membership's
-- end_date when it hasn't lapsed yet (renewing early doesn't forfeit the
-- remaining paid days), or from today when it has already lapsed (or
-- there was no prior membership at all, e.g. a lapsed member Reception is
-- re-signing up) — `greatest(coalesce(current_end_date, today), today)`
-- covers both without depending on generate_membership_alerts() having
-- already flipped the row to 'expired'.

create or replace function renew_membership(
  p_member_id uuid,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_payment_method membership_payment_method,
  p_notes text
)
returns table (membership_id uuid, membership_number text, start_date date, end_date date)
language plpgsql
security invoker
as $$
declare
  v_branch_id uuid;
  v_duration_days int;
  v_current_end_date date;
  v_start_date date;
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

  -- Qualified: `returns table (..., end_date date)` puts an `end_date`
  -- OUT-parameter variable in scope alongside the table column of the same
  -- name, which plpgsql rejects as ambiguous otherwise.
  select memberships.end_date into v_current_end_date
  from memberships where member_id = p_member_id and status = 'active';

  v_start_date := greatest(coalesce(v_current_end_date, current_date), current_date);
  v_end_date := v_start_date + v_duration_days;

  update memberships set status = 'expired'
  where member_id = p_member_id and status = 'active';

  insert into memberships (
    member_id, branch_id, membership_type_id, receipt_number, price, discount,
    start_date, end_date, payment_method, notes, created_by
  )
  values (
    p_member_id, v_branch_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    v_start_date, v_end_date, p_payment_method, p_notes, auth.uid()
  )
  returning id, memberships.membership_number into v_membership_id, v_membership_number;

  insert into membership_payments (membership_id, amount, payment_method, received_by)
  values (v_membership_id, greatest(p_price - p_discount, 0), p_payment_method, auth.uid());

  return query select v_membership_id, v_membership_number, v_start_date, v_end_date;
end;
$$;
