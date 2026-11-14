-- Rollback for 20261126000001_sales_conversion_and_integrity.sql.
-- SAFETY: refuses while any conversion recorded by convert_lead exists (lead_conversions rows) — those link real memberships to leads and
-- must not be orphaned. Otherwise: removes the write-path guards and the new functions, restores the Release B insert rules and the
-- ORIGINAL convert_lead_to_member body (the one Production runs today — note it is broken in Production while the duplicate
-- register_membership overload exists; rolling back restores that broken state, so prefer fixing forward).
begin;
do $$
begin
  if exists (select 1 from public.lead_conversions) then
    raise exception 'ROLLBACK REFUSED: % conversion(s) recorded through convert_lead exist.', (select count(*) from public.lead_conversions);
  end if;
end $$;

drop trigger if exists trg_guard_lead_direct_update on public.leads;
drop trigger if exists trg_guard_followup_direct_write on public.lead_followups;
drop function if exists public.guard_lead_direct_update();
drop function if exists public.guard_followup_direct_write();
drop function if exists public.get_lead_conversion(uuid);
drop function if exists public.convert_lead(uuid, uuid, text, numeric, numeric, date, public.membership_payment_method, text, text, date, text, text, text, text, uuid, integer, public.program_type);
drop function if exists public.finalize_lead_conversion(uuid, uuid, uuid);
drop function if exists public.reopen_lead(uuid, text, timestamptz, text);
drop function if exists public.mark_lead_lost(uuid, public.lead_lost_reason, text);
drop table public.lead_conversions;

-- Release B insert rules (verbatim)
create or replace function public.enforce_lead_insert_rules()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_target_branch uuid;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if (select public.auth_role()) in ('branch_manager', 'super_admin') then
    if new.assigned_to is not null then
      select branch_id into v_target_branch from public.profiles where id = new.assigned_to;
      if v_target_branch is distinct from new.branch_id then
        raise exception 'SALES_GUARD: a lead can only be assigned to a staff member of the same branch' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
  -- sales employee: a new lead is always their own
  if new.assigned_to is null then new.assigned_to := auth.uid(); end if;
  if new.assigned_to is distinct from auth.uid() then
    raise exception 'SALES_GUARD: a sales employee can only create leads assigned to themselves' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.enforce_lead_insert_rules() from public, anon, authenticated, service_role;

-- original convert_lead_to_member: body copied byte-for-byte from 20260821000001_sales_leads_crm.sql (Production holds the same text
-- with CRLF line endings), then the original ACL rebuilt in its original order (PUBLIC, owner, anon, authenticated, service_role).
create or replace function convert_lead_to_member(
  p_lead_id uuid,
  p_membership_type_id uuid,
  p_receipt_number text,
  p_price numeric,
  p_discount numeric,
  p_start_date date,
  p_payment_method membership_payment_method,
  p_notes text,
  p_national_id text default null,
  p_date_of_birth date default null,
  p_address text default null,
  p_emergency_contact_name text default null,
  p_emergency_contact_phone text default null,
  p_photo_url text default null,
  p_coach_id uuid default null,
  p_session_count integer default null
)
returns table (
  member_id uuid,
  membership_id uuid,
  membership_number text,
  member_qr_code text
)
language plpgsql
security invoker
as $$
declare
  v_lead leads%rowtype;
  v_result record;
begin
  -- RLS on `leads` (select) is enforced here exactly as for any other
  -- select by this caller: a sales_employee who is not assigned to this
  -- lead simply finds no row, which is treated as "not found" below —
  -- there is no separate authorization check to bypass or forget.
  select * into v_lead from leads where id = p_lead_id;

  if v_lead.id is null then
    raise exception 'Lead not found: %', p_lead_id;
  end if;

  if v_lead.status = 'converted' or v_lead.converted_member_id is not null then
    raise exception 'Lead already converted to a member';
  end if;

  select * into v_result from register_membership(
    v_lead.branch_id, v_lead.full_name, v_lead.phone, v_lead.gender, p_date_of_birth,
    p_national_id, p_membership_type_id, p_receipt_number, p_price, p_discount,
    p_start_date, p_payment_method, p_notes, p_address, p_emergency_contact_name,
    p_emergency_contact_phone, p_photo_url, p_coach_id, p_session_count
  );

  update leads
  set status = 'converted', converted_member_id = v_result.member_id, converted_at = now()
  where id = p_lead_id;

  perform log_audit_event(
    'convert_lead', 'lead', p_lead_id, null,
    jsonb_build_object('member_id', v_result.member_id, 'membership_id', v_result.membership_id),
    jsonb_build_object('membership_number', v_result.membership_number)
  );

  member_id := v_result.member_id;
  membership_id := v_result.membership_id;
  membership_number := v_result.membership_number;
  member_qr_code := v_result.member_qr_code;
  return next;
end;
$$;
revoke all on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, membership_payment_method, text, text, date, text, text, text, text, uuid, integer) from public, postgres, anon, authenticated, service_role;
grant execute on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, membership_payment_method, text, text, date, text, text, text, text, uuid, integer) to public;
grant execute on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, membership_payment_method, text, text, date, text, text, text, text, uuid, integer) to postgres;
grant execute on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, membership_payment_method, text, text, date, text, text, text, text, uuid, integer) to anon;
grant execute on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, membership_payment_method, text, text, date, text, text, text, text, uuid, integer) to authenticated;
grant execute on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, membership_payment_method, text, text, date, text, text, text, text, uuid, integer) to service_role;
commit;
