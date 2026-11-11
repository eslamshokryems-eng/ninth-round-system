-- Regression: H-2 — on a GLOBAL-scope competition, only a branch manager
-- or a super admin may approve or reject a result or a correction.
-- Fixed in 20261110000001_global_review_requires_manager_or_admin.sql.
--
-- Before the fix all four review RPCs shared the predicate
--   role in ('coach','branch_manager','super_admin')
--   and (scope = 'GLOBAL' or is_branch_staff(participant.branch_id))
-- whose second conjunct short-circuits to TRUE on GLOBAL scope, leaving
-- "any active staff anywhere" — so any coach in the company could approve
-- or reject any athlete's GLOBAL result, with no branch, competition or
-- athlete relationship. Demonstrated in the audit by removing an athlete
-- from the standings outright.
--
-- Every denial below is checked TWICE: the refusal itself, and the row
-- state afterwards (status unchanged AND no challenge_result_reviews row
-- written), because a raised exception alone would not prove that the
-- preceding `update`/`insert` had not already run.
--
-- BRANCH and MULTI_BRANCH review must be entirely unaffected; the second
-- half of this file pins that, including the case the fix could most
-- easily have broken: an in-branch COACH reviewing a BRANCH result.
--
-- All accounts are restored before the file ends.
\set ON_ERROR_STOP off

select id as gch from challenges where scope = 'GLOBAL' order by created_at desc limit 1 \gset
select id as bch from challenges where title = 'Active Coach Guard Challenge' order by created_at desc limit 1 \gset
select id as pch from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
select id as mch from challenges where scope = 'MULTI_BRANCH' order by created_at desc limit 1 \gset

-- ---------------------------------------------------------------------------
-- Self-contained GLOBAL fixture, built through the real RPCs.
--
-- Deliberately NOT reusing whatever GLOBAL rows 80/81/95/96/97/98 happen to
-- leave behind: the 81/82 concurrency race is driven by run.sh rather than a
-- .sql file, and it APPROVES the one GLOBAL result 80 creates, so any
-- "find a pending GLOBAL result" lookup here is at the mercy of upstream
-- ordering. Alex (a1) is the one customer never registered for the GLOBAL
-- competition, so registering her now gives this file a target it owns, with
-- a known author.
-- ---------------------------------------------------------------------------
update challenges set status = 'registration_open' where id = :'gch';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1'; -- Alex, display name set in 45
select participant_profile_id, branch_id, status from request_challenge_participation(:'gch', null) \gset reg_
reset role;
update challenges set status = 'active' where id = :'gch';
\echo 'CONFIRM: (fixture) Alex registered for GLOBAL, branch=' :reg_branch_id 'status=' :reg_status '(expect empty branch, approved)'

select id as g_participant from challenge_participants
  where challenge_id = :'gch' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- super_admin: branchless participant
select designate_challenge_coach(:'g_participant', '00000000-0000-0000-0000-000000000004', 'Coach Two for the H-2 fixture.');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Coach Two submits, so Coach Two is the AUTHOR
select * from submit_challenge_result(:'gch', '00000000-0000-0000-0000-0000000000a1', 81, 'reps', now()) \gset g_
reset role;
select status as g_r1_status from challenge_results where id = :'g_result_id' \gset
\echo 'CONFIRM: (fixture) GLOBAL result=' :g_result_id 'status=' :g_r1_status 'author=Coach Two (...000004)'

-- BRANCH targets (left by 97 and 50/60; these are not affected by the race).
select id as b_pending from challenge_results
  where challenge_id = :'bch' and status = 'pending' limit 1 \gset
select id as p_corr from challenge_results
  where challenge_id = :'pch' and status = 'correction_pending' limit 1 \gset

select count(*) as reviews_before from challenge_result_reviews \gset
\echo 'CONFIRM: (fixture) BRANCH pending=' :b_pending '| BRANCH correction=' :p_corr '| review rows before=' :reviews_before

-- ===========================================================================
-- GLOBAL SCOPE — every coach path must be DENIED
-- ===========================================================================
\echo '=== (1) GLOBAL: an active coach who is NOT the author approves -> must be DENIED by the role rule ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, active, Branch B, not the author
select approve_challenge_result(:'g_result_id', 'Coach approving a GLOBAL result.');
reset role;

\echo '=== (2) GLOBAL: that same coach REJECTS -> must be DENIED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select reject_challenge_result(:'g_result_id', 'Coach rejecting a GLOBAL result.');
reset role;

\echo '=== (3) GLOBAL: an UNRELATED coach from another branch approves, then rejects -> both DENIED ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Coach Three, active, Branch C, no relationship
select approve_challenge_result(:'g_result_id', 'Unrelated Branch C coach approving.');
select reject_challenge_result(:'g_result_id', 'Unrelated Branch C coach rejecting — the audit sabotage case.');
reset role;
select status as c1 from challenge_results where id = :'g_result_id' \gset
\echo 'CONFIRM: (1-3) GLOBAL result status after four coach attempts=' :c1 '(expect pending)'

\echo '=== (5) GLOBAL: a CUSTOMER and ANON are denied ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select approve_challenge_result(:'g_result_id', 'Customer approving.');
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select approve_challenge_result(:'g_result_id', 'Anon approving.');
reset role;

\echo '=== (7) GLOBAL: a DEACTIVATED branch manager is denied (approve and reject) ==='
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000002';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select approve_challenge_result(:'g_result_id', 'Deactivated manager approving.');
select reject_challenge_result(:'g_result_id', 'Deactivated manager rejecting.');
reset role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000002';

\echo '=== (8) GLOBAL: a DEACTIVATED super admin is denied (approve and reject) ==='
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select approve_challenge_result(:'g_result_id', 'Deactivated super admin approving.');
select reject_challenge_result(:'g_result_id', 'Deactivated super admin rejecting.');
reset role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000001';

\echo '=== (9) GLOBAL: the self-review prohibition still fires for the AUTHOR ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Coach Two, the author
select approve_challenge_result(:'g_result_id', 'Author approving their own GLOBAL result.');
reset role;

\echo '=== (10) INTEGRITY: nothing was mutated by ANY of the denied attempts ==='
select status as c3 from challenge_results where id = :'g_result_id' \gset
select case when count(*) = :reviews_before then 'UNCHANGED' else 'MUTATED' end as reviews_verdict,
       count(*) as reviews_after_denials
  from challenge_result_reviews \gset
\echo 'CONFIRM: (10) GLOBAL result status after every denial=' :c3 '(expect pending)'
\echo 'CONFIRM: (10) review rows after all denials=' :reviews_verdict '(before=' :reviews_before 'after=' :reviews_after_denials ')'

-- ===========================================================================
-- GLOBAL SCOPE — the two permitted roles must still work
-- ===========================================================================
\echo '=== (5b) GLOBAL: an ACTIVE BRANCH MANAGER can approve a result ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, active branch_manager, not the author
select approve_challenge_result(:'g_result_id', 'Branch manager approving a GLOBAL result.');
reset role;
select status as c5 from challenge_results where id = :'g_result_id' \gset
\echo 'CONFIRM: (5b) GLOBAL result status after the branch manager approved=' :c5 '(expect approved)'

\echo '=== (4) GLOBAL CORRECTION: coaches cannot approve or reject one ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Coach Two, the designated coach, requests it
select * from request_challenge_result_correction(:'g_result_id', 91, 'reps', now()) \gset gc1_
reset role;
\echo 'CONFIRM: (4 setup) GLOBAL correction=' :gc1_result_id

\echo '--- (4a) its OWN author (a coach) -> the self-review ban fires FIRST, proving its ordering is preserved ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select approve_challenge_result_correction(:'gc1_result_id', 'Author approving their own GLOBAL correction.');
reset role;
\echo '--- (4b) a DIFFERENT active coach (not the author) -> denied by the new role rule ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One
select approve_challenge_result_correction(:'gc1_result_id', 'Another coach approving a GLOBAL correction.');
reset role;
\echo '--- (4c) an unrelated Branch C coach rejecting the GLOBAL correction ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Coach Three
select reject_challenge_result_correction(:'gc1_result_id', 'Unrelated coach rejecting a GLOBAL correction.');
reset role;
select status as c2 from challenge_results where id = :'gc1_result_id' \gset
\echo 'CONFIRM: (4) GLOBAL correction status after three coach attempts=' :c2 '(expect correction_pending)'

\echo '=== (6) GLOBAL: an ACTIVE SUPER ADMIN can reject a correction ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- Sam, active super_admin, not the author
select reject_challenge_result_correction(:'gc1_result_id', 'Super admin rejecting a GLOBAL correction.');
reset role;
select status as c6 from challenge_results where id = :'gc1_result_id' \gset
\echo 'CONFIRM: (6) GLOBAL correction status after the super admin rejected=' :c6 '(expect rejected)'

\echo '=== (6b) GLOBAL: an ACTIVE BRANCH MANAGER can approve a CORRECTION ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- a fresh correction (the previous one was rejected)
select * from request_challenge_result_correction(:'g_result_id', 92, 'reps', now()) \gset gc2_
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona approves it
select approve_challenge_result_correction(:'gc2_result_id', 'Branch manager approving a GLOBAL correction.');
reset role;
select status as c7 from challenge_results where id = :'gc2_result_id' \gset
select superseded_by_result_id as c7s from challenge_results where id = :'g_result_id' \gset
\echo 'CONFIRM: (6b) GLOBAL correction status after the branch manager approved=' :c7 '(expect approved) original superseded_by=' :c7s

-- ===========================================================================
-- BRANCH SCOPE REGRESSION — must be completely unchanged
-- ===========================================================================
\echo '=== (12) BRANCH: wrong-branch restrictions remain effective ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- Carl, branch_manager of Branch C
select approve_challenge_result(:'b_pending', 'Branch C manager on a Branch B result.');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Coach Three, Branch C
select approve_challenge_result(:'b_pending', 'Branch C coach on a Branch B result.');
reset role;
select status as c8 from challenge_results where id = :'b_pending' \gset
\echo 'CONFIRM: (12) BRANCH result status after two wrong-branch attempts=' :c8 '(expect pending)'

\echo '=== (11) BRANCH: an IN-BRANCH COACH can STILL approve a result — the behaviour this fix must not break ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Coach Two, active, Branch B, NOT the author
select approve_challenge_result(:'b_pending', 'In-branch coach approving a BRANCH result.');
reset role;
select status as c9 from challenge_results where id = :'b_pending' \gset
\echo 'CONFIRM: (11) BRANCH result status after the IN-BRANCH COACH approved=' :c9 '(expect approved)'

\echo '=== (11b) BRANCH: an IN-BRANCH COACH can STILL review a CORRECTION ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Branch C coach first: must be denied
select approve_challenge_result_correction(:'p_corr', 'Branch C coach on a Branch B correction.');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, Branch B, not the author
select approve_challenge_result_correction(:'p_corr', 'In-branch coach approving a BRANCH correction.');
reset role;
select status as c10 from challenge_results where id = :'p_corr' \gset
\echo 'CONFIRM: (11b) BRANCH correction status after denial-then-in-branch-coach=' :c10 '(expect approved)'

-- ===========================================================================
-- MULTI_BRANCH SCOPE REGRESSION — must be completely unchanged
-- ===========================================================================
\echo '=== (13) MULTI_BRANCH: build a reviewable result for a Branch C participant ==='
select id as m_participant from challenge_participants where challenge_id = :'mch' limit 1 \gset
select branch_id as m_branch from challenge_participants where id = :'m_participant' \gset
\echo 'CONFIRM: (13 setup) MULTI participant branch=' :m_branch '(Branch C = ...00000c)'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- Carl, branch_manager of Branch C
select designate_challenge_coach(:'m_participant', '00000000-0000-0000-0000-00000000000d', 'Branch C coach for a Branch C participant.');
reset role;
update challenges set status = 'active' where id = :'mch';
select participant_profile_id as m_athlete from challenge_participants where id = :'m_participant' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d'; -- Coach Three submits
select * from submit_challenge_result(:'mch', :'m_athlete', 64, 'reps', now()) \gset m_
reset role;
\echo 'CONFIRM: (13 setup) MULTI pending result=' :m_result_id

\echo '--- (13a) a branch manager from the WRONG branch is denied ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, Branch B
select approve_challenge_result(:'m_result_id', 'Branch B manager on a Branch C multi participant.');
reset role;
\echo '--- (13b) a coach from the WRONG branch is denied ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, Branch B
select approve_challenge_result(:'m_result_id', 'Branch B coach on a Branch C multi participant.');
reset role;
select status as c11 from challenge_results where id = :'m_result_id' \gset
\echo 'CONFIRM: (13a-b) MULTI result status after two wrong-branch attempts=' :c11 '(expect pending)'

\echo '--- (13c) the CORRECT-branch manager can review -> MULTI_BRANCH behaviour preserved ---'
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- Carl, Branch C
select approve_challenge_result(:'m_result_id', 'Branch C manager approving a Branch C multi result.');
reset role;
select status as c12 from challenge_results where id = :'m_result_id' \gset
\echo 'CONFIRM: (13c) MULTI result status after the IN-BRANCH manager approved=' :c12 '(expect approved)'

-- ---------------------------------------------------------------------------
-- Restoration
-- ---------------------------------------------------------------------------
update profiles set is_active = true where id in (
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d');
select count(*) as still_off from profiles where is_active = false \gset
\echo 'CONFIRM: profiles left deactivated=' :still_off '(expect 0)'
