\set ON_ERROR_STOP off

\echo '=== super_admin creates a season -> must succeed ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select * from create_challenge_season('Winter 2026', null, '2026-12-01', '2027-02-28');
reset role;

\echo '=== branch_manager attempts to create a season -> must be rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select * from create_challenge_season('Rogue Season', null, '2026-12-01', '2027-02-28');
reset role;

\echo '=== L-1: super_admin sets the weight range -> must succeed (grant works) ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select set_challenge_weight_range(1, 15);
reset role;
select value as confirm_max_weight from challenge_settings where key = 'max_weight' \gset
\echo 'CONFIRM: max_weight=' :confirm_max_weight ' (expect 15)'

\echo '=== branch_manager attempts to set the weight range -> must be rejected ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select set_challenge_weight_range(1, 20);
reset role;
select value as confirm_max_weight_unchanged from challenge_settings where key = 'max_weight' \gset
\echo 'CONFIRM: max_weight still=' :confirm_max_weight_unchanged ' (expect 15, not 20)'
