-- Sales Release C (part 1) — Manager Dashboard: read-only team metrics and the neglected-lead lists. Requires Release B (20261124000001).
--
-- All three functions are SECURITY DEFINER (empty search_path, auth.uid() only, NULL identity refused, EXECUTE only for authenticated) and
-- authorise INSIDE: only an active branch_manager (own branch) or a Super Admin (any branch; NULL = every branch). A sales employee,
-- reception, coach, member or anonymous caller is refused. They READ only: nothing here writes, assigns or converts.
--
-- Definitions (shown on the screen next to the numbers):
--   active lead         status in (new, contacted, follow_up)
--   overdue lead        an active lead with a pending follow-up due before now (counted once per LEAD, not per follow-up)
--   no next action      an active lead without any pending follow-up
--   no recent contact   an active lead whose last contact (or, if never contacted, its creation) is more than 7 days ago
--   conversion rate     converted / (converted + lost) among leads DECIDED in the period (converted_at / lost_at in range);
--                       NULL when nothing was decided. The cohort rate (converted ÷ created in the period) is returned separately.
--   dates               Africa/Cairo calendar days
-- Not changed: leads.assigned_to / memberships.sold_by / created_by / received_by meanings, revenue, conversion (a later, separately approved step).
-- Rollback: supabase/rollback/sales_manager_dashboard_rollback.sql (no data involved).

create or replace function public.get_sales_team_overview(p_branch_id uuid default null, p_start date default null, p_end date default null)
returns table (
  employee_id uuid, employee_name text, branch_id uuid,
  active_leads bigint, overdue_leads bigint, due_today bigint, hot_leads bigint, no_next_action bigint, no_recent_contact bigint,
  new_in_period bigint, interactions_in_period bigint, converted_in_period bigint, lost_in_period bigint
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_start date; v_end date; v_role text := (select public.auth_role()); v_scope uuid;
begin
  if auth.uid() is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if v_role is distinct from 'super_admin' and v_role is distinct from 'branch_manager' then
    raise exception 'Only a branch manager or Super Admin can open the team dashboard.' using errcode = '42501'; end if;
  v_scope := case when v_role = 'super_admin' then p_branch_id else (select public.my_sales_branch()) end;
  if v_role = 'branch_manager' and (v_scope is null or (p_branch_id is not null and p_branch_id is distinct from v_scope)) then
    raise exception 'Not authorized for this branch.' using errcode = '42501'; end if;
  v_start := coalesce(p_start, date_trunc('month', v_today)::date); v_end := coalesce(p_end, v_today);
  -- one pass per source table (grouped), not one scan per employee per metric: stays flat as the team grows
  return query
  with emp as (
    select p.id, p.full_name, p.branch_id from public.profiles p
    where p.role = 'sales_employee' and p.is_active and (v_scope is null or p.branch_id = v_scope)
  ), act as (
    select l.assigned_to, l.interest_level, l.last_contacted_at, l.created_at, f.due_at as f_due from public.leads l
    left join (select ff.lead_id, min(ff.due_at) as due_at from public.lead_followups ff where ff.status = 'pending' and (v_scope is null or ff.branch_id = v_scope) group by ff.lead_id) f on f.lead_id = l.id
    where l.status in ('new', 'contacted', 'follow_up') and (v_scope is null or l.branch_id = v_scope)
  ), a as (
    select x.assigned_to as owner,
           count(*) as active_leads,
           count(*) filter (where x.f_due < now()) as overdue_leads,
           count(*) filter (where x.f_due >= now() and (x.f_due at time zone 'Africa/Cairo')::date = v_today) as due_today,
           count(*) filter (where x.interest_level = 'hot') as hot_leads,
           count(*) filter (where x.f_due is null) as no_next_action,
           count(*) filter (where coalesce(x.last_contacted_at, x.created_at) < now() - interval '7 days') as no_recent_contact
    from act x group by x.assigned_to
  ), p as (  -- period counts per owner (an owner's leads are always in the owner's branch)
    select l.assigned_to as owner,
           count(*) filter (where (l.created_at at time zone 'Africa/Cairo')::date between v_start and v_end) as new_in_period,
           count(*) filter (where l.status = 'converted' and (l.converted_at at time zone 'Africa/Cairo')::date between v_start and v_end) as converted_in_period,
           count(*) filter (where l.status = 'lost' and (l.lost_at at time zone 'Africa/Cairo')::date between v_start and v_end) as lost_in_period
    from public.leads l where l.assigned_to in (select emp.id from emp) group by l.assigned_to
  ), i as (
    select x.actor_id as owner, count(*) as interactions_in_period from public.lead_activities x
    where x.actor_id in (select emp.id from emp) and x.kind in ('call', 'whatsapp', 'visit') and (x.occurred_at at time zone 'Africa/Cairo')::date between v_start and v_end
    group by x.actor_id
  )
  select e.id, e.full_name, e.branch_id,
    coalesce(a.active_leads, 0), coalesce(a.overdue_leads, 0), coalesce(a.due_today, 0), coalesce(a.hot_leads, 0), coalesce(a.no_next_action, 0),
    coalesce(a.no_recent_contact, 0), coalesce(p.new_in_period, 0), coalesce(i.interactions_in_period, 0), coalesce(p.converted_in_period, 0), coalesce(p.lost_in_period, 0)
  from emp e left join a on a.owner = e.id left join p on p.owner = e.id left join i on i.owner = e.id
  union all
  select null::uuid, 'Unassigned (manager inbox)', v_scope,
    coalesce(u.active_leads, 0), coalesce(u.overdue_leads, 0), coalesce(u.due_today, 0), coalesce(u.hot_leads, 0), coalesce(u.no_next_action, 0), coalesce(u.no_recent_contact, 0),
    (select count(*) from public.leads l where l.assigned_to is null and (v_scope is null or l.branch_id = v_scope) and (l.created_at at time zone 'Africa/Cairo')::date between v_start and v_end),
    0::bigint, 0::bigint, 0::bigint
  from (select 1) one left join a u on u.owner is null
  order by 2;
end $$;
revoke all on function public.get_sales_team_overview(uuid, date, date) from public, anon;
grant execute on function public.get_sales_team_overview(uuid, date, date) to authenticated;

create or replace function public.get_sales_team_summary(p_branch_id uuid default null, p_start date default null, p_end date default null)
returns table (
  active_leads bigint, unassigned_leads bigint, new_in_period bigint, due_today bigint, overdue_leads bigint, hot_leads bigint,
  no_next_action bigint, no_recent_contact bigint, interactions_in_period bigint, converted_in_period bigint, lost_in_period bigint,
  conversion_rate_decided numeric, conversion_rate_cohort numeric
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_start date; v_end date; v_role text := (select public.auth_role()); v_scope uuid;
  v_conv bigint; v_lost bigint; v_new bigint; v_cohort_conv bigint;
begin
  if auth.uid() is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if v_role is distinct from 'super_admin' and v_role is distinct from 'branch_manager' then
    raise exception 'Only a branch manager or Super Admin can open the team dashboard.' using errcode = '42501'; end if;
  v_scope := case when v_role = 'super_admin' then p_branch_id else (select public.my_sales_branch()) end;
  if v_role = 'branch_manager' and (v_scope is null or (p_branch_id is not null and p_branch_id is distinct from v_scope)) then
    raise exception 'Not authorized for this branch.' using errcode = '42501'; end if;
  v_start := coalesce(p_start, date_trunc('month', v_today)::date); v_end := coalesce(p_end, v_today);
  select count(*) into v_conv from public.leads l where (v_scope is null or l.branch_id = v_scope) and l.status = 'converted' and (l.converted_at at time zone 'Africa/Cairo')::date between v_start and v_end;
  select count(*) into v_lost from public.leads l where (v_scope is null or l.branch_id = v_scope) and l.status = 'lost' and (l.lost_at at time zone 'Africa/Cairo')::date between v_start and v_end;
  select count(*), count(*) filter (where l.status = 'converted') into v_new, v_cohort_conv from public.leads l
   where (v_scope is null or l.branch_id = v_scope) and (l.created_at at time zone 'Africa/Cairo')::date between v_start and v_end;
  return query
  with act as (
    select l.*, f.due_at as f_due from public.leads l
    left join (select ff.lead_id, min(ff.due_at) as due_at from public.lead_followups ff where ff.status = 'pending' and (v_scope is null or ff.branch_id = v_scope) group by ff.lead_id) f on f.lead_id = l.id
    where l.status in ('new', 'contacted', 'follow_up') and (v_scope is null or l.branch_id = v_scope)
  )
  select count(*), count(*) filter (where a.assigned_to is null), v_new,
         count(*) filter (where a.f_due >= now() and (a.f_due at time zone 'Africa/Cairo')::date = v_today),
         count(*) filter (where a.f_due < now()), count(*) filter (where a.interest_level = 'hot'), count(*) filter (where a.f_due is null),
         count(*) filter (where coalesce(a.last_contacted_at, a.created_at) < now() - interval '7 days'),
         (select count(*) from public.lead_activities x where (v_scope is null or x.branch_id = v_scope) and x.kind in ('call', 'whatsapp', 'visit') and (x.occurred_at at time zone 'Africa/Cairo')::date between v_start and v_end),
         v_conv, v_lost,
         case when v_conv + v_lost = 0 then null else round(v_conv::numeric / (v_conv + v_lost), 4) end,
         case when v_new = 0 then null else round(v_cohort_conv::numeric / v_new, 4) end
  from act a;
end $$;
revoke all on function public.get_sales_team_summary(uuid, date, date) from public, anon;
grant execute on function public.get_sales_team_summary(uuid, date, date) to authenticated;

create or replace function public.get_attention_leads(p_kind text, p_branch_id uuid default null, p_owner uuid default null, p_limit integer default 100, p_offset integer default 0)
returns table (
  lead_id uuid, full_name text, phone text, status text, interest_level text, assigned_to uuid, owner_name text,
  last_contacted_at timestamptz, next_action_at timestamptz, days_since_contact integer, created_at timestamptz, branch_id uuid, source text
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'Africa/Cairo')::date;
  v_role text := (select public.auth_role()); v_scope uuid;
begin
  if auth.uid() is null then raise exception 'A signed-in employee is required.' using errcode = '42501'; end if;
  if v_role is distinct from 'super_admin' and v_role is distinct from 'branch_manager' then
    raise exception 'Only a branch manager or Super Admin can open the team dashboard.' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('overdue', 'no_next_action', 'no_recent_contact', 'unassigned') then
    raise exception 'Unknown list.' using errcode = '22023'; end if;
  v_scope := case when v_role = 'super_admin' then p_branch_id else (select public.my_sales_branch()) end;
  if v_role = 'branch_manager' and (v_scope is null or (p_branch_id is not null and p_branch_id is distinct from v_scope)) then
    raise exception 'Not authorized for this branch.' using errcode = '42501'; end if;
  return query
  with act as (
    select l.*, f.due_at as f_due from public.leads l
    left join (select ff.lead_id, min(ff.due_at) as due_at from public.lead_followups ff where ff.status = 'pending' and (v_scope is null or ff.branch_id = v_scope) group by ff.lead_id) f on f.lead_id = l.id
    where l.status in ('new', 'contacted', 'follow_up') and (v_scope is null or l.branch_id = v_scope)
      and (p_owner is null or l.assigned_to = p_owner)
  )
  select a.id, a.full_name, a.phone, a.status::text, a.interest_level, a.assigned_to, p.full_name, a.last_contacted_at, a.f_due,
         case when a.last_contacted_at is null then null else (v_today - (a.last_contacted_at at time zone 'Africa/Cairo')::date)::integer end,
         a.created_at, a.branch_id, a.source::text
  from act a left join public.profiles p on p.id = a.assigned_to
  where case p_kind
          when 'overdue' then a.f_due < now()
          when 'no_next_action' then a.f_due is null
          when 'no_recent_contact' then coalesce(a.last_contacted_at, a.created_at) < now() - interval '7 days'
          else a.assigned_to is null end
  order by case p_kind when 'overdue' then a.f_due end nulls last, coalesce(a.last_contacted_at, a.created_at), a.created_at
  limit greatest(1, least(coalesce(p_limit, 100), 500)) offset greatest(0, coalesce(p_offset, 0));
end $$;
revoke all on function public.get_attention_leads(text, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.get_attention_leads(text, uuid, uuid, integer, integer) to authenticated;
