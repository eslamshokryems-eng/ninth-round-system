-- Self-review ban (on a correction), the reason requirement for
-- designate_challenge_coach() (its audit metadata is now just {reason} —
-- there is no more "automatic resolution" to compare an override
-- against, since coach assignment is designation-only in Phase 3), and
-- the atomic whole-challenge points recompute affecting a SECOND,
-- previously-unrelated participant (proving "recompute the WHOLE
-- challenge's ranking, not just the one just approved").
\set ON_ERROR_STOP off
select id as challenge_id from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
select id as participant_id from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a1' \gset
-- The CURRENT live result for Alex — by this point 50_lifecycle_and_
-- submission.sql has already superseded the original via an approved
-- correction, so "current" (status='approved' and superseded_by_
-- result_id is null) is now that correction. Requesting a further
-- correction must target whatever is current NOW, exactly as request_
-- challenge_result_correction() itself requires.
select id as current_result_id from challenge_results
  where participant_profile_id = '00000000-0000-0000-0000-0000000000a1' and status = 'approved' and superseded_by_result_id is null
  limit 1 \gset

\echo '=== Self-review ban: the author of a correction cannot approve it ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, still Alex's designated coach
select * from request_challenge_result_correction(:'current_result_id', 61, 'reps', now()) \gset selfcorr_
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- same author attempting to approve their own correction
select approve_challenge_result_correction(:'selfcorr_result_id', 'self-approving, must fail');
reset role;
-- clean up: reject it so it doesn't interfere with later steps
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select reject_challenge_result_correction(:'selfcorr_result_id', 'Rejecting test correction.');
reset role;

\echo '=== designate_challenge_coach with NO reason -> rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- branch_manager, same branch as Alex's participation
select designate_challenge_coach(:'participant_id', '00000000-0000-0000-0000-000000000004', '');
reset role;

\echo '=== designate_challenge_coach WITH a reason, reassigning from Coach One to Coach Two -> succeeds; audit log records the reason (no automatic-resolution concept left to compare against) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'participant_id', '00000000-0000-0000-0000-000000000004', 'Coach One is on leave; reassigning to Coach Two.');
reset role;
select metadata as confirm_audit_metadata from admin_audit_log where action = 'designate_challenge_coach' and target_id = :'participant_id' order by created_at desc limit 1 \gset
\echo 'CONFIRM: audit metadata=' :confirm_audit_metadata
select designated_coach_id as confirm_new_coach from challenge_participants where id = :'participant_id' \gset
\echo 'CONFIRM: designated coach after reassignment=' :confirm_new_coach ' (expect Coach Two = 00000000-0000-0000-0000-000000000004)'

\echo '=== Atomic whole-challenge recompute: a SECOND, independent participant (Drew, already registered in 45_registration_and_branch_selection.sql) gets approved; confirm BOTH participants have ledger entries, not just the first ==='
select id as drew_participant_id from challenge_participants where challenge_id = :'challenge_id' and participant_profile_id = '00000000-0000-0000-0000-0000000000a4' \gset

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select designate_challenge_coach(:'drew_participant_id', '00000000-0000-0000-0000-000000000004', 'Assigning Drew''s coach.');
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- Coach Two, Drew's designated coach
select * from submit_challenge_result(:'challenge_id', '00000000-0000-0000-0000-0000000000a4', 90, 'reps', now()) \gset c_
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- Coach One, not the author
select approve_challenge_result(:'c_result_id', 'Confirmed.');
reset role;

select count(distinct participant_profile_id) as confirm_distinct_participants from challenge_points_ledger where challenge_id = :'challenge_id' \gset
\echo 'CONFIRM: distinct participants with ledger entries=' :confirm_distinct_participants ' (expect 2 — proves the recompute reaches every participant, not just the one just approved)'
