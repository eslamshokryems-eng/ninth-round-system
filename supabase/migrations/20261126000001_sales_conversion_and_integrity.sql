-- Sales Release C (part 2) — safe lead conversion + write-path integrity. Requires Releases A, B, C1 (20261123..20261125).
--
-- 1. CONVERSION (fixes Production's broken convert_lead_to_member, see docs/releases/sales-register-membership-audit.md)
--    Production holds two overloads of register_membership (20 and 21 arguments). The old convert_lead_to_member passed 19
--    positional arguments, which both overloads accept, so every conversion failed with 42725 "function ... is not unique" (HTTP 400).
--    convert_lead() calls register_membership with NAMED arguments including p_sold_by, which only the 21-argument version has,
--    so the call resolves to exactly one function whether or not the leftover 20-argument overload exists. Nothing is dropped.
--    Attribution (unchanged meanings):
--      memberships.sold_by            = the lead owner (leads.assigned_to at the moment of conversion)
--      memberships.created_by         = the signed-in employee who converts (set by register_membership from auth.uid())
--      membership_payments.received_by = the signed-in employee who converts (set by register_membership from auth.uid())
--    Safety:
--      * convert_lead is SECURITY INVOKER: member/membership/payment inserts are checked by the SAME RLS as reception's
--        register_membership today. No new right to create memberships is granted to anybody.
--      * the lead row is locked FOR UPDATE: two concurrent conversions serialize; the second sees "converted" and gets the
--        first one's result back (already_converted = true) — never a second member, membership, payment or receipt.
--      * a retry after success returns the same result; any failure rolls the whole conversion back (one transaction).
--      * marking a lead converted is possible ONLY through finalize_lead_conversion(), which accepts only a membership created
--        in the same transaction by the same employee for this lead's owner (closes audit finding F3).
--    No second revenue ledger: lead_conversions only links lead -> member/membership; money stays in memberships/membership_payments.
--
-- 2. WRITE-PATH INTEGRITY: API users can no longer bypass the Sales rules with direct table writes:
--      leads: status, lost_*, converted_*, interest_level, assigned_to, branch_id, created_by, last_contacted_at change only
--             through the Sales functions (profile fields — name, phone, email, gender, source, interest — stay directly editable);
--             a new lead is always inserted as 'new' and not converted/lost.
--      lead_followups: written only through the Sales functions (so an active lead always keeps exactly one next action and
--             every follow-up change is in the history).
--    New functions for what used to be direct writes: mark_lead_lost, reopen_lead.
--
-- Rollback: supabase/rollback/sales_conversion_and_integrity_rollback.sql (refuses while conversions recorded here exist).

-- ---------------------------------------------------------------------------
-- 1. lead_conversions (append-only link; no amounts)
-- ---------------------------------------------------------------------------
create table public.lead_conversions (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null unique references public.leads(id) on delete restrict,
  branch_id         uuid not null references public.branches(id),
  member_id         uuid not null references public.members(id) on delete restrict,
  membership_id     uuid not null unique references public.memberships(id) on delete restrict,
  membership_number text,
  lead_owner        uuid references public.profiles(id) on delete set null,   -- = memberships.sold_by
  lead_owner_name   text,
  converted_by      uuid references public.profiles(id) on delete set null,   -- = memberships.created_by
  converted_by_name text,
  converted_at      timestamptz not null default now()
);
create index idx_lead_conversions_branch on public.lead_conversions (branch_id, converted_at desc);
comment on table public.lead_conversions is 'One row per converted lead: which member/membership it became, the lead owner credited (memberships.sold_by) and who converted it (memberships.created_by). Written only by finalize_lead_conversion(). Amounts stay in memberships/membership_payments.';

alter table public.lead_conversions enable row level security;
revoke all on table public.lead_conversions from public, anon, authenticated, service_role;
grant select on table public.lead_conversions to authenticated;
create policy "lead conversions read" on public.lead_conversions for select
  using (
    (select public.auth_role()) = 'super_admin'
    or (branch_id = (select public.my_sales_branch())
        and ((select public.auth_role()) = 'branch_manager' or lead_owner = (select auth.uid()) or converted_by = (select auth.uid())))
  );
create trigger trg_guard_lead_conversions before update or delete on public.lead_conversions for each row execute function public.guard_lead_history();
create trigger trg_guard_lead_conversions_truncate before truncate on public.lead_conversions for each statement execute function public.guard_lead_history();

-- ---------------------------------------------------------------------------
-- 2. write-path guards (trusted = the function owner running a Sales function, or a database administrator)
-- ---------------------------------------------------------------------------
create or replace function public.guard_lead_direct_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'supabase_admin') then return new; end if;
  if new.status is distinct from old.status
     or new.lost_reason is distinct from old.lost_reason or new.lost_note is distinct from old.lost_note or new.lost_at is distinct from old.lost_at
     or new.converted_member_id is distinct from old.converted_member_id or new.converted_at is distinct from old.converted_at
     or new.interest_level is distinct from old.interest_level
     or new.assigned_to is distinct from old.assigned_to
     or new.branch_id is distinct from old.branch_id
     or new.created_by is distinct from old.created_by then
    raise exception 'SALES_GUARD: status, priority, ownership and conversion change only through the Sales workspace actions' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_lead_direct_update() from public, anon, authenticated, service_role;
create trigger trg_guard_lead_direct_update before update on public.leads for each row execute function public.guard_lead_direct_update();

-- insert rules: Release B rules + a new lead always starts as 'new', never converted/lost/contacted
create or replace function public.enforce_lead_insert_rules()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_target_branch uuid;
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then return new; end if;
  if new.status is distinct from 'new' or new.converted_member_id is not null or new.converted_at is not null
     or new.lost_reason is not null or new.lost_at is not null or new.last_contacted_at is not null then
    raise exception 'SALES_GUARD: a new lead starts as New; contact, loss and conversion are recorded through the Sales workspace' using errcode = '42501';
  end if;
  if (select public.auth_role()) in ('branch_manager', 'super_admin') then
    if new.assigned_to is not null then
      select branch_id into v_target_branch from public.profiles where id = new.assigned_to;
      if v_target_branch is distinct from new.branch_id then
        raise exception 'SALES_GUARD: a lead can only be assigned to a staff member of the same branch' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
  if new.assigned_to is null then new.assigned_to := auth.uid(); end if;
  if new.assigned_to is distinct from auth.uid() then
    raise exception 'SALES_GUARD: a sales employee can only create leads assigned to themselves' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.enforce_lead_insert_rules() from public, anon, authenticated, service_role;

create or replace function public.guard_followup_direct_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('postgres', 'supabase_admin') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'SALES_GUARD: follow-ups are scheduled, completed and rescheduled through the Sales workspace actions' using errcode = '42501';
end $$;
revoke all on function public.guard_followup_direct_write() from public, anon, authenticated, service_role;
create trigger trg_guard_followup_direct_write before insert or update or delete on public.lead_followups for each row execute function public.guard_followup_direct_write();

-- ---------------------------------------------------------------------------
-- 3. lost / reopen (replace the direct UPDATEs the old lead page used)
-- ---------------------------------------------------------------------------
create or replace function public.mark_lead_lost(p_lead_id uuid, p_reason public.lead_lost_reason, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_lead public.leads%rowtype; v_name text;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if p_reason is null then raise exception 'Choose why the lead is lost.' using errcode = '22023'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  if v_lead.status in ('converted', 'lost') then raise exception 'This lead is already closed (%).', v_lead.status using errcode = '22023'; end if;
  select full_name into v_name from public.profiles where id = v_uid;
  update public.lead_followups set status = 'cancelled', outcome = 'not_interested', completed_note = 'Lead marked lost'
   where lead_id = p_lead_id and status = 'pending';
  update public.leads set status = 'lost', lost_reason = p_reason, lost_note = nullif(btrim(coalesce(p_note, '')), ''), lost_at = now()
   where id = p_lead_id;
  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, note, detail)
  values (p_lead_id, v_lead.branch_id, v_uid, v_name, 'status_change', nullif(btrim(coalesce(p_note, '')), ''),
          jsonb_build_object('from', v_lead.status, 'to', 'lost', 'lost_reason', p_reason));
end $$;
revoke all on function public.mark_lead_lost(uuid, public.lead_lost_reason, text) from public, anon;
grant execute on function public.mark_lead_lost(uuid, public.lead_lost_reason, text) to authenticated;

create or replace function public.reopen_lead(p_lead_id uuid, p_next_kind text, p_next_at timestamptz, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_lead public.leads%rowtype; v_name text;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if p_next_kind is null or p_next_kind not in ('call', 'whatsapp', 'visit', 'other') then raise exception 'Choose the next action type.' using errcode = '22023'; end if;
  if p_next_at is null or p_next_at < now() - interval '5 minutes' then raise exception 'The next action must be scheduled in the future.' using errcode = '22023'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  if v_lead.status <> 'lost' then raise exception 'Only a lost lead can be reopened.' using errcode = '22023'; end if;
  select full_name into v_name from public.profiles where id = v_uid;
  update public.leads set status = 'follow_up', lost_reason = null, lost_note = null, lost_at = null where id = p_lead_id;
  insert into public.lead_followups (lead_id, branch_id, due_at, note, status, created_by, kind)
  values (p_lead_id, v_lead.branch_id, p_next_at, nullif(btrim(coalesce(p_note, '')), ''), 'pending', v_uid, p_next_kind);
  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, note, next_action_kind, next_action_at, detail)
  values (p_lead_id, v_lead.branch_id, v_uid, v_name, 'status_change', nullif(btrim(coalesce(p_note, '')), ''), p_next_kind, p_next_at,
          jsonb_build_object('from', 'lost', 'to', 'follow_up', 'previous_lost_reason', v_lead.lost_reason));
end $$;
revoke all on function public.reopen_lead(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.reopen_lead(uuid, text, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. conversion
-- ---------------------------------------------------------------------------
-- Marks the lead converted. Callable by an employee, but only accepts a membership that was created in the CURRENT transaction
-- (created_at = now(), the transaction start time), by the caller, for this lead's branch and owner, and not linked to another lead.
create or replace function public.finalize_lead_conversion(p_lead_id uuid, p_member_id uuid, p_membership_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_lead public.leads%rowtype; v_ms public.memberships%rowtype; v_mem public.members%rowtype;
  v_name text; v_owner_name text;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  if v_lead.status in ('converted', 'lost') or v_lead.converted_member_id is not null then
    raise exception 'This lead is already closed (%).', v_lead.status using errcode = '22023'; end if;
  select * into v_ms from public.memberships where id = p_membership_id;
  select * into v_mem from public.members where id = p_member_id;
  if v_ms.id is null or v_mem.id is null or v_ms.member_id is distinct from v_mem.id
     or v_ms.branch_id is distinct from v_lead.branch_id or v_mem.branch_id is distinct from v_lead.branch_id
     or v_ms.created_by is distinct from v_uid or v_ms.sold_by is distinct from v_lead.assigned_to
     or v_ms.created_at is distinct from now() or v_mem.created_at is distinct from now()
     or exists (select 1 from public.lead_conversions c where c.membership_id = p_membership_id) then
    raise exception 'SALES_GUARD: a lead is marked converted only by registering its membership through Convert' using errcode = '42501';
  end if;
  select full_name into v_name from public.profiles where id = v_uid;
  select full_name into v_owner_name from public.profiles where id = v_lead.assigned_to;
  insert into public.lead_conversions (lead_id, branch_id, member_id, membership_id, membership_number, lead_owner, lead_owner_name, converted_by, converted_by_name)
  values (p_lead_id, v_lead.branch_id, p_member_id, p_membership_id, v_ms.membership_number, v_lead.assigned_to, v_owner_name, v_uid, v_name);
  update public.lead_followups set status = 'completed', completed_at = now(), outcome = 'ready_to_join', completed_note = 'Lead converted'
   where lead_id = p_lead_id and status = 'pending';
  update public.leads set status = 'converted', converted_member_id = p_member_id, converted_at = now() where id = p_lead_id;
  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, detail)
  values (p_lead_id, v_lead.branch_id, v_uid, v_name, 'conversion',
          jsonb_build_object('from', v_lead.status, 'member_id', p_member_id, 'membership_id', p_membership_id, 'membership_number', v_ms.membership_number,
                             'sold_by', v_lead.assigned_to, 'sold_by_name', v_owner_name, 'created_by', v_uid));
  perform public.log_audit_event('convert_lead', 'lead', p_lead_id, null,
    jsonb_build_object('member_id', p_member_id, 'membership_id', p_membership_id, 'sold_by', v_lead.assigned_to),
    jsonb_build_object('membership_number', v_ms.membership_number));
end $$;
revoke all on function public.finalize_lead_conversion(uuid, uuid, uuid) from public, anon;
grant execute on function public.finalize_lead_conversion(uuid, uuid, uuid) to authenticated;

-- The conversion. INVOKER (RLS of members/memberships/payments applies as for reception). search_path is 'public, pg_temp'
-- (not empty) because the existing register_membership() refers to its tables without a schema and inherits the caller's path.
create or replace function public.convert_lead(
  p_lead_id uuid, p_membership_type_id uuid, p_receipt_number text, p_price numeric, p_discount numeric, p_start_date date,
  p_payment_method public.membership_payment_method, p_notes text default null,
  p_national_id text default null, p_date_of_birth date default null, p_address text default null,
  p_emergency_contact_name text default null, p_emergency_contact_phone text default null, p_photo_url text default null,
  p_coach_id uuid default null, p_session_count integer default null, p_program_type public.program_type default null
) returns table (member_id uuid, membership_id uuid, membership_number text, member_qr_code text, already_converted boolean)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_lead public.leads%rowtype; v_owner public.profiles%rowtype; v_r record; v_c public.lead_conversions%rowtype;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;

  select * into v_lead from public.leads l where l.id = p_lead_id for update;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;

  -- idempotent: an already converted lead returns its existing result, nothing is created
  if v_lead.status = 'converted' or v_lead.converted_member_id is not null then
    select * into v_c from public.lead_conversions c where c.lead_id = p_lead_id;
    member_id := coalesce(v_c.member_id, v_lead.converted_member_id); membership_id := v_c.membership_id;
    membership_number := v_c.membership_number;
    select m.qr_code into member_qr_code from public.members m where m.id = coalesce(v_c.member_id, v_lead.converted_member_id);
    already_converted := true;
    return next; return;
  end if;
  if v_lead.status = 'lost' then raise exception 'This lead is marked lost. Reopen it before converting.' using errcode = '22023'; end if;

  if v_lead.assigned_to is null then
    raise exception 'Assign this lead to its sales owner before converting (the owner is credited as Sold By).' using errcode = '22023'; end if;
  select * into v_owner from public.profiles p where p.id = v_lead.assigned_to;
  if v_owner.id is null or not v_owner.is_active then
    raise exception 'The lead owner is no longer active. A manager must reassign the lead before converting.' using errcode = '22023'; end if;

  if p_membership_type_id is null then raise exception 'Choose the membership.' using errcode = '22023'; end if;
  if coalesce(btrim(p_receipt_number), '') = '' then raise exception 'Enter the receipt number.' using errcode = '22023'; end if;
  if p_price is null or p_price < 0 then raise exception 'Enter a valid price.' using errcode = '22023'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_discount, 0) > p_price then raise exception 'The discount must be between 0 and the price.' using errcode = '22023'; end if;
  if p_start_date is null then raise exception 'Choose the start date.' using errcode = '22023'; end if;
  if p_payment_method is null then raise exception 'Choose the payment method.' using errcode = '22023'; end if;
  if exists (select 1 from public.memberships ms where ms.receipt_number = btrim(p_receipt_number)) then
    raise exception 'Receipt number % is already used.', btrim(p_receipt_number) using errcode = '23505'; end if;
  if exists (select 1 from public.members mb where mb.phone = v_lead.phone) then
    raise exception 'This phone number already belongs to a member. Renew or add a membership from the member''s profile instead.' using errcode = '23505'; end if;

  -- named arguments + p_sold_by: resolves to exactly one register_membership even while the old 20-argument overload exists
  select * into v_r from public.register_membership(
    p_branch_id => v_lead.branch_id, p_full_name => v_lead.full_name, p_phone => v_lead.phone, p_gender => v_lead.gender,
    p_date_of_birth => p_date_of_birth, p_national_id => p_national_id, p_membership_type_id => p_membership_type_id,
    p_receipt_number => btrim(p_receipt_number), p_price => p_price, p_discount => coalesce(p_discount, 0), p_start_date => p_start_date,
    p_payment_method => p_payment_method, p_notes => p_notes, p_address => p_address,
    p_emergency_contact_name => p_emergency_contact_name, p_emergency_contact_phone => p_emergency_contact_phone,
    p_photo_url => p_photo_url, p_coach_id => p_coach_id, p_session_count => p_session_count,
    p_program_type => p_program_type, p_sold_by => v_lead.assigned_to);

  perform public.finalize_lead_conversion(p_lead_id, v_r.member_id, v_r.membership_id);

  member_id := v_r.member_id; membership_id := v_r.membership_id; membership_number := v_r.membership_number;
  member_qr_code := v_r.member_qr_code; already_converted := false;
  return next;
end $$;
revoke all on function public.convert_lead(uuid, uuid, text, numeric, numeric, date, public.membership_payment_method, text, text, date, text, text, text, text, uuid, integer, public.program_type) from public, anon;
grant execute on function public.convert_lead(uuid, uuid, text, numeric, numeric, date, public.membership_payment_method, text, text, date, text, text, text, text, uuid, integer, public.program_type) to authenticated;

-- The old entry point keeps its exact signature and result shape (any old client keeps working) and now uses the safe path.
create or replace function public.convert_lead_to_member(
  p_lead_id uuid, p_membership_type_id uuid, p_receipt_number text, p_price numeric, p_discount numeric, p_start_date date,
  p_payment_method public.membership_payment_method, p_notes text, p_national_id text default null, p_date_of_birth date default null,
  p_address text default null, p_emergency_contact_name text default null, p_emergency_contact_phone text default null,
  p_photo_url text default null, p_coach_id uuid default null, p_session_count integer default null
) returns table (member_id uuid, membership_id uuid, membership_number text, member_qr_code text)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_r record;
begin
  select * into v_r from public.convert_lead(
    p_lead_id => p_lead_id, p_membership_type_id => p_membership_type_id, p_receipt_number => p_receipt_number, p_price => p_price,
    p_discount => p_discount, p_start_date => p_start_date, p_payment_method => p_payment_method, p_notes => p_notes,
    p_national_id => p_national_id, p_date_of_birth => p_date_of_birth, p_address => p_address,
    p_emergency_contact_name => p_emergency_contact_name, p_emergency_contact_phone => p_emergency_contact_phone,
    p_photo_url => p_photo_url, p_coach_id => p_coach_id, p_session_count => p_session_count);
  member_id := v_r.member_id; membership_id := v_r.membership_id; membership_number := v_r.membership_number; member_qr_code := v_r.member_qr_code;
  return next;
end $$;
revoke all on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, public.membership_payment_method, text, text, date, text, text, text, text, uuid, integer) from public, anon;
grant execute on function public.convert_lead_to_member(uuid, uuid, text, numeric, numeric, date, public.membership_payment_method, text, text, date, text, text, text, text, uuid, integer) to authenticated;

-- conversion details for the lead page / reports (RLS-scoped through lead_conversions' policy)
create or replace function public.get_lead_conversion(p_lead_id uuid)
returns table (member_id uuid, membership_id uuid, membership_number text, lead_owner uuid, lead_owner_name text,
               converted_by uuid, converted_by_name text, converted_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select c.member_id, c.membership_id, c.membership_number, c.lead_owner, c.lead_owner_name, c.converted_by, c.converted_by_name, c.converted_at
  from public.lead_conversions c where c.lead_id = p_lead_id;
$$;
revoke all on function public.get_lead_conversion(uuid) from public, anon;
grant execute on function public.get_lead_conversion(uuid) to authenticated;
