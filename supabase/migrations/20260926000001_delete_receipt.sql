-- Super Admin — Delete a Single Receipt.
--
-- membership_payments already has a DELETE RLS policy (from
-- 20260820000003_delete_member.sql) covering branch_manager AND
-- super_admin — but that policy exists specifically so Delete Member's
-- cascade (a branch_manager-usable feature) keeps working. This feature
-- needs strictly super_admin-only enforcement without touching that
-- existing policy, so the stricter check lives inside this new function
-- instead (the same layering pattern already used elsewhere in this app,
-- e.g. /api/staff/delete-account/route.ts adding its own isSuperAdmin()
-- check on top of a broader admin check).
--
-- A dedicated function (rather than a plain client-side `.delete()`, the
-- pattern update_receipt_date's Edit Date feature uses) is required here
-- specifically because a deletion *reason* typed by the admin has no way
-- to reach the existing generic log_table_change() trigger — a trigger
-- fired by a raw DELETE statement has no channel to receive free text
-- from the UI. This function captures the full row plus the reason,
-- member, receipt number, and branch into one explicit audit entry via
-- the existing log_audit_event() — no second audit system.
--
-- Deletes exactly one membership_payments row. No cascade: nothing
-- references a payment row as a foreign key, so members, memberships,
-- check-ins, and every other table are untouched.

create or replace function delete_receipt(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_payment membership_payments%rowtype;
  v_member_id uuid;
  v_member_full_name text;
  v_receipt_number text;
  v_branch_id uuid;
begin
  if not is_super_admin() then
    raise exception 'Only Super Admin can delete a receipt.';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to delete a receipt.';
  end if;

  select * into v_payment from membership_payments where id = p_payment_id;
  if v_payment.id is null then
    raise exception 'Receipt not found.';
  end if;

  select ms.member_id, ms.receipt_number, ms.branch_id, m.full_name
  into v_member_id, v_receipt_number, v_branch_id, v_member_full_name
  from memberships ms
  join members m on m.id = ms.member_id
  where ms.id = v_payment.membership_id;

  perform log_audit_event(
    'delete_receipt',
    'payment',
    p_payment_id,
    to_jsonb(v_payment),
    null,
    jsonb_build_object(
      'reason', p_reason,
      'member_id', v_member_id,
      'member_full_name', v_member_full_name,
      'receipt_number', v_receipt_number,
      'branch_id', v_branch_id,
      'amount', v_payment.amount,
      'payment_date', v_payment.payment_date
    )
  );

  delete from membership_payments where id = p_payment_id;
end;
$$;

grant execute on function delete_receipt(uuid, text) to authenticated;
