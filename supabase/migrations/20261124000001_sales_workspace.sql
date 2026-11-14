-- Sales Release B — Sales Workspace MVP (additive; requires Release A, 20261123000001, for my_sales_branch()).
--
-- What this adds (extends the existing leads / lead_followups; no parallel CRM):
--   * lead_followups.kind / .outcome            what the next action is (call | whatsapp | visit | other) and how a completed one went
--   * leads.interest_level (hot|warm|cold) and leads.last_contacted_at (only the RPCs may change last_contacted_at)
--   * lead_activities   append-only history of every interaction/note/status/assignment/conversion; written ONLY by functions
--   * lead_assignments  append-only ownership history (who -> who, by whom, why); written by a trigger so no path can skip it
--   * RPCs (SECURITY DEFINER, empty search_path, auth.uid() only, NULL identity refused, EXECUTE only for authenticated):
--       get_my_worklist, get_worklist_summary, log_lead_interaction, set_lead_next_action, add_lead_note, set_lead_interest, assign_leads
--   * Policy alignment: a sales employee sees/updates ONLY the leads assigned to them. The unassigned pool is the manager's inbox
--     (Production today has 0 unassigned leads, so no employee loses visibility of anything). Branch managers keep the whole branch.
--   * F4 closure: a non-manager can no longer INSERT a lead assigned to somebody else or to another branch.
--
-- NOT changed: leads.assigned_to / memberships.sold_by / memberships.created_by / membership_payments.received_by meanings;
-- members, memberships, payments, receipts, RLS of any other table; conversion (Release C).
-- No unique "one pending follow-up" index: Production has 8 leads with several pending follow-ups; the RPCs close all pending ones
-- when an interaction is logged and leave exactly one new pending follow-up.
-- Rollback: supabase/rollback/sales_workspace_rollback.sql (refuses if history rows exist).

-- ---------------------------------------------------------------------------
-- 1. columns
-- ---------------------------------------------------------------------------
alter table public.lead_followups
  add column kind    text not null default 'call' check (kind in ('call', 'whatsapp', 'visit', 'other')),
  add column outcome text check (outcome in ('no_answer', 'message_sent', 'interested', 'wants_visit', 'ready_to_join', 'not_ready',
                                             'attended_visit', 'no_show', 'not_interested', 'other', 'rescheduled'));
alter table public.leads
  add column interest_level   text not null default 'warm' check (interest_level in ('hot', 'warm', 'cold')),
  add column last_contacted_at timestamptz;

create index if not exists idx_lead_followups_pending_lead on public.lead_followups (lead_id) where status = 'pending';
create index if not exists idx_leads_owner_status on public.leads (assigned_to, status);

-- ---------------------------------------------------------------------------
-- 2. history tables (append-only; written only by definer functions / the assignment trigger)
-- ---------------------------------------------------------------------------
create table public.lead_activities (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid not null references public.leads(id) on delete restrict,
  branch_id        uuid not null references public.branches(id),
  actor_id         uuid references public.profiles(id) on delete set null,
  actor_name       text,
  kind             text not null check (kind in ('call', 'whatsapp', 'visit', 'follow_up', 'note', 'status_change', 'assignment', 'reassignment', 'conversion')),
  outcome          text,
  note             text,
  next_action_kind text,
  next_action_at   timestamptz,
  detail           jsonb not null default '{}'::jsonb,
  occurred_at      timestamptz not null default now()
);
create index idx_lead_activities_lead on public.lead_activities (lead_id, occurred_at desc);
create index idx_lead_activities_actor on public.lead_activities (branch_id, actor_id, occurred_at desc);
comment on table public.lead_activities is 'Append-only lead history. actor_name is a snapshot so history survives staff deletion. Rows are created only by the Sales RPCs and the assignment trigger.';

create table public.lead_assignments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete restrict,
  branch_id    uuid not null references public.branches(id),
  from_owner   uuid references public.profiles(id) on delete set null,
  to_owner     uuid references public.profiles(id) on delete set null,
  from_name    text,
  to_name      text,
  performed_by uuid references public.profiles(id) on delete set null,
  performed_by_name text,
  reason       text,
  created_at   timestamptz not null default now()
);
create index idx_lead_assignments_lead on public.lead_assignments (lead_id, created_at desc);
comment on table public.lead_assignments is 'Append-only ownership history: previous owner, new owner, who did it, why. Written by trigger trg_record_lead_assignment on every change of leads.assigned_to.';

alter table public.lead_activities enable row level security;
alter table public.lead_assignments enable row level security;
revoke all on table public.lead_activities, public.lead_assignments from public, anon, authenticated, service_role;
grant select on table public.lead_activities, public.lead_assignments to authenticated;

-- SELECT scope = the lead's scope: owner (current), the branch's managers, Super Admin. Nobody gets INSERT/UPDATE/DELETE.
create policy "lead activities read" on public.lead_activities for select
  using (
    (select public.auth_role()) = 'super_admin'
    or (branch_id = (select public.my_sales_branch())
        and ((select public.auth_role()) = 'branch_manager'
             or exists (select 1 from public.leads l where l.id = lead_activities.lead_id and l.assigned_to = (select auth.uid()))))
  );
create policy "lead assignments read" on public.lead_assignments for select
  using (
    (select public.auth_role()) = 'super_admin'
    or (branch_id = (select public.my_sales_branch())
        and ((select public.auth_role()) = 'branch_manager'
             or exists (select 1 from public.leads l where l.id = lead_assignments.lead_id and l.assigned_to = (select auth.uid()))))
  );

create or replace function public.guard_lead_history()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'SALES_GUARD: lead history is append-only and cannot be changed or deleted' using errcode = '42501';
end $$;
revoke all on function public.guard_lead_history() from public, anon, authenticated, service_role;
create trigger trg_guard_lead_activities before update or delete on public.lead_activities for each row execute function public.guard_lead_history();
create trigger trg_guard_lead_assignments before update or delete on public.lead_assignments for each row execute function public.guard_lead_history();
create trigger trg_guard_lead_activities_truncate before truncate on public.lead_activities for each statement execute function public.guard_lead_history();
create trigger trg_guard_lead_assignments_truncate before truncate on public.lead_assignments for each statement execute function public.guard_lead_history();

-- ---------------------------------------------------------------------------
-- 3. leads: policies (employee = own leads only), insert guard (F4), last_contacted_at guard, assignment history trigger
-- ---------------------------------------------------------------------------
drop policy "sales staff read leads" on public.leads;
create policy "sales staff read leads" on public.leads for select
  using (
    (select public.auth_role()) = 'super_admin'
    or (branch_id = (select public.my_sales_branch())
        and ((select public.auth_role()) = 'branch_manager' or assigned_to = (select auth.uid())))
  );
drop policy "sales staff update leads" on public.leads;
create policy "sales staff update leads" on public.leads for update
  using (
    (select public.auth_role()) = 'super_admin'
    or (branch_id = (select public.my_sales_branch())
        and ((select public.auth_role()) = 'branch_manager' or assigned_to = (select auth.uid())))
  )
  with check (public.can_manage_leads(branch_id));

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
create trigger trg_enforce_lead_insert_rules before insert on public.leads for each row execute function public.enforce_lead_insert_rules();

create or replace function public.guard_lead_last_contacted()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.last_contacted_at is distinct from old.last_contacted_at and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'SALES_GUARD: last_contacted_at is set only by recording an interaction' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_lead_last_contacted() from public, anon, authenticated, service_role;
create trigger trg_guard_lead_last_contacted before update on public.leads for each row execute function public.guard_lead_last_contacted();

create or replace function public.record_lead_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(current_setting('app.assign_reason', true), '')), '');
  v_from text; v_to text; v_by text;
begin
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  if tg_op = 'INSERT' and new.assigned_to is null then return new; end if;
  select full_name into v_from from public.profiles where id = case when tg_op = 'UPDATE' then old.assigned_to end;
  select full_name into v_to   from public.profiles where id = new.assigned_to;
  select full_name into v_by   from public.profiles where id = v_uid;
  insert into public.lead_assignments (lead_id, branch_id, from_owner, to_owner, from_name, to_name, performed_by, performed_by_name, reason)
  values (new.id, new.branch_id, case when tg_op = 'UPDATE' then old.assigned_to end, new.assigned_to, v_from, v_to, v_uid, v_by, v_reason);
  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, note, detail)
  values (new.id, new.branch_id, v_uid, v_by,
          case when tg_op = 'UPDATE' and old.assigned_to is not null then 'reassignment' else 'assignment' end,
          v_reason,
          jsonb_build_object('from_owner', case when tg_op = 'UPDATE' then old.assigned_to end, 'to_owner', new.assigned_to, 'from_name', v_from, 'to_name', v_to));
  return new;
end $$;
revoke all on function public.record_lead_assignment() from public, anon, authenticated, service_role;
create trigger trg_record_lead_assignment_ins after insert on public.leads for each row execute function public.record_lead_assignment();
create trigger trg_record_lead_assignment_upd after update of assigned_to on public.leads for each row execute function public.record_lead_assignment();

-- ---------------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------------
-- authorisation helper used by every write RPC: may the CALLER act on this lead? (owner of it, or manager of its branch, or Super Admin)
create or replace function public.can_work_lead(p_lead_branch uuid, p_lead_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  -- coalesce: a NULL branch / NULL owner must mean "no", never "unknown" (fail closed)
  select coalesce(
    auth.uid() is not null and (
      (select public.auth_role()) = 'super_admin'
      or (p_lead_branch = (select public.my_sales_branch())
          and ((select public.auth_role()) = 'branch_manager' or p_lead_owner = auth.uid()))
    ), false);
$$;
revoke all on function public.can_work_lead(uuid, uuid) from public, anon;
grant execute on function public.can_work_lead(uuid, uuid) to authenticated;

create or replace function public.log_lead_interaction(
  p_lead_id uuid, p_kind text, p_outcome text, p_note text,
  p_next_kind text default null, p_next_at timestamptz default null,
  p_lost_reason public.lead_lost_reason default null, p_interest_level text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_lead public.leads%rowtype;
  v_name text; v_activity uuid; v_terminal boolean;
  v_status public.lead_status;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('call', 'whatsapp', 'visit') then raise exception 'Interaction kind must be call, whatsapp or visit.' using errcode = '22023'; end if;
  if p_outcome is null or p_outcome not in ('no_answer', 'message_sent', 'interested', 'wants_visit', 'ready_to_join', 'not_ready', 'attended_visit', 'no_show', 'not_interested', 'other') then
    raise exception 'Unknown interaction outcome.' using errcode = '22023'; end if;
  if p_interest_level is not null and p_interest_level not in ('hot', 'warm', 'cold') then raise exception 'Interest level must be hot, warm or cold.' using errcode = '22023'; end if;
  v_terminal := (p_outcome = 'not_interested');

  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  if v_lead.status in ('converted', 'lost') then raise exception 'This lead is already closed (%).', v_lead.status using errcode = '22023'; end if;

  if v_terminal then
    if p_lost_reason is null then raise exception 'Choose why the lead is lost.' using errcode = '22023'; end if;
  else
    if p_next_at is null or p_next_kind is null or p_next_kind not in ('call', 'whatsapp', 'visit', 'other') then
      raise exception 'Schedule the next action (what and when) — an active lead must always have one.' using errcode = '22023'; end if;
    if p_next_at < now() - interval '5 minutes' then raise exception 'The next action must be in the future.' using errcode = '22023'; end if;
  end if;

  select full_name into v_name from public.profiles where id = v_uid;

  update public.lead_followups
     set status = 'completed', completed_at = now(), completed_note = nullif(btrim(coalesce(p_note, '')), ''), outcome = p_outcome
   where lead_id = p_lead_id and status = 'pending';

  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, outcome, note, next_action_kind, next_action_at)
  values (p_lead_id, v_lead.branch_id, v_uid, v_name, p_kind, p_outcome, nullif(btrim(coalesce(p_note, '')), ''),
          case when v_terminal then null else p_next_kind end, case when v_terminal then null else p_next_at end)
  returning id into v_activity;

  v_status := case
    when v_terminal then 'lost'::public.lead_status
    when p_outcome in ('interested', 'wants_visit', 'ready_to_join', 'attended_visit') then 'follow_up'::public.lead_status
    when v_lead.status = 'new' then 'contacted'::public.lead_status
    else v_lead.status end;

  update public.leads
     set last_contacted_at = now(),
         status = v_status,
         interest_level = coalesce(p_interest_level, interest_level),
         lost_reason = case when v_terminal then p_lost_reason else lost_reason end,
         lost_note = case when v_terminal then nullif(btrim(coalesce(p_note, '')), '') else lost_note end,
         lost_at = case when v_terminal then now() else lost_at end
   where id = p_lead_id;

  if v_status is distinct from v_lead.status then
    insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, detail)
    values (p_lead_id, v_lead.branch_id, v_uid, v_name, 'status_change', jsonb_build_object('from', v_lead.status, 'to', v_status));
  end if;

  if not v_terminal then
    insert into public.lead_followups (lead_id, branch_id, due_at, note, status, created_by, kind)
    values (p_lead_id, v_lead.branch_id, p_next_at, null, 'pending', v_uid, p_next_kind);
  end if;
  return v_activity;
end $$;
revoke all on function public.log_lead_interaction(uuid, text, text, text, text, timestamptz, public.lead_lost_reason, text) from public, anon;
grant execute on function public.log_lead_interaction(uuid, text, text, text, text, timestamptz, public.lead_lost_reason, text) to authenticated;

create or replace function public.set_lead_next_action(p_lead_id uuid, p_kind text, p_at timestamptz, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_lead public.leads%rowtype; v_name text; v_id uuid;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('call', 'whatsapp', 'visit', 'other') then raise exception 'Choose the next action type.' using errcode = '22023'; end if;
  if p_at is null or p_at < now() - interval '5 minutes' then raise exception 'The next action must be scheduled in the future.' using errcode = '22023'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  if v_lead.status in ('converted', 'lost') then raise exception 'This lead is already closed (%).', v_lead.status using errcode = '22023'; end if;
  select full_name into v_name from public.profiles where id = v_uid;
  update public.lead_followups set status = 'cancelled', outcome = 'rescheduled', completed_note = 'Rescheduled' where lead_id = p_lead_id and status = 'pending';
  insert into public.lead_followups (lead_id, branch_id, due_at, note, status, created_by, kind)
  values (p_lead_id, v_lead.branch_id, p_at, nullif(btrim(coalesce(p_note, '')), ''), 'pending', v_uid, p_kind) returning id into v_id;
  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, note, next_action_kind, next_action_at)
  values (p_lead_id, v_lead.branch_id, v_uid, v_name, 'follow_up', coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Next action scheduled'), p_kind, p_at);
  return v_id;
end $$;
revoke all on function public.set_lead_next_action(uuid, text, timestamptz, text) from public, anon;
grant execute on function public.set_lead_next_action(uuid, text, timestamptz, text) to authenticated;

create or replace function public.add_lead_note(p_lead_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_lead public.leads%rowtype; v_name text; v_id uuid;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Write a note.' using errcode = '22023'; end if;
  select * into v_lead from public.leads where id = p_lead_id;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  select full_name into v_name from public.profiles where id = v_uid;
  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, note)
  values (p_lead_id, v_lead.branch_id, v_uid, v_name, 'note', btrim(p_note)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.add_lead_note(uuid, text) from public, anon;
grant execute on function public.add_lead_note(uuid, text) to authenticated;

create or replace function public.set_lead_interest(p_lead_id uuid, p_level text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_lead public.leads%rowtype; v_name text;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if p_level is null or p_level not in ('hot', 'warm', 'cold') then raise exception 'Interest level must be hot, warm or cold.' using errcode = '22023'; end if;
  select * into v_lead from public.leads where id = p_lead_id for update;
  if v_lead.id is null or not public.can_work_lead(v_lead.branch_id, v_lead.assigned_to) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  if v_lead.interest_level = p_level then return; end if;
  select full_name into v_name from public.profiles where id = v_uid;
  update public.leads set interest_level = p_level where id = p_lead_id;
  insert into public.lead_activities (lead_id, branch_id, actor_id, actor_name, kind, detail)
  values (p_lead_id, v_lead.branch_id, v_uid, v_name, 'status_change', jsonb_build_object('field', 'interest_level', 'from', v_lead.interest_level, 'to', p_level));
end $$;
revoke all on function public.set_lead_interest(uuid, text) from public, anon;
grant execute on function public.set_lead_interest(uuid, text) to authenticated;

create or replace function public.assign_leads(p_lead_ids uuid[], p_new_owner uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_n integer := 0; v_lead public.leads%rowtype; v_target public.profiles%rowtype;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if p_lead_ids is null or cardinality(p_lead_ids) = 0 then raise exception 'Select at least one lead.' using errcode = '22023'; end if;
  if p_new_owner is null then raise exception 'Choose the employee who will own these leads.' using errcode = '22023'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'A reason is required to assign or reassign leads.' using errcode = '22023'; end if;
  if (select public.auth_role()) not in ('branch_manager', 'super_admin') then
    raise exception 'Only a branch manager or Super Admin can assign leads.' using errcode = '42501'; end if;
  select * into v_target from public.profiles where id = p_new_owner;
  if v_target.id is null or v_target.role <> 'sales_employee' or not v_target.is_active then
    raise exception 'The new owner must be an active sales employee.' using errcode = '22023'; end if;
  perform set_config('app.assign_reason', btrim(p_reason), true);
  for v_lead in select * from public.leads where id = any(p_lead_ids) order by id for update loop
    if not ((select public.auth_role()) = 'super_admin' or v_lead.branch_id = (select public.my_sales_branch())) then
      raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
    if v_lead.branch_id is distinct from v_target.branch_id then
      raise exception 'The new owner belongs to a different branch than the lead.' using errcode = '22023'; end if;
    if v_lead.status = 'converted' then raise exception 'A converted lead cannot be reassigned.' using errcode = '22023'; end if;
    if v_lead.assigned_to is distinct from p_new_owner then
      update public.leads set assigned_to = p_new_owner where id = v_lead.id;
      v_n := v_n + 1;
    end if;
  end loop;
  if (select count(*) from public.leads where id = any(p_lead_ids)) <> (select count(distinct x) from unnest(p_lead_ids) x) then
    raise exception 'Lead not found or you are not authorized to act on it.' using errcode = '42501'; end if;
  perform set_config('app.assign_reason', '', true);
  return v_n;
end $$;
revoke all on function public.assign_leads(uuid[], uuid, text) from public, anon;
grant execute on function public.assign_leads(uuid[], uuid, text) to authenticated;

-- Worklist: one ordered list per employee (own leads; a manager may pass an employee of their branch).
create or replace function public.get_my_worklist(p_owner uuid default null, p_limit integer default 100, p_offset integer default 0)
returns table (
  lead_id uuid, full_name text, phone text, source text, status text, interest_level text, assigned_to uuid, owner_name text,
  last_contacted_at timestamptz, days_since_contact integer, next_action_kind text, next_action_at timestamptz,
  last_outcome text, bucket text, bucket_rank integer, reason text, branch_id uuid, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_owner_branch uuid;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  v_owner := coalesce(p_owner, v_uid);
  if v_owner <> v_uid then
    select p.branch_id into v_owner_branch from public.profiles p where p.id = v_owner;
    -- viewing someone else's worklist: the branch's manager or Super Admin only (NULL owner/branch = denied)
    if not coalesce((select public.auth_role()) = 'super_admin'
                    or ((select public.auth_role()) = 'branch_manager' and v_owner_branch = (select public.my_sales_branch())), false) then
      raise exception 'Not authorized to view this employee''s worklist.' using errcode = '42501'; end if;
  elsif (select public.my_sales_branch()) is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return query
  with base as (
    select l.*, f.due_at as f_due, f.kind as f_kind, la.outcome as l_outcome
    from public.leads l
    left join lateral (select ff.due_at, ff.kind from public.lead_followups ff where ff.lead_id = l.id and ff.status = 'pending' order by ff.due_at limit 1) f on true
    left join lateral (select a.outcome from public.lead_activities a where a.lead_id = l.id and a.kind in ('call', 'whatsapp', 'visit') order by a.occurred_at desc limit 1) la on true
    where l.assigned_to = v_owner and l.status in ('new', 'contacted', 'follow_up')
  ), ranked as (
    select b.*,
      case
        when b.f_due is not null and b.f_due < now() then 1
        when b.f_due is not null and (b.f_due at time zone 'Africa/Cairo')::date = v_today then 2
        when b.last_contacted_at is null and b.status = 'new' then 3
        when b.l_outcome = 'ready_to_join' then 4
        when b.interest_level = 'hot' then 5
        when b.l_outcome in ('no_answer', 'message_sent') then 6
        when b.f_due is null then 7
        else 8 end as rk
    from base b
  )
  select r.id, r.full_name, r.phone, r.source::text, r.status::text, r.interest_level, r.assigned_to, p.full_name,
         r.last_contacted_at,
         case when r.last_contacted_at is null then null else (v_today - (r.last_contacted_at at time zone 'Africa/Cairo')::date)::integer end,
         r.f_kind, r.f_due, r.l_outcome,
         (array['overdue', 'due_today', 'first_contact', 'ready_to_convert', 'hot', 'awaiting_response', 'no_next_action', 'scheduled'])[r.rk],
         r.rk,
         case r.rk
           when 1 then 'Overdue by ' || greatest(1, (v_today - (r.f_due at time zone 'Africa/Cairo')::date)) || ' day(s)'
           when 2 then 'Due today at ' || to_char(r.f_due at time zone 'Africa/Cairo', 'HH24:MI')
           when 3 then 'New — never contacted'
           when 4 then 'Ready to join — convert to a membership'
           when 5 then 'Hot lead'
           when 6 then 'Awaiting a reply (last contact: ' || coalesce(r.l_outcome, '—') || ')'
           when 7 then 'No next action — schedule one'
           else 'Scheduled for ' || to_char(r.f_due at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') end,
         r.branch_id, r.created_at
  from ranked r left join public.profiles p on p.id = r.assigned_to
  order by r.rk, coalesce(r.f_due, r.created_at), r.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500)) offset greatest(0, coalesce(p_offset, 0));
end $$;
revoke all on function public.get_my_worklist(uuid, integer, integer) from public, anon;
grant execute on function public.get_my_worklist(uuid, integer, integer) to authenticated;

create or replace function public.get_worklist_summary(p_owner uuid default null)
returns table (
  total_active bigint, overdue bigint, due_today bigint, new_uncontacted bigint, hot bigint, no_next_action bigint,
  contacted_recently bigint, awaiting_response bigint, ready_to_convert bigint, recently_converted bigint
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_owner uuid; v_owner_branch uuid;
  v_today date := (now() at time zone 'Africa/Cairo')::date;
begin
  if v_uid is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  v_owner := coalesce(p_owner, v_uid);
  if v_owner <> v_uid then
    select p.branch_id into v_owner_branch from public.profiles p where p.id = v_owner;
    -- viewing someone else's worklist: the branch's manager or Super Admin only (NULL owner/branch = denied)
    if not coalesce((select public.auth_role()) = 'super_admin'
                    or ((select public.auth_role()) = 'branch_manager' and v_owner_branch = (select public.my_sales_branch())), false) then
      raise exception 'Not authorized to view this employee''s worklist.' using errcode = '42501'; end if;
  elsif (select public.my_sales_branch()) is null then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
  return query
  with base as (
    select l.*, f.due_at as f_due, la.outcome as l_outcome
    from public.leads l
    left join lateral (select ff.due_at from public.lead_followups ff where ff.lead_id = l.id and ff.status = 'pending' order by ff.due_at limit 1) f on true
    left join lateral (select a.outcome from public.lead_activities a where a.lead_id = l.id and a.kind in ('call', 'whatsapp', 'visit') order by a.occurred_at desc limit 1) la on true
    where l.assigned_to = v_owner and l.status in ('new', 'contacted', 'follow_up')
  )
  select count(*),
         count(*) filter (where f_due < now()),
         count(*) filter (where f_due >= now() and (f_due at time zone 'Africa/Cairo')::date = v_today),
         count(*) filter (where last_contacted_at is null and status = 'new'),
         count(*) filter (where interest_level = 'hot'),
         count(*) filter (where f_due is null),
         count(*) filter (where last_contacted_at >= now() - interval '7 days'),
         count(*) filter (where l_outcome in ('no_answer', 'message_sent')),
         count(*) filter (where l_outcome = 'ready_to_join'),
         (select count(*) from public.leads c where c.assigned_to = v_owner and c.status = 'converted' and c.converted_at >= now() - interval '30 days')
  from base;
end $$;
revoke all on function public.get_worklist_summary(uuid) from public, anon;
grant execute on function public.get_worklist_summary(uuid) to authenticated;

-- History readers (SECURITY INVOKER: the table RLS above is the authorisation — owner, branch manager, Super Admin)
create or replace function public.get_lead_activities(p_lead_id uuid)
returns table (id uuid, kind text, outcome text, note text, next_action_kind text, next_action_at timestamptz, detail jsonb, actor_id uuid, actor_name text, occurred_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.kind, a.outcome, a.note, a.next_action_kind, a.next_action_at, a.detail, a.actor_id, a.actor_name, a.occurred_at
  from public.lead_activities a where a.lead_id = p_lead_id order by a.occurred_at desc, a.id desc;
$$;
revoke all on function public.get_lead_activities(uuid) from public, anon;
grant execute on function public.get_lead_activities(uuid) to authenticated;

create or replace function public.get_lead_assignments(p_lead_id uuid)
returns table (id uuid, from_owner uuid, to_owner uuid, from_name text, to_name text, performed_by uuid, performed_by_name text, reason text, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.from_owner, a.to_owner, a.from_name, a.to_name, a.performed_by, a.performed_by_name, a.reason, a.created_at
  from public.lead_assignments a where a.lead_id = p_lead_id order by a.created_at desc, a.id desc;
$$;
revoke all on function public.get_lead_assignments(uuid) from public, anon;
grant execute on function public.get_lead_assignments(uuid) to authenticated;

-- Workspace state of ONE lead for the lead page (SECURITY INVOKER: table RLS authorises). Kept separate from the lead detail query so the existing
-- lead pages keep working even before this migration is applied.
create or replace function public.get_lead_workspace_state(p_lead_id uuid)
returns table (interest_level text, last_contacted_at timestamptz, next_action_kind text, next_action_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select l.interest_level, l.last_contacted_at, f.kind, f.due_at
  from public.leads l
  left join lateral (select ff.kind, ff.due_at from public.lead_followups ff where ff.lead_id = l.id and ff.status = 'pending' order by ff.due_at limit 1) f on true
  where l.id = p_lead_id;
$$;
revoke all on function public.get_lead_workspace_state(uuid) from public, anon;
grant execute on function public.get_lead_workspace_state(uuid) to authenticated;
