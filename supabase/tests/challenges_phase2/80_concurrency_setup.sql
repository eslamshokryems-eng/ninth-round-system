-- Sets up a fresh pending result, owned by a brand-new participant with
-- no existing current result, so the M-3 concurrency race
-- (81_race_session_a.sql / 82_race_session_b.sql) exercises only the
-- row-lock behavior, not the (separately verified) uq_challenge_results_
-- current / uq_challenge_results_no_duplicate_original constraints.
-- Blair already registered for the Global Challenge in 45_registration_
-- and_branch_selection.sql through the real request_challenge_
-- participation() flow — this file only looks her participant row up.
\set ON_ERROR_STOP off
select id as global_challenge_id from challenges where title = 'Global Challenge' order by created_at desc limit 1 \gset
select id as race_p_participant_id from challenge_participants where challenge_id = :'global_challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a2' \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- super_admin — Blair has no branch to scope a branch_manager's authority against
select designate_challenge_coach(:'race_p_participant_id', '00000000-0000-0000-0000-000000000003', 'Assigning Blair''s coach for the concurrency race.');
reset role;

update challenges set status = 'active' where id = :'global_challenge_id';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, Blair's designated coach
select * from submit_challenge_result(:'global_challenge_id', '00000000-0000-0000-0000-0000000000a2', 60, 'reps', now()) \gset race_
reset role;

\echo 'RACE_TARGET_RESULT_ID=' :race_result_id
