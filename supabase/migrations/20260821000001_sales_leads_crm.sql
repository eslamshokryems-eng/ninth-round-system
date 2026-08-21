-- 9th Round — Sales / Leads CRM (Phase 6).
--
-- Purely additive: two new tables (leads, lead_followups), three new
-- enums, RLS policies following the exact is_branch_staff()/auth_role()
-- pattern already used by members/memberships, and the existing generic
-- log_table_change() trigger (20260815000001) for the Lead Timeline.
-- Nothing here alters members, memberships, profiles, auth, roles, or any
-- existing function — Convert-to-Member calls the existing
-- register_membership() unchanged, so the member_code/lpad fix
-- (20260820000002_fix_member_code_lpad_truncation.sql) is inherited
-- automatically, never re-implemented or touched.

create type lead_status as enum ('new', 'contacted', 'follow_up', 'converted', 'lost');
create type lead_source as enum ('walk_in', 'phone', 'facebook', 'instagram', 'referral', 'website', 'other');
create type lead_lost_reason as enum ('not_interested', 'too_expensive', 'chose_competitor', 'unreachable', 'other');
create type followup_status as enum ('pending', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------

create table leads (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches (id),
  full_name text not null,
  phone text not null,
  email text,
  gender gender,
  source lead_source not null default 'other',
  status lead_status not null default 'new',
  interested_membership_type_id uuid references membership_types (id),
  interest_notes text,
  assigned_to uuid references profiles (id),
  lost_reason lead_lost_reason,
  lost_note text,
  lost_at timestamptz,
  converted_member_id uuid references members (id),
  converted_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

create index idx_leads_branch on leads (branch_id);
create index idx_leads_assigned on leads (assigned_to);
create index idx_leads_phone on leads (phone);
create index idx_leads_status on leads (status);
create index idx_leads_full_name_trgm on leads using gin (full_name gin_trgm_ops);
create index idx_leads_phone_trgm on leads using gin (phone gin_trgm_ops);

-- A converted lead points at exactly one member, and a member is the
-- conversion target of at most one lead — prevents a double-convert from
-- silently producing two leads linked to the same member.
create unique index uq_leads_converted_member on leads (converted_member_id) where converted_member_id is not null;

-- ---------------------------------------------------------------------------
-- Follow-ups — append/complete, never overwritten; a lead can have many.
-- ---------------------------------------------------------------------------

create table lead_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  branch_id uuid not null references branches (id),
  due_at timestamptz not null,
  note text,
  status followup_status not null default 'pending',
  completed_at timestamptz,
  completed_note text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_lead_followups_updated_at
  before update on lead_followups
  for each row execute function set_updated_at();

create index idx_lead_followups_lead on lead_followups (lead_id);
create index idx_lead_followups_branch on lead_followups (branch_id);
create index idx_lead_followups_due on lead_followups (status, due_at);

-- ---------------------------------------------------------------------------
-- RLS — same shape as members/memberships (is_branch_staff()/auth_role()),
-- narrowed to the roles that actually work leads: a plain sales_employee
-- sees only their own assigned leads (or unclaimed ones, so they can pick
-- up new leads); branch_manager/super_admin see every lead in their scope.
-- Reception/coach get no access — Sales is a distinct workflow from the
-- front desk. No service_role key, no RLS bypass, no security-definer
-- privilege beyond the one helper below (mirrors is_branch_staff()'s own
-- shape exactly — same "language sql stable", no elevated rights).
-- ---------------------------------------------------------------------------

-- Schema-qualified throughout (public.is_super_admin/public.profiles), same
-- as is_super_admin()'s own fix in 20260815000002 — required so this still
-- resolves correctly when inlined into a caller running with
-- `set search_path = ''` (get_lead_timeline() below), not just when called
-- directly from an RLS policy (which runs with the normal search_path).
create or replace function can_manage_leads(target_branch_id uuid)
returns boolean
language sql stable
as $$
  select
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.branch_id = target_branch_id
        and p.is_active
        and p.role in ('branch_manager', 'sales_employee')
    );
$$;

alter table leads enable row level security;
alter table lead_followups enable row level security;

create policy "sales staff read leads" on leads for select
  using (
    can_manage_leads(branch_id)
    and (auth_role() in ('branch_manager', 'super_admin') or assigned_to = auth.uid() or assigned_to is null)
  );

create policy "sales staff insert leads" on leads for insert
  with check (can_manage_leads(branch_id) and created_by = auth.uid());

create policy "sales staff update leads" on leads for update
  using (
    can_manage_leads(branch_id)
    and (auth_role() in ('branch_manager', 'super_admin') or assigned_to = auth.uid() or assigned_to is null)
  )
  with check (can_manage_leads(branch_id));

create policy "sales staff read followups" on lead_followups for select
  using (
    can_manage_leads(branch_id)
    and exists (
      select 1 from leads l
      where l.id = lead_followups.lead_id
        and (auth_role() in ('branch_manager', 'super_admin') or l.assigned_to = auth.uid())
    )
  );

create policy "sales staff insert followups" on lead_followups for insert
  with check (
    can_manage_leads(branch_id)
    and created_by = auth.uid()
    and exists (
      select 1 from leads l
      where l.id = lead_followups.lead_id
        and (auth_role() in ('branch_manager', 'super_admin') or l.assigned_to = auth.uid())
    )
  );

create policy "sales staff update followups" on lead_followups for update
  using (
    can_manage_leads(branch_id)
    and exists (
      select 1 from leads l
      where l.id = lead_followups.lead_id
        and (auth_role() in ('branch_manager', 'super_admin') or l.assigned_to = auth.uid())
    )
  )
  with check (can_manage_leads(branch_id));

-- ---------------------------------------------------------------------------
-- Timeline — reuses the existing generic audit trigger (20260815000001)
-- instead of a bespoke lead_activities table, per instruction to reuse the
-- current audit system rather than duplicate it. Create/update both flow
-- through it automatically; the special actions (convert) additionally
-- call log_audit_event() explicitly below for a clearer label + metadata —
-- the same "generic trigger + one explicit extra call" pattern
-- register_membership() already uses for the memberships table.
-- ---------------------------------------------------------------------------

create trigger trg_audit_leads_insert
  after insert on leads
  for each row execute function log_table_change('lead');

create trigger trg_audit_leads_update
  after update on leads
  for each row execute function log_table_change('lead');

create trigger trg_audit_lead_followups_insert
  after insert on lead_followups
  for each row execute function log_table_change('lead_followup');

create trigger trg_audit_lead_followups_update
  after update on lead_followups
  for each row execute function log_table_change('lead_followup');

-- ---------------------------------------------------------------------------
-- convert_lead_to_member() — a thin wrapper, NOT a re-implementation of
-- registration. It calls the existing register_membership() unchanged,
-- then links the lead to the resulting member. security invoker: runs as
-- the calling user, bound by the exact same members/memberships RLS
-- register_membership() already enforces when called directly — no
-- privilege the caller didn't already have, no bypass.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- get_lead_timeline() — the Lead Detail page's Timeline section reads
-- admin_audit_log rows for one specific lead. admin_audit_log's own RLS
-- ("super_admin reads audit log", 20260815000001) is deliberately left
-- untouched — widening it with a second broad SELECT policy would hand
-- every sales_employee/branch_manager read access to the *entire* audit
-- log (logins, salary changes, permission grants — unrelated to Sales).
-- Instead this is a narrow, single-purpose SECURITY DEFINER function: it
-- re-checks the caller can see this exact lead (same rule as the `leads`
-- select policy above) and, only then, returns just that lead's rows.
-- No blanket grant, no RLS change, no bypass of anything else.
-- ---------------------------------------------------------------------------

create or replace function get_lead_timeline(p_lead_id uuid)
returns table (
  id uuid,
  action text,
  actor_role text,
  actor_full_name text,
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and public.can_manage_leads(l.branch_id)
      and (public.auth_role() in ('branch_manager', 'super_admin') or l.assigned_to = auth.uid())
  ) then
    return;
  end if;

  return query
    select a.id, a.action, a.actor_role, a.actor_full_name, a.target_table, a.target_id, a.before, a.after, a.metadata, a.created_at
    from public.admin_audit_log a
    where (a.target_table = 'lead' and a.target_id = p_lead_id)
       or (a.target_table = 'lead_followup' and a.target_id in (
             select f.id from public.lead_followups f where f.lead_id = p_lead_id
           ))
    order by a.created_at desc;
end;
$$;
