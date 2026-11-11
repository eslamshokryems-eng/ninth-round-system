-- Regression: M-1 — leaderboard display names must be unique (normalized)
-- and must not impersonate a staff member's real name.
-- Fixed in 20261112000001_display_name_uniqueness_and_reserved_staff_names.sql.
--
-- Before the fix, challenge_display_names had only PRIMARY KEY (profile_id),
-- a length CHECK and the profile FK, so two customers could both be
-- 'Iron Fist' (reproduced in the audit, with both rows visible on
-- challenge_leaderboard), and a customer could set their name to a real
-- branch manager's full_name and have it accepted.
--
-- Every denial is verified TWICE — the refusal AND the stored rows — because
-- a raised exception alone would not prove nothing was written. The refusal
-- message must also be the GENERIC one for both the taken-name and the
-- reserved-name cases, so the caller cannot tell them apart.
--
-- Fresh profiles …0000a5/a6 and …0000b1-b6 are added here rather than in
-- 10_seed.sql, so no existing fixture is disturbed.
\set ON_ERROR_STOP off

\echo '=== fixture: six extra customers for the claim and concurrency tests ==='
insert into profiles (id, full_name, role, branch_id, date_of_birth, is_active) values
  ('00000000-0000-0000-0000-0000000000a5', 'Eve Customer',  'member', null, '1996-02-02', true),
  ('00000000-0000-0000-0000-0000000000a6', 'Finn Customer', 'member', null, '1997-03-03', true),
  ('00000000-0000-0000-0000-0000000000b1', 'Race One',      'member', null, '1990-01-01', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Race Two',      'member', null, '1990-01-02', true),
  ('00000000-0000-0000-0000-0000000000b3', 'Race Three',    'member', null, '1990-01-03', true),
  ('00000000-0000-0000-0000-0000000000b4', 'Race Four',     'member', null, '1990-01-04', true),
  ('00000000-0000-0000-0000-0000000000b5', 'Race Five',     'member', null, '1990-01-05', true),
  ('00000000-0000-0000-0000-0000000000b6', 'Race Six',      'member', null, '1990-01-06', true)
on conflict (id) do nothing;

select count(*) as names_at_start from challenge_display_names \gset
\echo 'CONFIRM: (fixture) display names at start=' :names_at_start

\echo '=== the normalized unique index must actually exist ==='
select coalesce(
  (select indexdef from pg_indexes
   where tablename = 'challenge_display_names'
     and indexname = 'uq_challenge_display_names_normalized'),
  '** MISSING **') as idx \gset
\echo 'CONFIRM: (index) ' :idx

-- ===========================================================================
-- (1)(2)(3)(4) uniqueness, normalized
-- ===========================================================================
\echo '=== (1) the first customer can claim an available name ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select set_challenge_display_name('Thunder Kick');
reset role;
select display_name as c1 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a5' \gset
\echo 'CONFIRM: (1) Eve''s display name=' :c1 '(expect Thunder Kick)'

\echo '=== (2) a second customer cannot claim the SAME name ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('Thunder Kick');
reset role;
select count(*) as c2 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a6' \gset
\echo 'CONFIRM: (2) rows for Finn after the exact-duplicate attempt=' :c2 '(expect 0)'

\echo '=== (3) a CASE-DIFFERING duplicate is rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('thunder kick');
select set_challenge_display_name('THUNDER KICK');
select set_challenge_display_name('ThUnDeR kIcK');
reset role;
select count(*) as c3 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a6' \gset
\echo 'CONFIRM: (3) rows for Finn after three case variants=' :c3 '(expect 0)'

\echo '=== (4) a WHITESPACE-DIFFERING duplicate is rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('   Thunder Kick');
select set_challenge_display_name('Thunder Kick   ');
select set_challenge_display_name('   Thunder Kick   ');
reset role;
select count(*) as c4 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a6' \gset
\echo 'CONFIRM: (4) rows for Finn after three whitespace variants=' :c4 '(expect 0)'

-- ===========================================================================
-- (5)(6)(7)(8)(9) reserved staff names
-- ===========================================================================
\echo '=== (5) a customer cannot claim a SUPER ADMIN''s real name ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('Sam Super');
reset role;

\echo '=== (6) a customer cannot claim a BRANCH MANAGER''s real name ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('Mona Manager (Branch B)');
reset role;

\echo '=== (7) a customer cannot claim a COACH''s real name ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('Coach One (Branch B)');
reset role;

\echo '=== (8) the staff-name check is CASE-INSENSITIVE ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('sam super');
select set_challenge_display_name('CARL MANAGER (BRANCH C)');
reset role;

\echo '=== (9) the staff-name check IGNORES SURROUNDING WHITESPACE ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('  Mona Manager (Branch B)  ');
select set_challenge_display_name('   coach three (branch c)   ');
reset role;
select count(*) as c9 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a6' \gset
\echo 'CONFIRM: (5-9) rows for Finn after nine staff-name attempts=' :c9 '(expect 0)'

\echo '=== (5-9 privacy) the refusal must be GENERIC and leak no staff detail ==='
-- Asserted in run.sh: the message is identical for taken-name and
-- reserved-name cases, and no staff id, role, email or phone appears.
select count(*) as reserved_now from challenge_display_names d
  join profiles s on s.role <> 'member' and s.id <> d.profile_id
   and lower(btrim(coalesce(s.full_name,''))) = lower(btrim(d.display_name)) \gset
\echo 'CONFIRM: (5-9) customer names impersonating staff=' :reserved_now '(expect 0)'

-- ===========================================================================
-- (10) NULL identity
-- ===========================================================================
\echo '=== (10) a caller with NO identity is denied by AUTHORIZATION, not by a constraint ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select set_challenge_display_name('Nobody At All');
reset role;
select count(*) as c10 from challenge_display_names where display_name = 'Nobody At All' \gset
\echo 'CONFIRM: (10) rows written by the NULL-identity caller=' :c10 '(expect 0)'

-- ===========================================================================
-- (11)(12) legitimate changes still work
-- ===========================================================================
\echo '=== (11) an existing customer can RETAIN their current name (exact, and re-cased) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select set_challenge_display_name('Thunder Kick');
reset role;
select display_name as c11a from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a5' \gset
\echo 'CONFIRM: (11) after re-saving the same name=' :c11a '(expect Thunder Kick)'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select set_challenge_display_name('THUNDER KICK');
reset role;
select display_name as c11b from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a5' \gset
\echo 'CONFIRM: (11) after re-casing their OWN name=' :c11b '(expect THUNDER KICK — own row, not a conflict)'

\echo '=== (12) a customer can change to a genuinely available name ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a6';
select set_challenge_display_name('Iron Hook');
reset role;
select display_name as c12 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a6' \gset
\echo 'CONFIRM: (12) Finn''s display name=' :c12 '(expect Iron Hook)'

\echo '=== (12b) POSITIVE CONTROL: a STAFF member may use their OWN real name ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One
select set_challenge_display_name('Coach One (Branch B)');
reset role;
select display_name as c12b from challenge_display_names where profile_id = '00000000-0000-0000-0000-000000000003' \gset
\echo 'CONFIRM: (12b) Coach One''s own-name claim=' :c12b '(expect Coach One (Branch B))'

-- ===========================================================================
-- (13) nothing was altered by the failed attempts
-- ===========================================================================
\echo '=== (13) the pre-existing display-name records are untouched ==='
select display_name as d_a1 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
select display_name as d_a2 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a2' \gset
select display_name as d_a3 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
select display_name as d_a4 from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
\echo 'CONFIRM: (13) originals intact=' :d_a1 '/' :d_a2 '/' :d_a3 '/' :d_a4
select case when count(*) = 0 then 'NO_DUPLICATES' else 'DUPLICATES_PRESENT' end as dupes from (
  select 1 from challenge_display_names group by lower(btrim(display_name)) having count(*) > 1
) t \gset
\echo 'CONFIRM: (13) normalized duplicates anywhere in the table=' :dupes

-- ===========================================================================
-- (14)(15)(16) leaderboard views
-- ===========================================================================
\echo '=== (14)(16) all three leaderboard views still return display names ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select count(*) as v1 from challenge_leaderboard \gset
select count(*) as v2 from challenge_season_leaderboard_overall \gset
select count(*) as v3 from challenge_season_leaderboard_by_branch \gset
select count(*) as v1n from challenge_leaderboard where display_name is not null and btrim(display_name) <> '' \gset
select case when :v1 > 0 and :v1n = :v1 then 'ALL_ROWS_NAMED' else 'NAMES_MISSING' end as v_named \gset
select case when :v1 > 0 and :v2 > 0 and :v3 > 0 then 'ALL_THREE_FUNCTIONAL' else 'VIEW_BROKEN' end as v_ok \gset
reset role;
\echo 'CONFIRM: (16) view row counts: challenge_leaderboard=' :v1 'season_overall=' :v2 'season_by_branch=' :v3
\echo 'CONFIRM: (16) all three views functional=' :v_ok
\echo 'CONFIRM: (14) every leaderboard row carries a usable display name=' :v_named '(' :v1n 'of' :v1 ')'

\echo '=== (15) the views expose NO private staff or customer fields ==='
select count(*) as leaky from information_schema.columns
 where table_schema = 'public'
   and table_name in ('challenge_leaderboard','challenge_season_leaderboard_overall','challenge_season_leaderboard_by_branch')
   and column_name in ('email','phone','date_of_birth','employee_code','role','is_active','full_name','national_id','address') \gset
\echo 'CONFIRM: (15) private columns exposed by the three views=' :leaky '(expect 0)'
\echo '=== (15b) no STAFF profile appears on a leaderboard by virtue of this change ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select count(*) as staff_rows from challenge_leaderboard l
  join profiles p on p.id = l.participant_profile_id where p.role <> 'member' \gset
reset role;
\echo 'CONFIRM: (15b) staff rows on the challenge leaderboard=' :staff_rows '(expect 0 — Coach One has a name but no approved result)'

-- ===========================================================================
-- Rankings / results / participants unchanged
-- ===========================================================================
\echo '=== rankings, results and participants are unchanged by this migration ==='
select count(*) as results_total from challenge_results \gset
select count(*) as participants_total from challenge_participants \gset
select count(*) as ledger_total from challenge_points_ledger \gset
select coalesce(sum(points_delta), 0) as points_total from challenge_points_ledger \gset
\echo 'CONFIRM: (state) results=' :results_total 'participants=' :participants_total 'ledger rows=' :ledger_total 'points sum=' :points_total
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select coalesce(string_agg(distinct overall_rank::text, ',' order by overall_rank::text), 'NONE') as ranks from challenge_leaderboard \gset
reset role;
\echo 'CONFIRM: (state) distinct overall ranks present=' :ranks
