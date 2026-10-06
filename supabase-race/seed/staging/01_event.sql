-- STAGING SEED 01 — the first staging event. Idempotent: creates it only if the slug does not exist.
-- Variables: actor_email, event_slug, event_name, event_date, event_timezone, event_planned_start ('' = none), event_venue, event_fee (0 = free), target_env.
-- The event is created through the REAL RPC as the Super Admin (so it is audited and the actor becomes its Event Manager); fee/venue are descriptive columns set as the owner.
\set ON_ERROR_STOP on
\set QUIET on
begin;
select set_config('request.jwt.claim.sub', (select id::text from race_profiles where lower(email) = lower(:'actor_email') and is_super_admin and is_active), true) as sub \gset
\if :{?sub} \else \echo 'FAIL: the actor is not an active Super Admin' \quit \endif
select set_config('seed.target_env', :'target_env', true), set_config('seed.event_slug', :'event_slug', true), set_config('seed.event_date', :'event_date', true), set_config('seed.event_name', :'event_name', true), set_config('seed.event_timezone', :'event_timezone', true), set_config('seed.event_planned_start', :'event_planned_start', true) as _cfg \gset
do $$ begin
  if current_setting('seed.target_env') <> 'staging' or current_setting('seed.event_slug') !~ '-(staging|dryrun)$' then raise exception 'SEED FAIL: staging only, slug must end in -staging or -dryrun'; end if;
end $$;

set local role authenticated;
do $$
declare v_id uuid; v_status public.race_event_status;
begin
  select id, status into v_id, v_status from public.race_events where slug = current_setting('seed.event_slug');
  if v_id is null then
    v_id := public.race_create_event(current_setting('seed.event_slug'), current_setting('seed.event_date')::date, current_setting('seed.event_name'), current_setting('seed.event_timezone'), nullif(current_setting('seed.event_planned_start'), '')::timestamptz);
    raise notice 'event %: created (id %)', current_setting('seed.event_slug'), v_id;
    v_status := 'DRAFT';
  else
    raise notice 'event %: already exists (status %) — left as is', current_setting('seed.event_slug'), v_status;
  end if;
  if v_status = 'DRAFT' then
    perform public.race_set_event_status(v_id, 'REGISTRATION_OPEN', 'staging seed: open registration for the rehearsal');
    raise notice 'event %: registration opened', current_setting('seed.event_slug');
  end if;
end $$;
reset role;

-- descriptive columns (owner): only when they differ, so a re-run touches nothing
update public.race_events
   set venue = nullif(:'event_venue', ''), registration_fee = nullif(:'event_fee', '')::numeric
 where slug = :'event_slug'
   and (venue is distinct from nullif(:'event_venue', '') or registration_fee is distinct from nullif(:'event_fee', '')::numeric);
commit;
select slug, status, event_date, venue, registration_fee from public.race_events where slug = :'event_slug';
