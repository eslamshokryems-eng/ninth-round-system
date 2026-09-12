-- Update Receipt Date — Super Admin only, with an audit trail.
--
-- membership_payments was deliberately append-only until now (see
-- 20260806000002's "no update/delete policy... a payment record is
-- permanent" and 20260815000001's explicit "Update Payment... out of
-- scope" note). Both migrations already anticipated this exact feature
-- and left the audit-log plumbing ready for it ("would just need a
-- trigger attached and... an RLS policy to allow it"). Revisited now per
-- explicit product decision: staff sometimes record a payment on the
-- wrong calendar day near a month boundary (see the payment_date default
-- fix below for the root cause), and Super Admin needs a way to correct
-- that after the fact. Scoped as narrowly as the request itself — super_admin
-- only, not branch_manager — and the application layer only ever writes
-- payment_date through this policy; every other column on
-- membership_payments still has no UPDATE path.
create policy "super_admin update payment date" on membership_payments for update
  using (
    is_super_admin()
    and exists (
      select 1 from memberships ms
      where ms.id = membership_payments.membership_id and is_branch_staff(ms.branch_id)
    )
  );

-- Reuses the same generic trigger already logging INSERTs on this table
-- (20260815000001) — no new logging code needed, its UPDATE branch
-- already computes changed_fields/before/after generically. Every
-- correction made through the policy above is therefore captured in
-- admin_audit_log as an 'update_payment' entry.
create trigger trg_audit_membership_payments_update
  after update on membership_payments
  for each row execute function log_table_change('payment');

-- Root-cause fix: current_date evaluates in the database's own timezone
-- (UTC on Supabase), not Egypt's — a payment recorded between local
-- midnight and the UTC/Cairo offset (~2-3am) previously landed on the
-- wrong calendar day, which is exactly the kind of mistake the
-- correction feature above exists to clean up after the fact. This only
-- changes the default for future inserts; it does not touch any
-- existing row.
alter table membership_payments
  alter column payment_date set default (timezone('Africa/Cairo', now()))::date;
