-- The new public-facing read paths this phase introduces: broad
-- "any authenticated account can read" RLS policies on challenge_
-- participants/challenge_points_ledger/challenge_display_names/
-- challenge_branches, a status-gated split on challenge_results
-- (current-approved is public; pending/rejected stays staff+self only),
-- and the three leaderboard views themselves — queried AS a genuinely
-- low-privileged authenticated customer who is neither staff nor the
-- row's own owner, to actually prove (not assume) that Postgres
-- evaluates a view's underlying RLS using the QUERYING role, and that
-- this harness's new `alter default privileges` fix (00_schema.sql) is
-- what makes a direct table/view SELECT reachable at all for a
-- low-privilege role in the first place.
--
-- Every assertion below resolves to a literal, grep-able VISIBLE/HIDDEN/
-- EMPTY marker rather than a bare row count, so a wrongly-empty result
-- (RLS or the default-privileges fix silently failing) cannot be
-- mistaken for a pass the way a bare "0 rows returned, header still
-- printed" output could be.
\set ON_ERROR_STOP off
select id as challenge_id from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
select id as season_id from challenge_seasons limit 1 \gset
select id as multi_challenge_id from challenges where title = 'Multi Branch Challenge' order by created_at desc limit 1 \gset
select id as a_result_id from challenge_results
  where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' and status = 'rejected'
  limit 1 \gset

-- ---------------------------------------------------------------------------
-- Finding 2: a participant's RAW record and RAW ledger entries are
-- private (own rows + staff in scope only). The public subset reaches
-- other customers exclusively through the leaderboard views, asserted
-- further down — these first assertions pin the RAW tables shut.
-- ---------------------------------------------------------------------------

\echo '=== Casey (an ordinary, unrelated customer) must NOT read OTHER people''s raw challenge_participants rows ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_others_participants_to_casey
  from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' \gset
reset role;
\echo 'CONFIRM: others_participants_to_casey=' :confirm_others_participants_to_casey

\echo '=== Casey CAN read her OWN participant record (including her own rejection reason) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_own_participation_to_casey
  from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
reset role;
\echo 'CONFIRM: own_participation_to_casey=' :confirm_own_participation_to_casey

\echo '=== a REJECTED participant''s record does not leak to another customer (Blair, age-rejected, read by Casey) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_rejected_participation_to_customer
  from challenge_participants
  where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a2' and status = 'rejected' \gset
reset role;
\echo 'CONFIRM: rejected_participation_to_customer=' :confirm_rejected_participation_to_customer

\echo '=== staff IN SCOPE (Mona, branch_manager of the challenge''s branch) CAN read participant records ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_participants_to_in_scope_staff
  from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
reset role;
\echo 'CONFIRM: participants_to_in_scope_staff=' :confirm_participants_to_in_scope_staff

\echo '=== staff OUT OF SCOPE (Carl, branch_manager of the OTHER branch) must NOT read this branch''s participant records ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_participants_to_out_of_scope_staff
  from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
reset role;
\echo 'CONFIRM: participants_to_out_of_scope_staff=' :confirm_participants_to_out_of_scope_staff

\echo '=== Casey (ordinary customer) must NOT read OTHER people''s raw challenge_points_ledger rows ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_others_ledger_to_casey
  from challenge_points_ledger
  where challenge_id = :'challenge_id' and participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' \gset
reset role;
\echo 'CONFIRM: others_ledger_to_casey=' :confirm_others_ledger_to_casey

\echo '=== Alex CAN read her OWN raw ledger entries ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_own_ledger_to_alex
  from challenge_points_ledger
  where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
reset role;
\echo 'CONFIRM: own_ledger_to_alex=' :confirm_own_ledger_to_alex

\echo '=== staff IN SCOPE CAN read raw ledger entries; staff OUT OF SCOPE cannot ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, in scope
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_ledger_to_in_scope_staff
  from challenge_points_ledger where challenge_id = :'challenge_id' \gset
reset role;
\echo 'CONFIRM: ledger_to_in_scope_staff=' :confirm_ledger_to_in_scope_staff
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a'; -- Carl, other branch
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_ledger_to_out_of_scope_staff
  from challenge_points_ledger where challenge_id = :'challenge_id' \gset
reset role;
\echo 'CONFIRM: ledger_to_out_of_scope_staff=' :confirm_ledger_to_out_of_scope_staff

\echo '=== Casey can read OTHER people''s display names ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select display_name as confirm_alex_name_visible_to_casey from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
reset role;
\echo 'CONFIRM: alex_name_visible_to_casey=' :confirm_alex_name_visible_to_casey

\echo '=== Casey can read a MULTI_BRANCH challenge''s branch list ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'VISIBLE' else 'EMPTY' end as confirm_branches_visible_to_casey
  from challenge_branches where challenge_id = :'multi_challenge_id' \gset
reset role;
\echo 'CONFIRM: branches_visible_to_casey=' :confirm_branches_visible_to_casey

\echo '=== Casey CANNOT see Alex''s REJECTED result directly — only current-approved results are public ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_rejected_result_hidden_from_casey
  from challenge_results where id = :'a_result_id' \gset
reset role;
\echo 'CONFIRM: rejected_result_from_casey=' :confirm_rejected_result_hidden_from_casey

\echo '=== Mona (branch_manager, same branch) CAN see that same rejected result — staff visibility is unaffected by the new public-approved policy ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_rejected_result_visible_to_staff
  from challenge_results where id = :'a_result_id' \gset
reset role;
\echo 'CONFIRM: rejected_result_to_staff=' :confirm_rejected_result_visible_to_staff

\echo '=== challenge_leaderboard: Casey (low-privilege customer) reads a real, ranked leaderboard for the branch challenge ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select display_name, branch_id, overall_rank, branch_rank from challenge_leaderboard where challenge_id = :'challenge_id' order by overall_rank;
select case when count(*) > 0 then 'VISIBLE' else 'EMPTY' end as confirm_leaderboard_visible_to_casey
  from challenge_leaderboard where challenge_id = :'challenge_id' \gset
reset role;
\echo 'CONFIRM: leaderboard_visible_to_casey=' :confirm_leaderboard_visible_to_casey

\echo '=== challenge_season_leaderboard_overall: Casey reads the season-wide points leaderboard ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select display_name, total_points, rank from challenge_season_leaderboard_overall where season_id = :'season_id' order by rank;
select case when count(*) > 0 then 'VISIBLE' else 'EMPTY' end as confirm_overall_leaderboard_visible_to_casey
  from challenge_season_leaderboard_overall where season_id = :'season_id' \gset
reset role;
\echo 'CONFIRM: overall_leaderboard_visible_to_casey=' :confirm_overall_leaderboard_visible_to_casey

\echo '=== challenge_season_leaderboard_by_branch: Casey reads the per-branch points leaderboard ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select display_name, branch_id, total_points, rank from challenge_season_leaderboard_by_branch where season_id = :'season_id' order by branch_id, rank;
select case when count(*) > 0 then 'VISIBLE' else 'EMPTY' end as confirm_branch_leaderboard_visible_to_casey
  from challenge_season_leaderboard_by_branch where season_id = :'season_id' \gset
reset role;
\echo 'CONFIRM: branch_leaderboard_visible_to_casey=' :confirm_branch_leaderboard_visible_to_casey

-- ---------------------------------------------------------------------------
-- Finding 2, the other half: narrowing the base tables must NOT blank out
-- the leaderboards. A bare "count(*) > 0" cannot prove that — it would
-- still pass if each viewer only ever saw their own single row. Casey is
-- the sharpest possible probe here: she is age-REJECTED on this challenge
-- and has no result and no ledger entry of her own, so every row she can
-- see through these views belongs to SOMEONE ELSE. Asserting she sees two
-- or more distinct participants proves the owner's-rights view path is
-- genuinely serving other people's curated standings.
-- ---------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(distinct participant_profile_id) >= 2 then 'MULTI' else 'NARROWED' end as confirm_leaderboard_breadth
  from challenge_leaderboard where challenge_id = :'challenge_id' \gset
select case when count(distinct participant_profile_id) >= 2 then 'MULTI' else 'NARROWED' end as confirm_season_overall_breadth
  from challenge_season_leaderboard_overall where season_id = :'season_id' \gset
select case when count(distinct participant_profile_id) >= 2 then 'MULTI' else 'NARROWED' end as confirm_season_branch_breadth
  from challenge_season_leaderboard_by_branch where season_id = :'season_id' \gset
select case when count(*) = 0 then 'NONE_OF_HER_OWN' else 'HAS_OWN_ROW' end as confirm_casey_has_no_own_leaderboard_row
  from challenge_leaderboard where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
reset role;
\echo 'CONFIRM: leaderboard_breadth=' :confirm_leaderboard_breadth
\echo 'CONFIRM: season_overall_breadth=' :confirm_season_overall_breadth
\echo 'CONFIRM: season_branch_breadth=' :confirm_season_branch_breadth
\echo 'CONFIRM: casey_own_leaderboard_row=' :confirm_casey_has_no_own_leaderboard_row

-- ---------------------------------------------------------------------------
-- REGRESSION (audit Finding 1): a GLOBAL-scope challenge has no branch, so
-- the staff policies' branch clause (`c.scope = 'GLOBAL' or
-- is_branch_staff(...)`) short-circuits to true for EVERY caller. Without
-- their role gate, that one permissive policy alone exposed every
-- pending/rejected result and every review note of every GLOBAL
-- competition to any caller at all, anon included — permissive policies
-- union with OR, so the narrower policies beside them cannot take that
-- access back. The original 95 tests missed this because they only ever
-- checked a non-approved result on a BRANCH-scoped challenge, where
-- is_branch_staff() does genuinely gate. These assertions pin the GLOBAL
-- case for a customer, for staff, and for anon.
-- ---------------------------------------------------------------------------

select id as global_challenge_id from challenges where title = 'Global Challenge' order by created_at desc limit 1 \gset

\echo '=== setup: Coach One submits a result for Casey on the GLOBAL challenge -> stays PENDING (never reviewed) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, Casey's designated coach (set in 70, case G)
select * from submit_challenge_result(:'global_challenge_id', '00000000-0000-0000-0000-0000000000a3', 55, 'reps', now()) \gset gp_
reset role;
\echo 'CONFIRM: global pending result id=' :gp_result_id

\echo '=== GLOBAL pending result: the participant herself CAN see her own ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3'; -- Casey, the owner
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_pending_to_owner
  from challenge_results where id = :'gp_result_id' \gset
reset role;
\echo 'CONFIRM: global_pending_to_owner=' :confirm_global_pending_to_owner

\echo '=== GLOBAL pending result: an UNRELATED CUSTOMER must NOT see it (this is the regression) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4'; -- Drew, an ordinary customer, not staff, not the owner
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_pending_to_customer
  from challenge_results where id = :'gp_result_id' \gset
reset role;
\echo 'CONFIRM: global_pending_to_customer=' :confirm_global_pending_to_customer

\echo '=== GLOBAL pending result: staff CAN still see it (GLOBAL waives the BRANCH requirement, not the STAFF requirement) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, branch_manager — Casey has no branch at all
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_pending_to_staff
  from challenge_results where id = :'gp_result_id' \gset
reset role;
\echo 'CONFIRM: global_pending_to_staff=' :confirm_global_pending_to_staff

\echo '=== GLOBAL pending result: anon must NOT see it (this is the regression) ==='
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_pending_to_anon
  from challenge_results where id = :'gp_result_id' \gset
reset role;
\echo 'CONFIRM: global_pending_to_anon=' :confirm_global_pending_to_anon

\echo '=== GLOBAL review notes: same three callers, against a real review row from the approved race result ==='
select rv.id as global_review_id
  from challenge_result_reviews rv
  join challenge_results r on r.id = rv.result_id
  where r.challenge_id = :'global_challenge_id'
  limit 1 \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2'; -- Blair, the reviewed result's own participant
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_review_to_owner
  from challenge_result_reviews where id = :'global_review_id' \gset
reset role;
\echo 'CONFIRM: global_review_to_owner=' :confirm_global_review_to_owner

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4'; -- Drew, unrelated customer
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_review_to_customer
  from challenge_result_reviews where id = :'global_review_id' \gset
reset role;
\echo 'CONFIRM: global_review_to_customer=' :confirm_global_review_to_customer

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- Mona, branch_manager
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_review_to_staff
  from challenge_result_reviews where id = :'global_review_id' \gset
reset role;
\echo 'CONFIRM: global_review_to_staff=' :confirm_global_review_to_staff

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select case when count(*) > 0 then 'VISIBLE' else 'HIDDEN' end as confirm_global_review_to_anon
  from challenge_result_reviews where id = :'global_review_id' \gset
reset role;
\echo 'CONFIRM: global_review_to_anon=' :confirm_global_review_to_anon

\echo '=== anon (genuinely unauthenticated — jwt claim explicitly cleared first) sees ZERO rows anywhere, not a permission error ==='
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select count(*) as confirm_anon_participant_count from challenge_participants \gset
select count(*) as confirm_anon_leaderboard_count from challenge_leaderboard \gset
select count(*) as confirm_anon_display_name_count from challenge_display_names \gset
reset role;
\echo 'CONFIRM: anon sees participants=' :confirm_anon_participant_count 'leaderboard=' :confirm_anon_leaderboard_count 'display_names=' :confirm_anon_display_name_count '(expect 0, 0, 0)'
