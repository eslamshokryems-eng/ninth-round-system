-- ---------------------------------------------------------------------------
-- Security fix M-1: leaderboard display-name impersonation and uniqueness.
--
-- FINDING (confirmed by execution during the final Challenges audit).
-- challenge_display_names carried only PRIMARY KEY (profile_id), a 2-30
-- character length CHECK and the profile FK — no uniqueness on the name
-- itself and no reserved-name rule. display_name is the ONLY human-readable
-- identifier the three leaderboard views expose, so two things followed:
--
--   1. Two customers could hold the same name. Reproduced: profiles …0000a1
--      and …0000a2 both set 'Iron Fist', and challenge_leaderboard then
--      listed two separate 'Iron Fist' rows across two competitions.
--   2. A customer could adopt a STAFF member's real name. Reproduced: a
--      customer called set_challenge_display_name('Mona Manager') — the
--      full_name of an actual branch manager — and it was accepted.
--
-- ===========================================================================
-- Rule A — uniqueness, normalized
-- ===========================================================================
-- A unique index on lower(btrim(display_name)) makes 'Iron Fist',
-- 'iron fist' and '  Iron Fist  ' one and the same claim. Both functions are
-- IMMUTABLE, so the expression is indexable.
--
-- The index is the authority, not the function check: a pre-flight `exists`
-- test alone loses a race between two concurrent claimants (both read, both
-- see nothing, both insert). The function therefore does BOTH — the check,
-- for a clean message in the ordinary case, and a unique_violation handler
-- for the concurrent case, so the loser gets the same safe validation error
-- instead of a raw 23505 reaching the client. See the EXCEPTION block below.
--
-- ===========================================================================
-- Rule B — reserved staff names
-- ===========================================================================
-- "Staff" is `profiles.role <> 'member'`. That is this codebase's own
-- authoritative test for a staff account, not an inference and not a name
-- list:
--
--     20260812000001_employee_login.sql:27          where role != 'member'
--     20260816000001_plain_numeric_employee_ids.sql:22
--                                                   where role != 'member' ...
--     20260821000002_delete_staff_account.sql:41    if v_target_role = 'member'
--                                                   then raise '... not a staff account.'
--
-- so every present and future staff role (coach, nutritionist, reception,
-- branch_manager, super_admin, sales_employee, and anything added to the
-- user_role enum later) is covered automatically, with no list to maintain.
-- A staff member's "real display name" is profiles.full_name.
--
-- This rule CANNOT be an index or a CHECK constraint. A CHECK may not
-- subquery another table, and a unique index cannot span
-- challenge_display_names and profiles. Enforcing it needs a row-level read
-- of profiles at write time, so it lives in the SECURITY DEFINER function —
-- which is also what keeps it private: the customer never reads profiles,
-- they only receive a generic refusal. (A trigger would be the alternative
-- if direct table writes were reachable; they are not — the table has no
-- INSERT/UPDATE policy at all, so every write arrives through this one
-- function.)
--
-- A staff member whose display name equals their OWN full_name is excluded
-- (`s.id <> v_actor`): that is not impersonation, and refusing it would stop
-- a coach from competing under their own name.
--
-- ===========================================================================
-- Privacy
-- ===========================================================================
-- Both refusals return exactly one message —
-- 'This display name is unavailable. Please choose another name.' — so the
-- caller cannot tell a name taken by another customer from one reserved to
-- staff, and learns nothing about who holds it. No staff row, id, email,
-- phone or any other profile column is returned on any path. The leaderboard
-- views are NOT touched by this migration: they already select only
-- display_name, result/points values and ranks.
--
-- ===========================================================================
-- Existing data
-- ===========================================================================
-- Checked before this migration was written, with
-- supabase/tests/challenges_phase2/100_display_name_conflict_report.sql
-- (read-only): 0 normalized duplicate groups, 0 reserved-name collisions,
-- verdict SAFE_TO_APPLY. Nothing is renamed, deleted or rewritten here — no
-- DML of any kind. Run that report against an environment before applying
-- this migration there; CREATE UNIQUE INDEX will fail outright rather than
-- damage anything if duplicates exist.
--
-- ===========================================================================
-- Preserved
-- ===========================================================================
-- Signature and parameter name (p_display_name text), SECURITY DEFINER,
-- SET search_path = '', fully qualified references, the 2-30 length rule,
-- the on-conflict upsert on profile_id (so a customer can still re-save or
-- change their own name), and the existing grants — CREATE OR REPLACE, never
-- DROP, so `revoke … from public; grant … to authenticated`
-- (20261106000001:1156-1157) survives. Additive only; no historical
-- migration is edited, renamed or reordered. Scope is this one function plus
-- the new index.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Rule A: the normalized unique index — the real guarantee.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_challenge_display_names_normalized
  on public.challenge_display_names (lower(btrim(display_name)));

comment on index public.uq_challenge_display_names_normalized is
  'One claim per leaderboard name, compared case-insensitively and ignoring surrounding whitespace. This index, not the application check, is what makes concurrent duplicate claims impossible.';

-- ---------------------------------------------------------------------------
-- Rules A + B + fail-closed identity, enforced server-side.
-- ---------------------------------------------------------------------------
create or replace function set_challenge_display_name(p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name  text := btrim(coalesce(p_display_name, ''));
  v_norm  text := lower(btrim(coalesce(p_display_name, '')));
begin
  -- Fail closed on no identity. Previously this function had no
  -- authorization check at all: a caller with auth.uid() = NULL fell through
  -- to the insert and was stopped only by challenge_display_names.profile_id
  -- being NOT NULL — a schema constraint, not an authorization decision,
  -- which surfaced as a constraint-violation error rather than a refusal.
  if v_actor is null then
    raise exception 'Not authorized to set a display name.';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 30 then
    raise exception 'A display name must be between 2 and 30 characters.';
  end if;

  -- Rule B: reserved to staff. Normalized on both sides. Excludes the actor
  -- themselves, so a staff member may use their own real name.
  if exists (
    select 1
    from public.profiles s
    where s.role <> 'member'
      and s.id <> v_actor
      and lower(btrim(coalesce(s.full_name, ''))) = v_norm
  ) then
    raise exception 'This display name is unavailable. Please choose another name.';
  end if;

  -- Rule A: already claimed by someone else. The actor's own row is excluded
  -- so re-saving or re-casing one's own name still works.
  if exists (
    select 1
    from public.challenge_display_names d
    where d.profile_id <> v_actor
      and lower(btrim(d.display_name)) = v_norm
  ) then
    raise exception 'This display name is unavailable. Please choose another name.';
  end if;

  insert into public.challenge_display_names (profile_id, display_name)
  values (v_actor, v_name)
  on conflict (profile_id) do update set display_name = excluded.display_name;

exception
  -- Concurrency: two sessions can both pass the `exists` check above before
  -- either inserts. uq_challenge_display_names_normalized then rejects the
  -- second, and this handler converts that 23505 into the same safe
  -- validation error the sequential path returns, so a client never sees a
  -- raw database exception. Only unique_violation is caught — the
  -- raise_exception (P0001) refusals above pass straight through.
  when unique_violation then
    raise exception 'This display name is unavailable. Please choose another name.';
end;
$$;

comment on function public.set_challenge_display_name(text) is
  'Claims or changes the caller''s own leaderboard display name. Requires an authenticated identity (fails closed when auth.uid() is NULL). Names are 2-30 characters, unique across the leaderboard under lower(btrim(...)), and may not match the real full_name of any staff profile (role <> ''member'') other than the caller''s own. Both the taken-name and reserved-name cases return one identical generic message, so no information about other accounts leaks.';
