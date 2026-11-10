-- Every registration test for every challenge happens HERE, while each
-- challenge is still in its 'registration_open' window — request_
-- challenge_participation() requires that status exactly, and later
-- files (50/60/70/80) move challenges on to 'active' for submission
-- testing, so no further NEW registration against those same challenges
-- can be exercised through the real RPC after this file runs.
--
-- Covers the new, fully customer-self-service model end to end: a
-- display name is required before registering; branch selection is
-- validated structurally against each of the THREE scopes, never
-- requiring manager approval; age-only eligibility is read directly from
-- profiles.date_of_birth — no membership record is consulted anywhere in
-- this file.
\set ON_ERROR_STOP off
select id as branch_challenge_id from challenges where title = 'Push-Up Challenge' and scope = 'BRANCH' order by created_at desc limit 1 \gset
select id as global_challenge_id from challenges where title = 'Global Challenge' order by created_at desc limit 1 \gset
select id as multi_challenge_id from challenges where title = 'Multi Branch Challenge' order by created_at desc limit 1 \gset

update challenges set status = 'registration_open' where id in (:'branch_challenge_id', :'global_challenge_id', :'multi_challenge_id');

\echo '=== registration blocked before a display name is set ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1'; -- Alex Customer
select * from request_challenge_participation(:'branch_challenge_id', '00000000-0000-0000-0000-00000000000b');
reset role;

\echo '=== Alex, Blair, Casey, Drew each set a display name -> succeeds ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select set_challenge_display_name('Iron Fist');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select set_challenge_display_name('Blair the Racer');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select set_challenge_display_name('Casey No Branch');
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select set_challenge_display_name('Drew the Challenger');
reset role;

\echo '=== GLOBAL: a non-null branchId is rejected — there is nothing to choose ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select * from request_challenge_participation(:'global_challenge_id', '00000000-0000-0000-0000-00000000000b');
reset role;

\echo '=== BRANCH: a null branchId is rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select * from request_challenge_participation(:'branch_challenge_id', null);
reset role;

\echo '=== BRANCH: the WRONG branch (the challenge''s own branch is Main Branch/B) is rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select * from request_challenge_participation(:'branch_challenge_id', '00000000-0000-0000-0000-00000000000c');
reset role;

\echo '=== MULTI_BRANCH: a branch NOT in this challenge''s branch list (Third Branch) is rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select * from request_challenge_participation(:'multi_challenge_id', '00000000-0000-0000-0000-00000000000e');
reset role;

\echo '=== MULTI_BRANCH: a null branchId is rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select * from request_challenge_participation(:'multi_challenge_id', null);
reset role;

\echo '=== MULTI_BRANCH: a branch that IS in this challenge''s list succeeds ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select * from request_challenge_participation(:'multi_challenge_id', '00000000-0000-0000-0000-00000000000c') \gset multi_reg_
reset role;
\echo 'CONFIRM: multi-branch registration succeeded, branch_id=' :multi_reg_branch_id ' (expect Second Branch = 00000000-0000-0000-0000-00000000000c)'

\echo '=== GLOBAL: a null branchId succeeds (Casey — no date of birth, but this challenge has no eligibility rules) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select * from request_challenge_participation(:'global_challenge_id', null) \gset casey_global_
reset role;
\echo 'CONFIRM: Casey''s global registration branch_id=' :casey_global_branch_id ' (expect empty/null) status=' :casey_global_status

\echo '=== GLOBAL: a second participant (Blair) also registers with no branch ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select * from request_challenge_participation(:'global_challenge_id', null) \gset blair_global_
reset role;

\echo '=== BRANCH: Alex registers with her own chosen branch -> auto-approved (adult, passes min_age/max_age) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select * from request_challenge_participation(:'branch_challenge_id', '00000000-0000-0000-0000-00000000000b') \gset alex_branch_
reset role;
\echo 'CONFIRM: Alex''s participant status=' :alex_branch_status 'branch_id=' :alex_branch_branch_id

\echo '=== BRANCH: Alex attempts to register a second time for the SAME challenge -> rejected (already exists) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select * from request_challenge_participation(:'branch_challenge_id', '00000000-0000-0000-0000-00000000000b');
reset role;

\echo '=== BRANCH: Drew (adult) registers for the same challenge -> auto-approved ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select * from request_challenge_participation(:'branch_challenge_id', '00000000-0000-0000-0000-00000000000b') \gset drew_branch_
reset role;
\echo 'CONFIRM: Drew''s participant status=' :drew_branch_status

\echo '=== Age eligibility: a minor is auto-rejected with a clear reason (the Push-Up Challenge requires min_age 18) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2'; -- Blair, born 2018
select * from request_challenge_participation(:'branch_challenge_id', '00000000-0000-0000-0000-00000000000b') \gset blair_branch_
reset role;
\echo 'CONFIRM: Blair''s eligibility_result=' :blair_branch_eligibility_result ' reason=' :blair_branch_eligibility_reason

\echo '=== Age eligibility: a customer with no date of birth on file is auto-rejected with a clear reason ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3'; -- Casey, no date_of_birth
select * from request_challenge_participation(:'branch_challenge_id', '00000000-0000-0000-0000-00000000000b') \gset casey_branch_
reset role;
\echo 'CONFIRM: Casey''s eligibility_result=' :casey_branch_eligibility_result ' reason=' :casey_branch_eligibility_reason
