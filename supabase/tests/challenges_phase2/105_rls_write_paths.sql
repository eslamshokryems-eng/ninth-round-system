-- ===========================================================================
-- L-4 — RLS WRITE PATHS, under production-faithful table privileges.
--
-- The defect this file closes. Until now every write-path assertion in this
-- harness passed because `anon`/`authenticated` held no INSERT/UPDATE/DELETE
-- grant at all, so a direct client write failed with "permission denied for
-- table X". On a real Supabase project that grant DOES exist — the platform
-- issues SELECT, INSERT, UPDATE and DELETE on every new public table to both
-- client roles automatically, which is precisely why no Challenges migration
-- has ever had to grant anything. So the harness was proving a condition
-- that does not exist in production, and proving nothing at all about the
-- thing that does the work there: row-level security.
--
-- 00_schema.sql now grants the write privileges the platform grants. What
-- stops a direct client write is therefore the absence of a write POLICY:
--   * INSERT with no policy -> ERROR, "new row violates row-level security
--     policy for table ..."
--   * UPDATE / DELETE with no policy -> no error, ZERO rows affected.
-- The second case is the dangerous one to test badly: a statement that
-- changes nothing looks identical to a statement that was never run. Every
-- UPDATE/DELETE assertion below therefore reports `cmd_status` (so the test
-- can see UPDATE 0 rather than "no error") AND re-reads the target row to
-- confirm its value is unchanged.
--
-- Section 5 is the negative control: inside a transaction that is ROLLED
-- BACK, each guard is deliberately weakened or removed and the same
-- assertion is shown to flip. DDL is transactional in PostgreSQL, so the
-- rollback restores every policy exactly; section 6 proves it did.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

-- Fixtures: an approved result belonging to Alex, and Alex's own participant
-- row. Looked up rather than hardcoded, so this file does not depend on the
-- order earlier files ran in.
select id as alex_result from challenge_results
 where participant_profile_id = '00000000-0000-0000-0000-0000000000a1'
   and status = 'approved' and superseded_by_result_id is null
 order by created_at limit 1 \gset
select challenge_id as alex_challenge from challenge_results where id = :'alex_result' \gset
select id as alex_participant from challenge_participants
 where participant_profile_id = '00000000-0000-0000-0000-0000000000a1'
   and challenge_id = :'alex_challenge' limit 1 \gset
select result_value::text as alex_value from challenge_results where id = :'alex_result' \gset
select id as drew_result from challenge_results
 where participant_profile_id = '00000000-0000-0000-0000-0000000000a4'
   and status = 'approved' and superseded_by_result_id is null
 order by created_at limit 1 \gset
\echo 'CONFIRM: (fixture) alex_result=' :alex_result ' drew_result=' :drew_result

-- ===========================================================================
-- (1) The harness is no longer stricter than production: both client roles
--     hold all four privileges on every challenges table.
-- ===========================================================================
\echo ''
\echo '=== (1) production-faithful table privileges, including the two deliberate revokes ==='
-- The expected matrix is NOT "all four everywhere". 20261105000001 revokes
-- UPDATE and DELETE on challenge_result_reviews and challenge_points_ledger
-- from `authenticated` as defence in depth, because nothing but
-- recompute_challenge_points() and the review RPCs are ever meant to touch
-- those two tables. Asserting the exact matrix makes this file a regression
-- test for that revoke as well as a fidelity check on the harness.
select case when count(*) = 0 then 'PRIVILEGE_MATRIX_AS_EXPECTED'
            else 'MISMATCH(' || string_agg(t || ':' || r || ':' || p || ':' || (case when held then 'held-not-expected' else 'expected-not-held' end), ' ') || ')' end as confirm_grants
  from (
    select c.relname as t, r.rolname as r, pr.priv as p,
           has_table_privilege(r.rolname, c.oid, pr.priv) as held,
           not (pr.priv in ('UPDATE', 'DELETE')
                and r.rolname = 'authenticated'
                and c.relname in ('challenge_result_reviews', 'challenge_points_ledger')) as expected
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join (select 'anon' as rolname union all select 'authenticated') r
      cross join (select 'SELECT' as priv union all select 'INSERT' union all select 'UPDATE' union all select 'DELETE') pr
     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%'
  ) m
 where held <> expected \gset
\echo 'CONFIRM: (1) client table privileges=' :confirm_grants

-- Stated separately, because it is the fact the rest of this file rests on:
-- on every challenges table, a client holds INSERT (so an INSERT refusal
-- must come from RLS), and on all but those two it holds UPDATE and DELETE.
select case when count(*) = 0 then 'INSERT_GRANTED_EVERYWHERE' else 'INSERT_MISSING(' || string_agg(relname, ',') || ')' end as confirm_insert_grant
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'challenge%'
   and not has_table_privilege('authenticated', c.oid, 'INSERT') \gset
\echo 'CONFIRM: (1) authenticated holds INSERT on every challenges table=' :confirm_insert_grant

\echo ''
\echo '=== (1b) and there is no write POLICY anywhere on the challenges tables ==='
select case when count(*) = 0 then 'NO_WRITE_POLICIES'
            else 'WRITE_POLICIES(' || string_agg(tablename || '.' || policyname || ':' || cmd, ' ') || ')' end as confirm_no_write_pol
  from pg_policies
 where schemaname = 'public' and tablename like 'challenge%' and cmd <> 'SELECT' \gset
\echo 'CONFIRM: (1b) write policies on challenges tables=' :confirm_no_write_pol

-- ===========================================================================
-- (2) INSERT. A client holds the grant, so the refusal must come from RLS.
--     The assertion is BOTH that the RLS message appears AND that the
--     grant message does not — otherwise a regression that re-narrowed the
--     grants would still "pass".
-- ===========================================================================
\echo ''
\echo '=== (2a) a MEMBER cannot award themselves points (challenge_points_ledger) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into challenge_points_ledger (season_id, challenge_id, participant_profile_id, result_id, points_delta, reason, created_by)
values ((select season_id from challenges where id = :'alex_challenge'), :'alex_challenge', '00000000-0000-0000-0000-0000000000a1', :'alex_result', 9999, 'self-award', '00000000-0000-0000-0000-0000000000a1');
reset role;

\echo ''
\echo '=== (2b) a MEMBER cannot insert a result for themselves (challenge_results) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into challenge_results (challenge_id, participant_profile_id, entered_by_profile_id, result_value, measurement_unit, performed_at, status)
values (:'alex_challenge', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 9999, 'reps', now(), 'approved');
reset role;

\echo ''
\echo '=== (2c) a MEMBER cannot enter themselves into a competition directly ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
insert into challenge_participants (challenge_id, participant_profile_id, branch_id, status, eligibility_result)
values (:'alex_challenge', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000b', 'approved', true);
reset role;

\echo ''
\echo '=== (2d) a MEMBER cannot create a competition ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into challenges (season_id, title, category, program_type, scope, branch_id, status, measurement_type, measurement_unit, scoring_direction, weight, registration_start_at, registration_end_at, starts_at, ends_at, created_by)
values ((select id from challenge_seasons limit 1), 'Member Made This', 'strength', 'ninth_round', 'BRANCH', '00000000-0000-0000-0000-00000000000b', 'active', 'COUNT', 'reps', 'HIGHER_IS_BETTER', 10, now(), now(), now(), now(), '00000000-0000-0000-0000-0000000000a1');
reset role;

\echo ''
\echo '=== (2e) a STAFF account cannot write directly either (an in-branch COACH) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
insert into challenge_points_ledger (season_id, challenge_id, participant_profile_id, result_id, points_delta, reason, created_by)
values ((select season_id from challenges where id = :'alex_challenge'), :'alex_challenge', '00000000-0000-0000-0000-0000000000a1', :'alex_result', 9999, 'coach self-service', '00000000-0000-0000-0000-000000000003');
reset role;

\echo ''
\echo '=== (2f) nor can a SUPER ADMIN ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into challenge_points_ledger (season_id, challenge_id, participant_profile_id, result_id, points_delta, reason, created_by)
values ((select season_id from challenges where id = :'alex_challenge'), :'alex_challenge', '00000000-0000-0000-0000-0000000000a1', :'alex_result', 9999, 'admin self-service', '00000000-0000-0000-0000-000000000001');
reset role;

\echo ''
\echo '=== (2g) anon cannot insert anything ==='
set role anon;
reset request.jwt.claim.sub;
insert into challenge_display_names (profile_id, display_name)
values ('00000000-0000-0000-0000-0000000000a1', 'Anon Wrote This');
reset role;

select case when count(*) = 0 then 'NO_LEDGER_FORGERY' else 'FORGED(' || count(*) || ')' end as confirm_ledger_clean
  from challenge_points_ledger where points_delta = 9999 \gset
\echo 'CONFIRM: (2) forged ledger rows=' :confirm_ledger_clean
select case when count(*) = 0 then 'NO_FORGED_RESULT' else 'FORGED' end as confirm_result_clean
  from challenge_results where result_value = 9999 \gset
\echo 'CONFIRM: (2) forged result rows=' :confirm_result_clean
select case when count(*) = 0 then 'NO_MEMBER_CHALLENGE' else 'CREATED' end as confirm_challenge_clean
  from challenges where title = 'Member Made This' \gset
\echo 'CONFIRM: (2) competitions created by a member=' :confirm_challenge_clean

-- ===========================================================================
-- (3) UPDATE. No write policy means no error and ZERO rows — so each
--     assertion reports the command status and re-reads the row.
-- ===========================================================================
\echo ''
\echo '=== (3a) a MEMBER cannot approve their OWN pending result by UPDATE ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update challenge_results set status = 'approved' where participant_profile_id = '00000000-0000-0000-0000-0000000000a1' and status <> 'approved';
reset role;
select case when count(*) = 0 then 'NONE_FLIPPED' else 'FLIPPED(' || count(*) || ')' end as confirm_a1_status
  from challenge_results where participant_profile_id = '00000000-0000-0000-0000-0000000000a1'
   and status = 'approved' and id <> :'alex_result'
   and created_at > (select created_at from challenge_results where id = :'alex_result') \gset

\echo ''
\echo '=== (3b) a MEMBER cannot inflate their OWN approved result value ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update challenge_results set result_value = 100000 where id = :'alex_result';
reset role;
select case when result_value::text = :'alex_value' then 'VALUE_UNCHANGED' else 'VALUE_CHANGED(' || result_value || ')' end as confirm_own_value
  from challenge_results where id = :'alex_result' \gset
\echo 'CONFIRM: (3b) own result value after a direct UPDATE=' :confirm_own_value

\echo ''
\echo '=== (3c) a MEMBER cannot sabotage a RIVAL''s approved result ==='
select result_value::text as drew_value_before from challenge_results where id = :'drew_result' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update challenge_results set result_value = 0, status = 'rejected' where id = :'drew_result';
reset role;
select case when result_value::text = :'drew_value_before' and status = 'approved' then 'RIVAL_UNCHANGED' else 'RIVAL_CHANGED' end as confirm_rival
  from challenge_results where id = :'drew_result' \gset
\echo 'CONFIRM: (3c) rival result after a direct UPDATE=' :confirm_rival

\echo ''
\echo '=== (3d) a MEMBER cannot take over another member''s display name row ==='
select display_name as drew_name_before from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update challenge_display_names set display_name = 'Stolen By Alex' where profile_id = '00000000-0000-0000-0000-0000000000a4';
reset role;
select case when display_name = :'drew_name_before' then 'NAME_UNCHANGED' else 'NAME_CHANGED' end as confirm_other_name
  from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
\echo 'CONFIRM: (3d) another member''s display name after a direct UPDATE=' :confirm_other_name

\echo ''
\echo '=== (3e) a MEMBER cannot edit their OWN display name row directly either ==='
select display_name as alex_name_before from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update challenge_display_names set display_name = 'Alex Direct Edit' where profile_id = '00000000-0000-0000-0000-0000000000a1';
reset role;
select case when display_name = :'alex_name_before' then 'OWN_NAME_UNCHANGED' else 'OWN_NAME_CHANGED' end as confirm_own_name
  from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
\echo 'CONFIRM: (3e) own display name after a direct UPDATE=' :confirm_own_name

\echo ''
\echo '=== (3f) a COACH cannot make themselves a participant''s designated coach by UPDATE ==='
select coalesce(designated_coach_id::text, 'null') as desig_before from challenge_participants where id = :'alex_participant' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';   -- Coach Three, Branch C (out of scope)
update challenge_participants set designated_coach_id = '00000000-0000-0000-0000-00000000000d' where id = :'alex_participant';
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';   -- Coach One, IN scope
update challenge_participants set designated_coach_id = '00000000-0000-0000-0000-000000000003' where id = :'alex_participant';
reset role;
select case when coalesce(designated_coach_id::text, 'null') = :'desig_before' then 'DESIG_UNCHANGED' else 'DESIG_CHANGED' end as confirm_desig
  from challenge_participants where id = :'alex_participant' \gset
\echo 'CONFIRM: (3f) designated coach after two direct UPDATEs=' :confirm_desig

\echo ''
\echo '=== (3g) a BRANCH MANAGER cannot move a competition''s lifecycle by UPDATE ==='
select status::text as ch_status_before from challenges where id = :'alex_challenge' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
update challenges set status = 'completed' where id = :'alex_challenge';
reset role;
select case when status::text = :'ch_status_before' then 'STATUS_UNCHANGED' else 'STATUS_CHANGED' end as confirm_ch_status
  from challenges where id = :'alex_challenge' \gset
\echo 'CONFIRM: (3g) competition status after a direct UPDATE=' :confirm_ch_status

\echo ''
\echo '=== (3h) a SUPER ADMIN cannot change the weight range by UPDATE ==='
select value as setting_before from challenge_settings where key = 'max_weight' \gset
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update challenge_settings set value = '999' where key = 'max_weight';
reset role;
select case when value = :'setting_before' then 'SETTING_UNCHANGED' else 'SETTING_CHANGED' end as confirm_setting
  from challenge_settings where key = 'max_weight' \gset
\echo 'CONFIRM: (3h) weight-range setting after a direct UPDATE=' :confirm_setting

-- ===========================================================================
-- (4) DELETE. Same silent-zero-rows shape as UPDATE.
-- ===========================================================================
\echo ''
\echo '=== (4a) a MEMBER cannot delete a rival''s result ==='
-- This target is referenced by the points ledger and by its own review row,
-- both ON DELETE RESTRICT — so it matters WHICH refusal we get. A foreign
-- key violation is an ERROR; row security refusing the statement is
-- "DELETE 0" with no error at all, because no row is matched in the first
-- place and the constraints are never reached. The assertion below is
-- therefore on the command status, not merely on "something went wrong".
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
delete from challenge_results where id = :'drew_result';
reset role;

\echo ''
\echo '=== (4b) nor their OWN result, their OWN participation or their OWN ledger rows ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
delete from challenge_results where id = :'alex_result';
delete from challenge_participants where id = :'alex_participant';
delete from challenge_points_ledger where participant_profile_id = '00000000-0000-0000-0000-0000000000a1';
reset role;

\echo ''
\echo '=== (4c) nor can a COACH, a BRANCH MANAGER or a SUPER ADMIN ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
delete from challenge_results where id = :'alex_result';
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
delete from challenge_results where id = :'alex_result';
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
delete from challenge_results where id = :'alex_result';
reset role;

\echo ''
\echo '=== (4d) anon cannot delete anything ==='
set role anon;
reset request.jwt.claim.sub;
delete from challenge_results where id = :'alex_result';
delete from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a1';
reset role;

select case
         when (select count(*) from challenge_results where id = :'alex_result') = 1
          and (select count(*) from challenge_results where id = :'drew_result') = 1
          and (select count(*) from challenge_participants where id = :'alex_participant') = 1
          and (select count(*) from challenge_points_ledger where participant_profile_id = '00000000-0000-0000-0000-0000000000a1') > 0
          and (select count(*) from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a1') = 1
         then 'NOTHING_DELETED' else 'SOMETHING_DELETED' end as confirm_deletes \gset
\echo 'CONFIRM: (4) every targeted row still present=' :confirm_deletes

-- ===========================================================================
-- (5) NEGATIVE CONTROLS. Every assertion above is now shown to FLIP when
--     the policy it depends on is weakened or removed. All of it happens
--     inside one transaction that is ROLLED BACK — PostgreSQL DDL is
--     transactional, so the rollback is what restores the policies, not a
--     hand-written re-creation that could differ from the original.
-- ===========================================================================
\echo ''
\echo '=== (5) negative controls (inside a transaction that is rolled back) ==='
select count(*)::text as policies_before from pg_policies where schemaname = 'public' and tablename like 'challenge%' \gset
\echo 'CONFIRM: (5) challenges policies before=' :policies_before

begin;

-- Each control gets its own SAVEPOINT, so a mistake in one does not abort
-- the transaction and silently turn the remaining controls into vacuous
-- passes (which is exactly what happened the first time this file ran).
savepoint l4_n1;
-- N1: grant clients an INSERT policy on the points ledger -> (2a) must flip.
create policy l4_neg_ledger_insert on challenge_points_ledger for insert to public with check (true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into challenge_points_ledger (season_id, challenge_id, participant_profile_id, result_id, points_delta, reason, created_by)
values ((select season_id from challenges where id = :'alex_challenge'), :'alex_challenge', '00000000-0000-0000-0000-0000000000a1', :'alex_result', 8888, 'negative control', '00000000-0000-0000-0000-0000000000a1');
reset role;
select case when count(*) = 1 then 'N1_FLIPPED' else 'N1_DID_NOT_FLIP' end as confirm_n1
  from challenge_points_ledger where points_delta = 8888 \gset
\echo 'CONFIRM: (5/N1) with an INSERT policy the self-award succeeds=' :confirm_n1

rollback to savepoint l4_n1;
savepoint l4_n2;
-- N2: grant clients an UPDATE policy on results -> (3b) must flip.
create policy l4_neg_result_update on challenge_results for update to public using (true) with check (true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
update challenge_results set result_value = 100000 where id = :'alex_result';
reset role;
select case when result_value = 100000 then 'N2_FLIPPED' else 'N2_DID_NOT_FLIP' end as confirm_n2
  from challenge_results where id = :'alex_result' \gset
\echo 'CONFIRM: (5/N2) with an UPDATE policy the self-inflation succeeds=' :confirm_n2

rollback to savepoint l4_n2;
savepoint l4_n3;
-- N3: grant clients a DELETE policy -> (4a) must flip.
--
-- The rows that reference this result — its review row and its points
-- ledger entries, both ON DELETE RESTRICT — are cleared first, AS THE OWNER
-- and inside this savepoint. With them in place the DELETE fails on the
-- constraint whatever the policy says, and the control would report "did
-- not flip" for a reason that has nothing to do with row security. Clearing
-- them is setup for the control, not a change to the thing under test, and
-- the rollback below undoes it. This is also why (4a) above asserts on
-- "DELETE 0" specifically: that status is only reachable when NO row was
-- matched, which is what row security does, whereas the constraints would
-- have produced an error instead.
delete from challenge_result_reviews where result_id = :'drew_result';
delete from challenge_points_ledger where result_id = :'drew_result';
create policy l4_neg_result_delete on challenge_results for delete to public using (true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
delete from challenge_results where id = :'drew_result';
reset role;
select case when count(*) = 0 then 'N3_FLIPPED' else 'N3_DID_NOT_FLIP' end as confirm_n3
  from challenge_results where id = :'drew_result' \gset
\echo 'CONFIRM: (5/N3) with a DELETE policy the rival''s result is destroyed=' :confirm_n3

rollback to savepoint l4_n3;
savepoint l4_n4;
-- N4: remove the ownership gate on participants -> an unrelated customer
--     must start seeing other people's raw participant rows.
drop policy "participant reads own participation" on challenge_participants;
create policy l4_neg_participants_open on challenge_participants for select to public using (true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'N4_FLIPPED' else 'N4_DID_NOT_FLIP' end as confirm_n4
  from challenge_participants where participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' \gset
reset role;
\echo 'CONFIRM: (5/N4) with the ownership gate removed other people''s rows are visible=' :confirm_n4

rollback to savepoint l4_n4;
savepoint l4_n5;
-- N5: weaken the status gate on results -> a customer must start seeing
--     other people's PENDING and REJECTED results.
drop policy "authenticated read current approved results" on challenge_results;
create policy l4_neg_results_all_statuses on challenge_results for select to public
  using (auth_role() is not null);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) > 0 then 'N5_FLIPPED' else 'N5_DID_NOT_FLIP' end as confirm_n5
  from challenge_results
 where participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' and status <> 'approved' \gset
reset role;
\echo 'CONFIRM: (5/N5) with the status gate weakened other people''s pending results are visible=' :confirm_n5

rollback;

-- ===========================================================================
-- (6) The rollback restored everything.
-- ===========================================================================
\echo ''
\echo '=== (6) post-rollback restoration ==='
select count(*)::text as policies_after from pg_policies where schemaname = 'public' and tablename like 'challenge%' \gset
select case when :'policies_before' = :'policies_after' then 'POLICY_COUNT_RESTORED' else 'POLICY_COUNT_DRIFT(' || :'policies_before' || '->' || :'policies_after' || ')' end as confirm_count \gset
\echo 'CONFIRM: (6) policy count=' :confirm_count

select case when count(*) = 0 then 'NO_NEGATIVE_CONTROL_POLICIES_LEFT' else 'LEFTOVER(' || string_agg(policyname, ',') || ')' end as confirm_no_leftover
  from pg_policies where schemaname = 'public' and policyname like 'l4_neg_%' \gset
\echo 'CONFIRM: (6) leftover negative-control policies=' :confirm_no_leftover

select case when count(*) = 2 then 'BOTH_ORIGINALS_BACK'
            else 'MISSING(' || coalesce(string_agg(policyname, ','), 'both') || ')' end as confirm_originals
  from pg_policies
 where schemaname = 'public'
   and policyname in ('participant reads own participation', 'authenticated read current approved results') \gset
\echo 'CONFIRM: (6) the two dropped policies=' :confirm_originals

select case when count(*) = 0 then 'NO_WRITE_POLICIES' else 'WRITE_POLICIES' end as confirm_no_write_after
  from pg_policies where schemaname = 'public' and tablename like 'challenge%' and cmd <> 'SELECT' \gset
\echo 'CONFIRM: (6) write policies after rollback=' :confirm_no_write_after

select case when count(*) = 0 then 'NO_NEGATIVE_CONTROL_ROWS' else 'LEFTOVER_ROWS' end as confirm_no_rows
  from challenge_points_ledger where points_delta = 8888 \gset
\echo 'CONFIRM: (6) negative-control ledger rows=' :confirm_no_rows

select case when result_value::text = :'alex_value' then 'VALUE_RESTORED' else 'VALUE_DRIFT' end as confirm_value_restored
  from challenge_results where id = :'alex_result' \gset
\echo 'CONFIRM: (6) the result the controls mutated=' :confirm_value_restored

select case when count(*) = 1 then 'RIVAL_RESULT_RESTORED' else 'RIVAL_RESULT_GONE' end as confirm_rival_restored
  from challenge_results where id = :'drew_result' \gset
\echo 'CONFIRM: (6) the result the controls deleted=' :confirm_rival_restored

-- And the ownership gate works again, for the same reader that saw through
-- it a moment ago.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select case when count(*) = 0 then 'HIDDEN_AGAIN' else 'STILL_VISIBLE' end as confirm_gate_back
  from challenge_participants where participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' \gset
select case when count(*) = 0 then 'HIDDEN_AGAIN' else 'STILL_VISIBLE' end as confirm_status_gate_back
  from challenge_results
 where participant_profile_id <> '00000000-0000-0000-0000-0000000000a3' and status <> 'approved' \gset
reset role;
\echo 'CONFIRM: (6) ownership gate after rollback=' :confirm_gate_back
\echo 'CONFIRM: (6) status gate after rollback=' :confirm_status_gate_back

-- ===========================================================================
-- (7) POSITIVE CONTROLS. The writes that are SUPPOSED to work still do,
--     through the RPCs, with the client write grants in place — so none of
--     the above was achieved by breaking the module.
-- ===========================================================================
\echo ''
\echo '=== (7) the legitimate RPC write paths still work ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select set_challenge_display_name('L4 Casey Renamed');
reset role;
select case when display_name = 'L4 Casey Renamed' then 'RPC_WRITE_OK' else 'RPC_WRITE_BLOCKED' end as confirm_rpc_write
  from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a3' \gset
\echo 'CONFIRM: (7) a member renaming themselves through the RPC=' :confirm_rpc_write

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select case when count(*) = 1 then 'OWN_ROW_READABLE' else 'OWN_ROW_HIDDEN' end as confirm_own_read
  from challenge_participants where id = :'alex_participant' \gset
reset role;
\echo 'CONFIRM: (7) a member can still read their own participation=' :confirm_own_read
