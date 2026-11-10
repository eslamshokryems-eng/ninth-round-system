-- Internal helpers must not be directly callable by any client role; the
-- business-action RPCs must still work for `authenticated` after the
-- explicit grant/revoke lockdown. resolve_automatic_coach_for_member()/
-- resolve_assigned_coach_for_member() no longer exist at all (Phase 3
-- dropped them — coach assignment is designation-only now), so there is
-- nothing left to privilege-test there; recompute_challenge_points()
-- remains the one internal helper and stays locked down exactly as
-- before.
\set ON_ERROR_STOP off

\echo '=== authenticated calling recompute_challenge_points() directly ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select recompute_challenge_points('00000000-0000-0000-0000-000000000099', 'attacker-controlled reason');
reset role;

\echo '=== anon calling recompute_challenge_points() directly ==='
set role anon;
select recompute_challenge_points('00000000-0000-0000-0000-000000000099', 'attacker-controlled reason');
reset role;

-- Uses Drew's profile id (0000...a4), deliberately NOT Alex's (0000...a1)
-- — 45_registration_and_branch_selection.sql specifically needs Alex to
-- have NO display name yet when it runs, to test that guard. Drew later
-- sets her own real display name in 45 too (a harmless upsert over this
-- one), so there is no leftover state either way.
\echo '=== positive control: authenticated CAN call an actual business-action RPC (set_challenge_display_name) — confirms the grant itself works, not just the revoke ==='
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
select set_challenge_display_name('Privilege Test');
reset role;
select display_name as confirm_display_name_set from challenge_display_names where profile_id = '00000000-0000-0000-0000-0000000000a4' \gset
\echo 'CONFIRM: display name set=' :confirm_display_name_set

\echo '=== anon denied set_challenge_display_name (business RPCs are granted to authenticated only, never anon) ==='
set role anon;
select set_challenge_display_name('Should Not Work');
reset role;
