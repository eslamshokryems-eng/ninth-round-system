-- ===========================================================================
-- L-3 — FORCE ROW LEVEL SECURITY: assessment, with the mechanism proved
-- rather than quoted.
--
-- The question. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` does not apply
-- to the table's OWNER: the owner reads and writes every row regardless of
-- policy. `FORCE ROW LEVEL SECURITY` is the switch that makes policies
-- apply to the owner as well. Every write path in this module is a
-- SECURITY DEFINER function, and a SECURITY DEFINER function runs as its
-- own owner — which is also the tables' owner. So the whole module's write
-- path is, structurally, "owner access after the function has done its own
-- authorization". That is worth being deliberate about.
--
-- This file does not change anything permanently. It turns FORCE on, runs
-- the real RPCs and the real client reads through it, turns FORCE back off,
-- and asserts that it is off again at the end.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------------
-- (1) The facts this decision rests on: who owns the tables, who owns the
-- functions, and what privilege attributes that role has.
-- ---------------------------------------------------------------------------
\echo '=== (1) ownership and privilege attributes ==='
select case when count(distinct pg_get_userbyid(c.relowner)) = 1
            then 'ONE_OWNER:' || min(pg_get_userbyid(c.relowner))
            else 'MIXED_OWNERS' end as confirm_table_owner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%' \gset
\echo 'CONFIRM: (1) challenges tables owner=' :confirm_table_owner

select case when count(distinct pg_get_userbyid(p.proowner)) = 1
            then 'ONE_OWNER:' || min(pg_get_userbyid(p.proowner))
            else 'MIXED_OWNERS' end as confirm_fn_owner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like '%challenge%' and p.prosecdef \gset
\echo 'CONFIRM: (1) SECURITY DEFINER challenges functions owner=' :confirm_fn_owner

select (case when rolsuper then 'SUPERUSER' else 'not-superuser' end) ||
       '/' || (case when rolbypassrls then 'BYPASSRLS' else 'no-bypassrls' end) as confirm_owner_attrs
  from pg_roles where rolname = current_user \gset
\echo 'CONFIRM: (1) owner role attributes=' :confirm_owner_attrs

-- ---------------------------------------------------------------------------
-- (2) What FORCE actually changes, demonstrated on a throwaway table whose
-- single policy matches NOTHING — so any row a reader sees is proof that
-- the reader bypassed row security rather than satisfied it.
--
-- Three owners, because the answer differs per owner and that difference
-- IS the finding:
--   l3_plain_owner  — owns it, no superuser, no BYPASSRLS
--   l3_bypass_owner — owns it, no superuser, HAS BYPASSRLS
--   current_user    — whatever this harness runs as
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== (2) what FORCE changes, by owner type ==='
drop table if exists l3_demo;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'l3_plain_owner')  then create role l3_plain_owner nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'l3_bypass_owner') then create role l3_bypass_owner nologin bypassrls; end if;
end $$;
create table l3_demo (id int primary key);
insert into l3_demo values (1), (2), (3);
alter table l3_demo enable row level security;
create policy l3_deny_all on l3_demo for all using (false);
grant select on l3_demo to l3_plain_owner, l3_bypass_owner;

alter table l3_demo owner to l3_plain_owner;
set role l3_plain_owner;  select count(*)::text as plain_off  from l3_demo \gset
reset role;
alter table l3_demo owner to l3_bypass_owner;
set role l3_bypass_owner; select count(*)::text as bypass_off from l3_demo \gset
reset role;

alter table l3_demo force row level security;
alter table l3_demo owner to l3_plain_owner;
set role l3_plain_owner;  select count(*)::text as plain_on   from l3_demo \gset
reset role;
alter table l3_demo owner to l3_bypass_owner;
set role l3_bypass_owner; select count(*)::text as bypass_on  from l3_demo \gset
reset role;

\echo 'CONFIRM: (2) plain owner  rows FORCE off/on=' :plain_off '/' :plain_on
\echo 'CONFIRM: (2) BYPASSRLS owner rows FORCE off/on=' :bypass_off '/' :bypass_on
select case
         when :plain_off = '3' and :plain_on = '0' and :bypass_off = '3' and :bypass_on = '3'
           then 'FORCE_BINDS_PLAIN_OWNER_ONLY'
         else 'UNEXPECTED'
       end as confirm_force_semantics \gset
\echo 'CONFIRM: (2) verdict=' :confirm_force_semantics

drop table l3_demo;
drop role l3_plain_owner;
drop role l3_bypass_owner;

-- ---------------------------------------------------------------------------
-- (3) FORCE turned ON for all ten challenges tables, then the REAL write
-- paths exercised through the REAL RPCs. If FORCE broke the module, these
-- would fail — a SECURITY DEFINER function has no policy that grants it
-- anything; it relies entirely on running as the owner.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== (3) the real RPCs, with FORCE RLS on every challenges table ==='
do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%'
  loop execute format('alter table public.%I force row level security', r.relname); end loop;
end $$;
select count(*)::text as forced_count from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%' and c.relforcerowsecurity \gset
\echo 'CONFIRM: (3) tables with FORCE on=' :forced_count

-- (3a) super admin creates a season   -> INSERT challenge_seasons
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select create_challenge_season('L3 Forced Season', null, current_date, current_date + 30)::text as forced_season \gset
-- (3b) super admin creates a competition -> INSERT challenges (+ eligibility rules)
select create_challenge(
  :'forced_season', 'L3 Forced Competition', null,
  'strength'::challenge_category, 'ninth_round'::program_type,
  'BRANCH'::challenge_scope, '00000000-0000-0000-0000-00000000000b',
  'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 10,
  now() - interval '1 day', now() + interval '10 days',
  now() - interval '1 day', now() + interval '30 days',
  '[{"rule_type":"min_age","value":{"age":16}}]'::jsonb, null
) as forced_challenge \gset
reset role;
update challenges set status = 'registration_open' where id = :'forced_challenge';

-- (3c) a member joins                 -> INSERT challenge_participants
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select participant_id::text as forced_participant, status::text as forced_join
  from request_challenge_participation(:'forced_challenge', '00000000-0000-0000-0000-00000000000b') \gset
reset role;
\echo 'CONFIRM: (3c) member joined under FORCE with status=' :forced_join

-- (3d) a manager designates a coach   -> UPDATE challenge_participants
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'forced_participant', '00000000-0000-0000-0000-000000000003', 'L3 probe');
reset role;
select case when designated_coach_id = '00000000-0000-0000-0000-000000000003' then 'DESIGNATED' else 'NOT_DESIGNATED' end as confirm_desig
  from challenge_participants where id = :'forced_participant' \gset
\echo 'CONFIRM: (3d) coach designation under FORCE=' :confirm_desig

-- (3e) the coach submits a result     -> INSERT challenge_results
update challenges set status = 'active' where id = :'forced_challenge';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select submit_challenge_result(:'forced_challenge', '00000000-0000-0000-0000-0000000000a1', 77, 'reps', now())::text as forced_result \gset
reset role;
\echo 'CONFIRM: (3e) result submitted under FORCE=' :forced_result

-- (3f) the manager approves it -> UPDATE challenge_results + INSERT
--      challenge_result_reviews + INSERT challenge_points_ledger
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select approve_challenge_result(:'forced_result', 'L3 probe');
reset role;
select status::text as confirm_approved from challenge_results where id = :'forced_result' \gset
\echo 'CONFIRM: (3f) approval under FORCE left status=' :confirm_approved
select case when count(*) > 0 then 'LEDGER_WRITTEN' else 'LEDGER_EMPTY' end as confirm_ledger
  from challenge_points_ledger where challenge_id = :'forced_challenge' \gset
\echo 'CONFIRM: (3f) points ledger under FORCE=' :confirm_ledger

-- (3g) a member sets a display name   -> INSERT/UPDATE challenge_display_names
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b6';
select set_challenge_display_name('L3 Forced Name');
reset role;
select case when count(*) = 1 then 'NAME_SAVED' else 'NAME_MISSING' end as confirm_name
  from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000b6' \gset
\echo 'CONFIRM: (3g) display name under FORCE=' :confirm_name

-- ---------------------------------------------------------------------------
-- (4) And FORCE changes nothing for a CLIENT, because a client was never
-- the owner — row security already applied to it in full.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== (4) a client read is identical with FORCE on ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';  -- Casey, unrelated customer
select count(*)::text as casey_own from challenge_participants where participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as casey_others
  from challenge_participants where participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' \gset
select case when count(*) > 0 then 'VISIBLE' else 'EMPTY' end as casey_board from challenge_leaderboard \gset
reset role;
\echo 'CONFIRM: (4) FORCE on — Casey own-rows/others-rows/leaderboard=' :casey_own '/' :casey_others '/' :casey_board

-- ---------------------------------------------------------------------------
-- (5) Restore, and prove it.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== (5) restore ==='
do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%'
  loop execute format('alter table public.%I no force row level security', r.relname); end loop;
end $$;
select case when count(*) = 0 then 'ALL_RESTORED' else 'STILL_FORCED(' || count(*) || ')' end as confirm_restored
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%' and c.relforcerowsecurity \gset
\echo 'CONFIRM: (5) FORCE flags after restore=' :confirm_restored

-- Same client read again, FORCE off, to show the two are identical.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select count(*)::text as casey_own_off from challenge_participants where participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as casey_others_off
  from challenge_participants where participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' \gset
select case when count(*) > 0 then 'VISIBLE' else 'EMPTY' end as casey_board_off from challenge_leaderboard \gset
reset role;
\echo 'CONFIRM: (5) FORCE off — Casey own-rows/others-rows/leaderboard=' :casey_own_off '/' :casey_others_off '/' :casey_board_off
select case when :'casey_own' = :'casey_own_off' and :'casey_others' = :'casey_others_off' and :'casey_board' = :'casey_board_off'
            then 'CLIENT_READS_IDENTICAL' else 'CLIENT_READS_DIFFER' end as confirm_client_identical \gset
\echo 'CONFIRM: (5) verdict=' :confirm_client_identical

-- ---------------------------------------------------------------------------
-- (6) The assessment.
--
-- FORCE ROW LEVEL SECURITY is NOT adopted for the challenges tables, and
-- this is a decision rather than an omission:
--
--   * It does nothing here. (2) shows FORCE only binds an owner that has
--     neither SUPERUSER nor BYPASSRLS. The role that owns these tables —
--     and therefore the role every SECURITY DEFINER RPC runs as — has one
--     of those attributes both in this harness and on a Supabase project,
--     where the migration owner is `postgres` and carries BYPASSRLS. For
--     such an owner FORCE is a no-op, which (3) confirms directly: all
--     seven write paths still work with FORCE on.
--   * It does nothing for clients either. A client is `anon` or
--     `authenticated`, never the owner, so row security already applies to
--     it without reservation. (4) and (5) show byte-identical client reads
--     with FORCE on and off.
--   * It is not free. If the owner role ever LOST BYPASSRLS — a plausible
--     outcome of a self-hosted deployment, a restore under a different
--     role, or a hardening pass on the database role itself — FORCE would
--     take effect, and then every SECURITY DEFINER RPC would be subject to
--     policies written for CLIENTS. There is no policy that grants an RPC
--     what it needs (for instance nothing lets anyone INSERT into
--     challenge_points_ledger, because only recompute_challenge_points is
--     ever supposed to), so the module would not fail safe — it would fail
--     shut, mid-transaction, on paths that cannot be fixed without
--     inventing owner-shaped policies that would themselves widen access.
--
-- What protects these tables is therefore NOT the owner's RLS exemption
-- being revoked. It is that there is no way to reach the owner's exemption
-- except through a SECURITY DEFINER function, each of which does its own
-- fail-closed authorization first (20261107000001 onward), and that
-- clients hold no table privileges beyond what RLS then filters.
--
-- The one thing worth adding is a guard against the exemption being
-- reachable by accident, which is a different and cheaper control than
-- FORCE: assert that no challenges table is owned by a role a client could
-- ever act as. That is asserted below, and it is the part of L-3 that this
-- file turns into a standing test.
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== (6) standing assertion: no client role can act as the tables owner ==='
select case
         when count(*) = 0 then 'NO_CLIENT_OWNS_OR_INHERITS'
         else 'CLIENT_CAN_ACT_AS_OWNER(' || string_agg(distinct cr.rolname, ',') || ')'
       end as confirm_owner_isolation
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles cr on cr.rolname in ('anon', 'authenticated')
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%'
   and pg_has_role(cr.oid, c.relowner, 'USAGE') \gset
\echo 'CONFIRM: (6) owner isolation=' :confirm_owner_isolation
