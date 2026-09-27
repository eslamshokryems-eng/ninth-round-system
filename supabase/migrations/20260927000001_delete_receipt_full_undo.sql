-- Super Admin — Delete a Single Receipt: full undo for a just-made mistake.
--
-- Extends delete_receipt() (20260926000001). Reception's actual complaint:
-- deleting a receipt left the membership period it paid for still sitting
-- in Membership History, looking exactly like a real, paid membership —
-- because until now delete_receipt() only ever touched
-- membership_payments, by design ("No cascade: nothing references a
-- payment row as a foreign key" — see that migration's own comment).
--
-- This still holds as the *general* rule — membership history stays
-- append-only. But when the receipt being deleted was the ONLY payment on
-- the member's MOST RECENT membership row, deleting it really does mean
-- "undo that registration/renewal", not "correct a historical ledger
-- entry": the membership row is deleted too, and if that membership had
-- superseded an earlier one (renew_membership flips the prior `active`
-- row to `expired` at the moment of renewal), that earlier row is put
-- back to `active` — restoring exactly the state before this receipt was
-- entered. Deliberately scoped narrower than "any membership": undoing a
-- historical (non-latest) row would rewrite a timeline other renewals/
-- upgrades have already built on top of, so that case still falls back to
-- the original payment-only deletion.
--
-- No RLS changes: "branch_manager/super_admin delete memberships" (from
-- 20260820000003_delete_member.sql, added for delete_member()'s cascade)
-- and the existing branch-staff update policy already permit this
-- function's invoker (checked as super_admin above) to delete/update
-- membership rows — same reuse-broader-grant-plus-inner-check pattern as
-- this function's own super_admin gate.

create or replace function delete_receipt(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security invoker
as $$
declare
  v_payment membership_payments%rowtype;
  v_membership_id uuid;
  v_member_id uuid;
  v_member_full_name text;
  v_receipt_number text;
  v_branch_id uuid;
  v_latest_membership_id uuid;
  v_remaining_payments int;
  v_previous_membership_id uuid;
  v_previous_status membership_status;
  v_membership_undone boolean := false;
  v_reactivated_membership_id uuid;
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

  v_membership_id := v_payment.membership_id;

  select ms.member_id, ms.receipt_number, ms.branch_id, m.full_name
  into v_member_id, v_receipt_number, v_branch_id, v_member_full_name
  from memberships ms
  join members m on m.id = ms.member_id
  where ms.id = v_membership_id;

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

  -- Is the membership this receipt paid for the member's most recent one?
  select id into v_latest_membership_id
  from memberships
  where member_id = v_member_id
  order by start_date desc, created_at desc
  limit 1;

  select count(*) into v_remaining_payments
  from membership_payments where membership_id = v_membership_id;

  if v_latest_membership_id = v_membership_id and v_remaining_payments = 0 then
    -- The membership row this receipt belonged to had no other payments
    -- and nothing newer has been created since — safe to undo in full.
    select id, status into v_previous_membership_id, v_previous_status
    from memberships
    where member_id = v_member_id and id <> v_membership_id
    order by start_date desc, created_at desc
    limit 1;

    delete from memberships where id = v_membership_id;
    v_membership_undone := true;

    if v_previous_membership_id is not null and v_previous_status = 'expired' then
      update memberships set status = 'active' where id = v_previous_membership_id;
      v_reactivated_membership_id := v_previous_membership_id;
    end if;

    perform log_audit_event(
      'delete_receipt_undo_membership',
      'membership',
      v_membership_id,
      null,
      null,
      jsonb_build_object(
        'reason', p_reason,
        'member_id', v_member_id,
        'member_full_name', v_member_full_name,
        'triggering_payment_id', p_payment_id,
        'reactivated_membership_id', v_reactivated_membership_id
      )
    );
  end if;
end;
$$;
