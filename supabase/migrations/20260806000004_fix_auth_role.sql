-- Fix `auth_role()` to read the caller's actual role from `profiles`
-- instead of a JWT claim that never carried it.
--
-- `auth.jwt() ->> 'role'` reads the *Postgres role selector* claim GoTrue
-- puts on every access token — for any signed-in user this is always the
-- literal string "authenticated" (it exists so PostgREST knows which
-- Postgres role to run the request as), not our application's
-- member/coach/reception/branch_manager/super_admin distinction. Every
-- policy built on `auth_role()`/`is_admin()`/`is_staff()` has therefore
-- been silently unable to recognize any staff role for a real signed-in
-- user since the very first migration — undetected until now because nothing
-- had yet exercised an insert/update path gated on it (`is_branch_staff()`,
-- used by the branch-scoped read/insert policies added since, was written
-- correctly from the start — it already queries `profiles` directly rather
-- than trusting the JWT, which is why Reception Dashboard reads worked).
--
-- Fixed by querying `profiles` directly, matching `is_branch_staff()`'s
-- existing (correct) pattern.
--
-- This function must be `security definer`. `profiles` has its own RLS
-- policy ("admins manage all profiles") that calls `is_admin()`, which
-- calls this function — so a plain (invoker-rights) `select ... from
-- profiles` here would need to re-evaluate that same policy on its own
-- inner query. It looks like it should short-circuit on the unconditional
-- "read own profile" policy before ever reaching `is_admin()`, but
-- PostgreSQL inlines simple single-statement SQL functions at query
-- *rewrite* time, not lazily at execution time — so the self-reference is
-- expanded (and RLS re-applied) before any row-level short-circuiting can
-- happen, and the lookup silently returns zero rows instead of the
-- caller's role. Verified against a real (non-superuser) `authenticated`
-- role in pglite: the plain-SQL invoker-rights version above returns no
-- rows for every caller; `security definer` fixes it.
--
-- This is safe: the function only ever looks up the fixed, non-attacker-
-- controlled `auth.uid()` (never a caller-supplied id) and returns a
-- single role string, so bypassing RLS for this one internal lookup
-- cannot leak another user's data. `search_path` is pinned to prevent
-- search-path hijacking of a security-definer function, and
-- `public.profiles` is schema-qualified accordingly.
create or replace function auth_role()
returns text
language sql stable security definer
set search_path = ''
as $$
  select role::text from public.profiles where id = auth.uid();
$$;
