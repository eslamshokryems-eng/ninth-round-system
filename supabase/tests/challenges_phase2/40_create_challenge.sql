-- Eligibility-rule validation (now min_age/max_age only), authoritative
-- weight range, and branch isolation across all THREE scopes (BRANCH,
-- GLOBAL, MULTI_BRANCH) — the new scope model this phase introduces.
\set ON_ERROR_STOP off
select id as season_id from challenge_seasons limit 1 \gset

\echo '=== unsupported eligibility rule type (the old active_membership rule) -> must be rejected at creation ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- branch_manager
select * from create_challenge(
  :'season_id', 'Push-Up Challenge', null, 'strength', 'boxing', 'BRANCH', '00000000-0000-0000-0000-00000000000b',
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days',
  '[{"rule_type":"active_membership","value":{}}]'::jsonb
);
reset role;

\echo '=== invalid age value in a min_age rule -> must be rejected at creation, not a raw cast crash ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select * from create_challenge(
  :'season_id', 'Push-Up Challenge', null, 'strength', 'boxing', 'BRANCH', '00000000-0000-0000-0000-00000000000b',
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days',
  '[{"rule_type":"min_age","value":{"age":"not-a-number"}}]'::jsonb
);
reset role;

\echo '=== weight outside the configured range -> clear message naming the actual range ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select * from create_challenge(
  :'season_id', 'Push-Up Challenge', null, 'strength', 'boxing', 'BRANCH', '00000000-0000-0000-0000-00000000000b',
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 99, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days'
);
reset role;

\echo '=== branch isolation: branch_manager attempts GLOBAL scope -> must be rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select * from create_challenge(
  :'season_id', 'Global Challenge', null, 'strength', 'boxing', 'GLOBAL', null,
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days'
);
reset role;

\echo '=== branch isolation: branch_manager attempts MULTI_BRANCH scope -> must be rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select * from create_challenge(
  :'season_id', 'Multi Branch Challenge', null, 'strength', 'boxing', 'MULTI_BRANCH', null,
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days',
  '[]'::jsonb, array['00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c']::uuid[]
);
reset role;

\echo '=== MULTI_BRANCH with an empty branch list -> must be rejected even for super_admin ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- super_admin
select * from create_challenge(
  :'season_id', 'Multi Branch Challenge', null, 'strength', 'boxing', 'MULTI_BRANCH', null,
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days',
  '[]'::jsonb, array[]::uuid[]
);
reset role;

\echo '=== super_admin creates a valid GLOBAL challenge -> success ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select * from create_challenge(
  :'season_id', 'Global Challenge', null, 'strength', 'boxing', 'GLOBAL', null,
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days'
) \gset global_
reset role;
\echo 'CONFIRM: global challenge created, id=' :global_challenge_id

\echo '=== super_admin creates a valid MULTI_BRANCH challenge spanning both branches -> success ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select * from create_challenge(
  :'season_id', 'Multi Branch Challenge', null, 'strength', 'boxing', 'MULTI_BRANCH', null,
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days',
  '[]'::jsonb, array['00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c']::uuid[]
) \gset multi_
reset role;
\echo 'CONFIRM: multi-branch challenge created, id=' :multi_challenge_id
select count(*) as confirm_branch_count from challenge_branches where challenge_id = :'multi_challenge_id' \gset
\echo 'CONFIRM: challenge_branches row count=' :confirm_branch_count ' (expect 2)'

\echo '=== valid BRANCH creation with min_age/max_age eligibility rules (as branch_manager, own branch) -> success ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select * from create_challenge(
  :'season_id', 'Push-Up Challenge', null, 'strength', 'boxing', 'BRANCH', '00000000-0000-0000-0000-00000000000b',
  'COUNT', 'reps', 'HIGHER_IS_BETTER', 3, now(), now() + interval '1 day', now() + interval '2 days', now() + interval '9 days',
  '[{"rule_type":"min_age","value":{"age":18}}, {"rule_type":"max_age","value":{"age":65}}]'::jsonb
) \gset
reset role;

\echo '=== Confirm the eligibility rules were actually inserted ==='
select rule_type, value from challenge_eligibility_rules where challenge_id = :'challenge_id';
