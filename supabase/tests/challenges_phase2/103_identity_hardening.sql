-- ===========================================================================
-- L-1 and L-2 (migration 20261113000001).
--
-- L-1  request_challenge_participation() must refuse an unauthenticated
--      caller explicitly (not incidentally, via the display-name lookup),
--      and must refuse a STAFF account trying to enter a competition.
-- L-2  is_admin() / is_super_admin() must have a pinned search_path while
--      keeping their exact previous truth table.
--
-- Every assertion resolves to a literal, grep-able CONFIRM marker computed
-- in SQL rather than to a hardcoded count, so a wrongly-empty result cannot
-- be mistaken for a pass. Every refusal is paired with a state check, so a
-- raised exception is only counted when the database actually did not change.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- ---------------------------------------------------------------------------
-- Fixtures. Built through the REAL RPCs wherever the RPC allows it.
--
-- A registration-open BRANCH competition is needed because every other
-- challenge in the seed is already `active`, and the lifecycle check in
-- request_challenge_participation fires BEFORE the identity checks would be
-- reached — testing against an `active` competition would pass for the
-- wrong reason.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';  -- Sam Super
select create_challenge(
  (select id from challenge_seasons order by created_at limit 1),
  'L1 Registration Open Challenge', null,
  'strength'::challenge_category, 'ninth_round'::program_type,
  'BRANCH'::challenge_scope, '00000000-0000-0000-0000-00000000000b',
  'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 10,
  now() - interval '1 day', now() + interval '10 days',
  now() - interval '1 day', now() + interval '30 days',
  '[]'::jsonb, null
) as l1_challenge \gset
reset role;

-- The only state change made directly: moving the competition into its
-- registration-open phase. There is no RPC for a lifecycle transition in
-- this module, so the harness does it as the owner, exactly as every
-- earlier lifecycle test in this suite does.
update challenges set status = 'registration_open' where id = :'l1_challenge';
select case when count(*) = 1 then 'OPEN' else 'NOT_OPEN' end as confirm_fixture
  from challenges where id = :'l1_challenge' and status = 'registration_open' \gset
\echo 'CONFIRM: (fixture) registration-open competition=' :confirm_fixture

select count(*)::text as participants_before from challenge_participants \gset

-- ===========================================================================
-- L-2. search_path pinning, and the unchanged truth table.
-- ===========================================================================
\echo ''
\echo '=== (L2-1) both helpers must now carry a pinned search_path ==='
select case
         when count(*) = 2 then 'BOTH_PINNED'
         else 'NOT_PINNED(' || coalesce(string_agg(p.proname || '=' || coalesce(array_to_string(p.proconfig, ','), 'none'), ' '), 'missing') || ')'
       end as confirm_pinned
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_admin', 'is_super_admin')
   and p.proconfig @> array['search_path=""']::text[] \gset
\echo 'CONFIRM: (L2-1) helper search_path=' :confirm_pinned

\echo ''
\echo '=== (L2-2) is_super_admin() truth table is unchanged for every role ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is_super_admin()::text as sa_super, is_admin()::text as ad_super \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';  -- Mona, branch_manager
select is_super_admin()::text as sa_bm, is_admin()::text as ad_bm \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';  -- Coach One
select is_super_admin()::text as sa_coach, is_admin()::text as ad_coach \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';  -- Alex, member
select is_super_admin()::text as sa_member, is_admin()::text as ad_member \gset
reset request.jwt.claim.sub;                                         -- no identity
select is_super_admin()::text as sa_null, is_admin()::text as ad_null \gset
reset role;
\echo 'CONFIRM: (L2-2) is_super_admin super/bm/coach/member/null=' :sa_super '/' :sa_bm '/' :sa_coach '/' :sa_member '/' :sa_null
\echo 'CONFIRM: (L2-2) is_admin       super/bm/coach/member/null=' :ad_super '/' :ad_bm '/' :ad_coach '/' :ad_member '/' :ad_null

\echo ''
\echo '=== (L2-3) a DEACTIVATED super admin is still not a super admin ==='
update profiles set is_active = false where id = '00000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is_super_admin()::text as sa_deactivated, is_admin()::text as ad_deactivated \gset
reset role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-000000000001';
\echo 'CONFIRM: (L2-3) deactivated super admin is_super_admin/is_admin=' :sa_deactivated '/' :ad_deactivated

-- ===========================================================================
-- L-1 (a). An unauthenticated caller must be refused BY AUTHORIZATION.
-- ===========================================================================
\echo ''
\echo '=== (L1-1) NULL identity: refused explicitly, not via the display-name lookup ==='
set role authenticated;
reset request.jwt.claim.sub;
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b');
reset role;

select case when count(*) = 0 then 'NO_ROW_WRITTEN' else 'ROW_WRITTEN' end as confirm_null_wrote
  from challenge_participants where challenge_id = :'l1_challenge' \gset
\echo 'CONFIRM: (L1-1) NULL-identity caller wrote=' :confirm_null_wrote

-- ===========================================================================
-- L-1 (b). A STAFF account must not be able to enter a competition.
--
-- Each of the three staff roles is given a display name first, so the
-- refusal cannot be the display-name guard firing instead of the role
-- guard. Setting a staff display name is itself a legitimate operation
-- (20261112000001 permits a staff member to hold a name), which is why
-- this needs its own test rather than relying on the name guard.
-- ===========================================================================
\echo ''
\echo '=== (L1-2) an ACTIVE COACH cannot enter a competition ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';  -- Coach One (Branch B)
select set_challenge_display_name('L1 Coach Alias');
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b');
reset role;

\echo ''
\echo '=== (L1-3) an ACTIVE BRANCH MANAGER cannot enter a competition ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';  -- Mona (Branch B)
select set_challenge_display_name('L1 Manager Alias');
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b');
reset role;

\echo ''
\echo '=== (L1-4) an ACTIVE SUPER ADMIN cannot enter a competition ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';  -- Sam Super
select set_challenge_display_name('L1 Admin Alias');
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b');
reset role;

select case when count(*) = 0 then 'NO_STAFF_PARTICIPANT' else 'STAFF_PARTICIPANT(' || count(*) || ')' end as confirm_staff_rows
  from challenge_participants cp
  join profiles pr on pr.id = cp.participant_profile_id
 where pr.role <> 'member' \gset
\echo 'CONFIRM: (L1-2..4) staff participant rows anywhere in the schema=' :confirm_staff_rows

-- ===========================================================================
-- L-1 (c). A DEACTIVATED member is refused too.
-- ===========================================================================
\echo ''
\echo '=== (L1-5) a DEACTIVATED member cannot enter a competition ==='
-- Eve already holds a display name from the seed, so the refusal below
-- cannot be the display-name guard.
select case when count(*) = 1 then 'HAS_NAME' else 'NO_NAME' end as confirm_eve_named
  from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a5' \gset
\echo 'CONFIRM: (L1-5 setup) Eve has a display name=' :confirm_eve_named
update profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000a5';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b');
reset role;
update profiles set is_active = true where id = '00000000-0000-0000-0000-0000000000a5';

-- ===========================================================================
-- L-1 (d). POSITIVE CONTROLS — the legitimate member workflow is intact.
-- Without these the whole L-1 change could be satisfied by refusing
-- everybody, which is why they are asserted rather than assumed.
-- ===========================================================================
\echo ''
\echo '=== (L1-6) POSITIVE: an ACTIVE MEMBER with a display name still joins ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';  -- Eve, reactivated
select status::text as eve_status, eligibility_result::text as eve_eligible
  from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b') \gset
reset role;
\echo 'CONFIRM: (L1-6) active member joined with status/eligible=' :eve_status '/' :eve_eligible

\echo ''
\echo '=== (L1-7) POSITIVE: the display-name requirement still fires for a member who has none ==='
-- Race Four is the one member left without a display name at this point in
-- the suite (it is a losing claimant from the 102 concurrency rounds). The
-- setup marker below is asserted, so if a future change gives Race Four a
-- name this test fails loudly instead of silently passing for the wrong
-- reason.
select case when count(*) = 0 then 'NO_NAME' else 'HAS_NAME' end as confirm_nameless
  from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000b4' \gset
\echo 'CONFIRM: (L1-7 setup) Race Four has NO display name=' :confirm_nameless
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b4';  -- Race Four, no display name
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b');
reset role;

\echo ''
\echo '=== (L1-8) POSITIVE: the duplicate-request guard still fires (Eve again) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a5';
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000b');
reset role;

\echo ''
\echo '=== (L1-9) POSITIVE: the branch-scope rule still fires (wrong branch for a BRANCH competition) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b4';
select set_challenge_display_name('L1 Race Four');
select * from request_challenge_participation(:'l1_challenge', '00000000-0000-0000-0000-00000000000c');
reset role;

\echo ''
\echo '=== (L1-10) POSITIVE: the lifecycle rule still fires (an ACTIVE competition is not open) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b4';
select * from request_challenge_participation('00000000-0000-0000-0000-000000000000', null);
select * from request_challenge_participation(
  (select id from challenges where title = 'Push-Up Challenge' and status = 'active' order by created_at limit 1),
  '00000000-0000-0000-0000-00000000000b');
reset role;

-- ===========================================================================
-- Final state. Exactly ONE new participant (Eve) was added by this file,
-- and no pre-existing row anywhere was changed.
-- ===========================================================================
\echo ''
select case
         when (select count(*) from challenge_participants) = :participants_before + 1
           then 'EXACTLY_ONE_ADDED'
         else 'UNEXPECTED(' || (select count(*) from challenge_participants) || ' vs ' || :participants_before || ')'
       end as confirm_delta \gset
\echo 'CONFIRM: (final) participant rows added by this file=' :confirm_delta

select case when count(*) = 1 and bool_and(pr.role = 'member') then 'ONLY_EVE_A_MEMBER' else 'WRONG(' || count(*) || ')' end as confirm_only_eve
  from challenge_participants cp join profiles pr on pr.id = cp.participant_profile_id
 where cp.challenge_id = :'l1_challenge' \gset
\echo 'CONFIRM: (final) rows on the fixture competition=' :confirm_only_eve

select case when count(*) = 0 then '0' else count(*)::text end as confirm_deactivated
  from profiles where not is_active \gset
\echo 'CONFIRM: profiles left deactivated=' :confirm_deactivated
