-- READ-ONLY pre-flight conflict report for M-1
-- (20261112000001_display_name_uniqueness_and_reserved_staff_names.sql).
--
-- This file NEVER writes. It exists to answer, before the normalized unique
-- index is created, the only question that can make that index unsafe:
-- does the existing data already contain conflicts?
--
-- Two classes of conflict:
--   A. Normalized duplicates — two or more profiles whose display names
--      collide under lower(btrim(...)). A unique index cannot be created
--      while any exist; CREATE UNIQUE INDEX would fail outright.
--   B. Reserved-name collisions — a customer whose display name matches the
--      real full_name of a STAFF profile (role <> 'member'). These do NOT
--      block the index (the index only constrains display names against each
--      other), but they are live impersonations and need a product decision,
--      so they are reported separately rather than silently tolerated.
--
-- Run this against any environment BEFORE applying the migration there:
--
--   psql -d <database> -f 100_display_name_conflict_report.sql
--
-- A clean report prints ZERO for both classes. Anything else must be
-- resolved, or the resolution approved, before the migration is applied —
-- this script proposes nothing and changes nothing.
\pset pager off

\echo '==================== A. NORMALIZED DUPLICATE DISPLAY NAMES ===================='
\echo '(these BLOCK the unique index)'
select
  lower(btrim(d.display_name)) as normalized_name,
  count(*)                     as colliding_profiles,
  string_agg(d.display_name, ' | ' order by d.created_at) as as_entered,
  string_agg(d.profile_id::text, ', ' order by d.created_at) as profile_ids
from public.challenge_display_names d
group by lower(btrim(d.display_name))
having count(*) > 1
order by count(*) desc, normalized_name;

select count(*) as blocking_duplicate_groups from (
  select 1 from public.challenge_display_names
  group by lower(btrim(display_name)) having count(*) > 1
) t \gset
select coalesce(sum(c), 0) as blocking_duplicate_rows from (
  select count(*) as c from public.challenge_display_names
  group by lower(btrim(display_name)) having count(*) > 1
) t \gset
\echo 'REPORT: duplicate groups=' :blocking_duplicate_groups 'affected rows=' :blocking_duplicate_rows

\echo
\echo '==================== B. CUSTOMER NAMES RESERVED TO STAFF ===================='
\echo '(these do NOT block the index, but are live impersonations)'
-- Staff is role <> ''member'', which is how this codebase itself identifies a
-- staff account (20260812000001_employee_login.sql:27,
-- 20260816000001_plain_numeric_employee_ids.sql:22, and
-- 20260821000002_delete_staff_account.sql:41 all use exactly that test).
-- A staff member holding a display name equal to their OWN full_name is not
-- an impersonation and is excluded.
select
  d.profile_id          as customer_profile_id,
  d.display_name        as customer_display_name,
  s.role               as impersonated_role
from public.challenge_display_names d
join public.profiles s
  on s.role <> 'member'
 and lower(btrim(coalesce(s.full_name, ''))) = lower(btrim(d.display_name))
 and s.id <> d.profile_id
order by s.role, d.display_name;

select count(*) as reserved_collisions from public.challenge_display_names d
join public.profiles s
  on s.role <> 'member'
 and lower(btrim(coalesce(s.full_name, ''))) = lower(btrim(d.display_name))
 and s.id <> d.profile_id \gset
\echo 'REPORT: reserved-name collisions=' :reserved_collisions

\echo
\echo '==================== SUMMARY ===================='
select count(*) as total_display_names from public.challenge_display_names \gset
\echo 'REPORT: total display names=' :total_display_names
select case
         when :blocking_duplicate_groups = 0 and :reserved_collisions = 0 then 'SAFE_TO_APPLY'
         when :blocking_duplicate_groups > 0 then 'BLOCKED_BY_DUPLICATES'
         else 'INDEX_SAFE_BUT_IMPERSONATIONS_PRESENT'
       end as verdict \gset
\echo 'REPORT: verdict=' :verdict
