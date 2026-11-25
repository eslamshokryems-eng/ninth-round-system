-- 9th Round — public website "free trial" form → Sales CRM lead.
--
-- Purely additive: one new function. No table, enum, policy, trigger or
-- existing function is altered ('website' already exists in lead_source).
--
-- The leads table has no anonymous INSERT policy and must not get one, so the
-- public site cannot write to it directly. This single SECURITY DEFINER
-- function is the only door: it takes a fixed set of text fields, validates
-- and normalizes them, inserts exactly one row (source 'website', status
-- 'new', unassigned so any sales employee can claim it), and returns nothing
-- else — it never reads leads back to the caller.
--
-- Abuse limits (the form is public):
--   * same phone already submitted via the website in the last 24h → no new
--     row (idempotent, returns 'duplicate')
--   * more than 60 website leads in the last hour → 'rate_limited'
--     (global cap; per-IP limiting lives in the site's API route)

create or replace function public.submit_website_lead(
  p_full_name text,
  p_phone text,
  p_program text default null,
  p_preferred_date date default null,
  p_preferred_time time default null,
  p_notes text default null,
  p_utm jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_branch_id uuid;
  v_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_lines text[] := array['Website free-trial request'];
  v_utm text;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'invalid_name';
  end if;

  if v_phone !~ '^\+?[0-9]{8,15}$' then
    raise exception 'invalid_phone';
  end if;

  if (
    select count(*) from public.leads
    where source = 'website' and created_at > now() - interval '1 hour'
  ) >= 60 then
    raise exception 'rate_limited';
  end if;

  if exists (
    select 1 from public.leads
    where source = 'website'
      and phone = v_phone
      and created_at > now() - interval '24 hours'
  ) then
    return 'duplicate';
  end if;

  -- The gym currently runs a single branch; take the first one by id so the
  -- choice is deterministic. Revisit when a second branch exists.
  select id into v_branch_id from public.branches order by id limit 1;
  if v_branch_id is null then
    raise exception 'no_branch';
  end if;

  if nullif(btrim(coalesce(p_program, '')), '') is not null then
    v_lines := v_lines || ('Program: ' || left(btrim(p_program), 60));
  end if;
  if p_preferred_date is not null then
    v_lines := v_lines || ('Preferred date: ' || p_preferred_date::text);
  end if;
  if p_preferred_time is not null then
    v_lines := v_lines || ('Preferred time: ' || to_char(p_preferred_time, 'HH24:MI'));
  end if;
  if nullif(btrim(coalesce(p_notes, '')), '') is not null then
    v_lines := v_lines || ('Notes: ' || left(btrim(p_notes), 500));
  end if;

  -- Only the five standard utm_* keys, each capped, never arbitrary JSON.
  select string_agg(k || '=' || left(p_utm ->> k, 100), ', ')
    into v_utm
  from unnest(array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) as k
  where jsonb_typeof(p_utm) = 'object' and nullif(p_utm ->> k, '') is not null;
  if v_utm is not null then
    v_lines := v_lines || ('Attribution: ' || v_utm);
  end if;

  insert into public.leads (branch_id, full_name, phone, source, status, interest_notes)
  values (v_branch_id, v_name, v_phone, 'website', 'new', array_to_string(v_lines, E'\n'));

  return 'created';
end;
$fn$;

revoke all on function public.submit_website_lead(text, text, text, date, time, text, jsonb) from public;
grant execute on function public.submit_website_lead(text, text, text, date, time, text, jsonb) to anon, authenticated;
