-- ===========================================================================
-- END-TO-END ACCEPTANCE TEST — the whole Challenges workflow, driven
-- exclusively through the real RPCs as the real roles, against the real
-- schema built from the real migrations.
--
-- Cast (from 10_seed_demo.sql): 1 super admin, 1 branch manager, 2 coaches,
-- 12 members, 2 branches.
--
-- Ten steps, in the order a gym would actually run a competition:
--   STEP 1   super admin creates a season
--   STEP 2   super admin sets the competition weight range
--   STEP 3   branch manager creates a BRANCH competition, with age rules
--   STEP 4   super admin creates a GLOBAL competition
--   STEP 5   both competitions open for registration; members join; an
--            under-age and an over-age member are refused by the rules
--   STEP 6   coaches are designated for each participant
--   STEP 7   competitions go active; coaches submit results
--   STEP 8   the branch manager approves and rejects results
--   STEP 9   a coach requests a correction; the manager approves it
--   STEP 10  the BRANCH competition is completed; the leaderboards are read
--            as an ordinary member
--
-- Every step asserts, and every assertion resolves to a grep-able CONFIRM
-- marker computed in SQL. Running this leaves the database in exactly the
-- state the browser demo needs: one completed competition with final
-- standings, one active competition mid-review, and one open for
-- registration so the member journey can be walked in the UI.
-- ===========================================================================
\set ON_ERROR_STOP off
\pset pager off

\set SUPER    '''aea7db27-3aaa-4701-aed2-f1b49127bdda'''
\set MANAGER  '''aaaa0001-0000-4000-8000-000000000001'''
\set COACH1   '''aaaa0002-0000-4000-8000-000000000002'''
\set COACH2   '''aaaa0003-0000-4000-8000-000000000003'''
\set NASR     '''11111111-1111-1111-1111-111111111111'''
\set MAADI    '''22222222-2222-2222-2222-222222222222'''

-- =========================================================================
\echo ''
\echo '########## STEP 1 — the super admin creates a season ##########'
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select create_challenge_season('Winter 2026', 'The first competitive season.', date '2026-11-01', date '2027-02-28')::text as season \gset
reset role;
select case when count(*) = 1 then 'SEASON_CREATED' else 'SEASON_MISSING' end as c1
  from challenge_seasons where id = :'season' \gset
\echo 'CONFIRM: STEP 1 season=' :c1

\echo ''
\echo '--- and a MEMBER cannot create one ---'
set role authenticated;
set request.jwt.claim.sub = 'bbbb0001-0000-4000-8000-000000000001';
select create_challenge_season('Member Season', null, current_date, current_date + 30);
reset role;
select case when count(*) = 0 then 'MEMBER_REFUSED' else 'MEMBER_CREATED_SEASON' end as c1b
  from challenge_seasons where name = 'Member Season' \gset
\echo 'CONFIRM: STEP 1 member refused=' :c1b

-- =========================================================================
\echo ''
\echo '########## STEP 2 — the super admin sets the weight range ##########'
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select set_challenge_weight_range(1, 20);
reset role;
select case when min(case when key = 'min_weight' then value end) = '1'
             and min(case when key = 'max_weight' then value end) = '20'
            then 'RANGE_1_20' else 'RANGE_WRONG' end as c2
  from challenge_settings where key in ('min_weight', 'max_weight') \gset
\echo 'CONFIRM: STEP 2 weight range=' :c2

\echo ''
\echo '--- and a competition outside that range is refused ---'
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select create_challenge(
  :'season', 'Too Heavy', null, 'strength'::challenge_category, 'ninth_round'::program_type,
  'GLOBAL'::challenge_scope, null, 'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 99,
  now(), now() + interval '7 days', now(), now() + interval '30 days', '[]'::jsonb, null);
reset role;
select case when count(*) = 0 then 'OUT_OF_RANGE_REFUSED' else 'OUT_OF_RANGE_CREATED' end as c2b
  from challenges where title = 'Too Heavy' \gset
\echo 'CONFIRM: STEP 2 out-of-range refused=' :c2b

-- =========================================================================
\echo ''
\echo '########## STEP 3 — the branch manager creates a BRANCH competition ##########'
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select challenge_id::text as branch_challenge from create_challenge(
  :'season', 'Nasr City Push-Up Championship',
  'Most clean push-ups in two minutes. Judged by your assigned coach.',
  'strength'::challenge_category, 'ninth_round'::program_type,
  'BRANCH'::challenge_scope, :NASR,
  'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 10,
  now() - interval '2 days', now() + interval '14 days',
  now() - interval '1 day',  now() + interval '21 days',
  '[{"rule_type":"min_age","value":{"age":16}},{"rule_type":"max_age","value":{"age":39}}]'::jsonb,
  null
) \gset
reset role;
select case when status = 'draft' then 'CREATED_AS_DRAFT' else 'CREATED_AS_' || upper(status::text) end as c3
  from challenges where id = :'branch_challenge' \gset
\echo 'CONFIRM: STEP 3 branch competition=' :c3
select case when count(*) = 2 then 'TWO_AGE_RULES' else 'RULES(' || count(*) || ')' end as c3b
  from challenge_eligibility_rules where challenge_id = :'branch_challenge' \gset
\echo 'CONFIRM: STEP 3 eligibility rules=' :c3b

\echo ''
\echo '--- a branch manager cannot create a GLOBAL competition, nor one for another branch ---'
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select create_challenge(
  :'season', 'Manager Global Attempt', null, 'boxing'::challenge_category, 'boxing'::program_type,
  'GLOBAL'::challenge_scope, null, 'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 10,
  now(), now() + interval '7 days', now(), now() + interval '30 days', '[]'::jsonb, null);
select create_challenge(
  :'season', 'Manager Other Branch Attempt', null, 'boxing'::challenge_category, 'boxing'::program_type,
  'BRANCH'::challenge_scope, :MAADI, 'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 10,
  now(), now() + interval '7 days', now(), now() + interval '30 days', '[]'::jsonb, null);
reset role;
select case when count(*) = 0 then 'SCOPE_LIMITS_HELD' else 'SCOPE_LIMITS_BROKEN' end as c3c
  from challenges where title in ('Manager Global Attempt', 'Manager Other Branch Attempt') \gset
\echo 'CONFIRM: STEP 3 branch-manager scope limits=' :c3c

-- =========================================================================
\echo ''
\echo '########## STEP 4 — the super admin creates a GLOBAL competition ##########'
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select challenge_id::text as global_challenge from create_challenge(
  :'season', 'All-Branch Plank Hold',
  'Longest plank across every branch. Lower time is NOT better here — longer is.',
  'hybrid_fitness'::challenge_category, 'ninth_round'::program_type,
  'GLOBAL'::challenge_scope, null,
  'TIME'::challenge_measurement_type, 'seconds',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 15,
  now() - interval '2 days', now() + interval '14 days',
  now() - interval '1 day',  now() + interval '21 days',
  '[]'::jsonb, null
) \gset
-- A third competition, left open for registration so the member journey can
-- still be walked in the browser after this script has run.
select challenge_id::text as open_challenge from create_challenge(
  :'season', 'Winter Kickboxing Round Sprint',
  'Most scoring strikes in one 3-minute round. Registration is open now.',
  'kickboxing'::challenge_category, 'kickboxing'::program_type,
  'GLOBAL'::challenge_scope, null,
  'COUNT'::challenge_measurement_type, 'strikes',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 12,
  now() - interval '1 day', now() + interval '30 days',
  now() + interval '31 days', now() + interval '60 days',
  '[]'::jsonb, null
) \gset
reset role;
-- Eligibility rules are added AFTER creation, through add_challenge_eligibility_rule
-- (20261115), while the competition is still a draft. Before that RPC existed
-- this step had to insert the rows directly as the table owner.
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select add_challenge_eligibility_rule(:'global_challenge', 'min_age', 16);
select add_challenge_eligibility_rule(:'global_challenge', 'max_age', 39);
reset role;
select case when count(*) = 2 then 'TWO_RULES_ADDED_BY_RPC' else 'RULES(' || count(*) || ')' end as c4r
  from challenge_eligibility_rules where challenge_id = :'global_challenge' \gset
\echo 'CONFIRM: STEP 4 rules added through the RPC=' :c4r

\echo '--- a duplicate type, min above max, and an out-of-range age are all refused ---'
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select add_challenge_eligibility_rule(:'global_challenge', 'min_age', 18);
select add_challenge_eligibility_rule(:'global_challenge', 'max_age', 200);
reset role;
select case when count(*) = 2 then 'BAD_RULES_REFUSED' else 'RULES(' || count(*) || ')' end as c4r2
  from challenge_eligibility_rules where challenge_id = :'global_challenge' \gset
\echo 'CONFIRM: STEP 4 invalid rules=' :c4r2

\echo '--- a branch manager cannot change a GLOBAL competition''s rules, nor a coach or member any ---'
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select add_challenge_eligibility_rule(:'open_challenge', 'min_age', 12);
set request.jwt.claim.sub = :COACH1;
select add_challenge_eligibility_rule(:'open_challenge', 'min_age', 12);
set request.jwt.claim.sub = 'bbbb0001-0000-4000-8000-000000000001';
select add_challenge_eligibility_rule(:'open_challenge', 'min_age', 12);
reset role;
select case when count(*) = 0 then 'UNAUTHORIZED_RULES_REFUSED' else 'RULE_WRITTEN' end as c4r3
  from challenge_eligibility_rules where challenge_id = :'open_challenge' \gset
\echo 'CONFIRM: STEP 4 unauthorized rule changes=' :c4r3

select case when count(*) = 2 then 'TWO_GLOBAL_CREATED' else 'GLOBAL(' || count(*) || ')' end as c4
  from challenges where id in (:'global_challenge', :'open_challenge') \gset
\echo 'CONFIRM: STEP 4 global competitions=' :c4

-- =========================================================================
\echo ''
\echo '########## STEP 5 — registration opens; members join ##########'
-- The lifecycle RPC added by 20261114000001. Before it existed, nothing in
-- the module could move a competition out of draft.
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select set_challenge_status(:'branch_challenge', 'published', 'Announcing the competition.');
select set_challenge_status(:'branch_challenge', 'registration_open', 'Opening entries for the branch.');
set request.jwt.claim.sub = :SUPER;
select set_challenge_status(:'global_challenge', 'published', 'Announcing the competition.');
select set_challenge_status(:'global_challenge', 'registration_open', 'Opening entries across all branches.');
select set_challenge_status(:'open_challenge', 'published', 'Announcing the competition.');
select set_challenge_status(:'open_challenge', 'registration_open', 'Opening entries across all branches.');
-- skipping a step is refused: a draft cannot jump straight to active. The
-- draft is created in its OWN statement first — if creation and the refused
-- transition shared one statement, the error would roll the creation back
-- too and leave nothing to inspect.
select challenge_id::text as skip_probe from create_challenge(:'season', 'Skip Probe', null, 'boxing'::challenge_category, 'boxing'::program_type,
  'GLOBAL'::challenge_scope, null, 'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 10, now(), now() + interval '7 days', now(), now() + interval '30 days', '[]'::jsonb, null) \gset
select set_challenge_status(:'skip_probe', 'active', 'skip attempt');
reset role;
select case when status = 'draft' then 'STEP_SKIP_REFUSED' else 'STEP_SKIPPED_TO_' || upper(status::text) end as c5s
  from challenges where title = 'Skip Probe' \gset
\echo 'CONFIRM: STEP 5 skipping a lifecycle step=' :c5s
select case when count(*) = 3 then 'ALL_THREE_OPEN' else 'OPEN(' || count(*) || ')' end as c5
  from challenges where id in (:'branch_challenge', :'global_challenge', :'open_challenge')
   and status = 'registration_open' \gset
\echo 'CONFIRM: STEP 5 registration opened=' :c5

\echo ''
\echo '--- a coach cannot open or close a competition ---'
set role authenticated;
set request.jwt.claim.sub = :COACH1;
select set_challenge_status(:'branch_challenge', 'active', 'coach attempt');
reset role;
select case when status = 'registration_open' then 'COACH_REFUSED' else 'COACH_CHANGED_STATUS' end as c5b
  from challenges where id = :'branch_challenge' \gset
\echo 'CONFIRM: STEP 5 coach refused=' :c5b

\echo ''
\echo '--- the six Nasr City members join the BRANCH competition ---'
do $$
declare r record;
begin
  for r in select id from public.profiles
            where role = 'member' and branch_id = '11111111-1111-1111-1111-111111111111' order by id
  loop
    execute 'set local role authenticated';
    execute format('set local request.jwt.claim.sub = %L', r.id);
    begin
      perform public.request_challenge_participation(
        (select id from public.challenges where title = 'Nasr City Push-Up Championship'),
        '11111111-1111-1111-1111-111111111111');
    exception when others then
      raise notice 'join refused for %: %', r.id, sqlerrm;
    end;
    execute 'reset role';
  end loop;
end $$;
select case when count(*) = 6 then 'SIX_JOINED' else 'JOINED(' || count(*) || ')' end as c5c
  from challenge_participants where challenge_id = :'branch_challenge' \gset
\echo 'CONFIRM: STEP 5 branch participants=' :c5c
select case when count(*) = 6 then 'ALL_SIX_ELIGIBLE' else 'ELIGIBLE(' || count(*) || ')' end as c5d
  from challenge_participants where challenge_id = :'branch_challenge' and status = 'approved' \gset
\echo 'CONFIRM: STEP 5 eligible in branch competition=' :c5d

\echo ''
\echo '--- all twelve members join the GLOBAL competition; the under-16 and over-39 are refused BY THE RULES ---'
do $$
declare r record;
begin
  for r in select id from public.profiles where role = 'member' order by id
  loop
    execute 'set local role authenticated';
    execute format('set local request.jwt.claim.sub = %L', r.id);
    begin
      perform public.request_challenge_participation(
        (select id from public.challenges where title = 'All-Branch Plank Hold'), null);
    exception when others then
      raise notice 'global join refused for %: %', r.id, sqlerrm;
    end;
    execute 'reset role';
  end loop;
end $$;
select case when count(*) = 12 then 'TWELVE_REQUESTED' else 'REQUESTED(' || count(*) || ')' end as c5e
  from challenge_participants where challenge_id = :'global_challenge' \gset
\echo 'CONFIRM: STEP 5 global participation requests=' :c5e
select case when count(*) = 10 then 'TEN_ELIGIBLE' else 'ELIGIBLE(' || count(*) || ')' end as c5f
  from challenge_participants where challenge_id = :'global_challenge' and status = 'approved' \gset
\echo 'CONFIRM: STEP 5 eligible in global competition=' :c5f
select case when count(*) = 2 and bool_and(eligibility_reason is not null)
            then 'TWO_REJECTED_WITH_REASONS' else 'REJECTED(' || count(*) || ')' end as c5g
  from challenge_participants where challenge_id = :'global_challenge' and status = 'rejected' \gset
\echo 'CONFIRM: STEP 5 age-ineligible entries=' :c5g
select string_agg(pr.full_name || ' -> ' || cp.eligibility_reason, ' | ' order by pr.full_name) as c5h
  from challenge_participants cp join profiles pr on pr.id = cp.participant_profile_id
 where cp.challenge_id = :'global_challenge' and cp.status = 'rejected' \gset
\echo 'CONFIRM: STEP 5 refusal reasons=' :c5h

-- =========================================================================
\echo ''
\echo '########## STEP 6 — coaches are designated ##########'
do $$
declare r record; v_coach uuid;
begin
  for r in select cp.id, pr.branch_id
             from public.challenge_participants cp
             join public.profiles pr on pr.id = cp.participant_profile_id
            where cp.status = 'approved'
  loop
    v_coach := case when r.branch_id = '11111111-1111-1111-1111-111111111111'
                    then 'aaaa0002-0000-4000-8000-000000000002'::uuid
                    else 'aaaa0003-0000-4000-8000-000000000003'::uuid end;
    execute 'set local role authenticated';
    -- A participant with no branch (a GLOBAL entry) can only be assigned a
    -- coach by a super admin: there is no home branch to scope a branch
    -- manager's authority against.
    execute format('set local request.jwt.claim.sub = %L',
      case when (select branch_id from public.challenge_participants where id = r.id) is null
           then 'aea7db27-3aaa-4701-aed2-f1b49127bdda'
           else 'aaaa0001-0000-4000-8000-000000000001' end);
    begin
      perform public.designate_challenge_coach(r.id, v_coach, 'Assigned by branch for the competition.');
    exception when others then
      raise notice 'designation failed for %: %', r.id, sqlerrm;
    end;
    execute 'reset role';
  end loop;
end $$;
select case when count(*) = 0 then 'ALL_APPROVED_HAVE_A_COACH' else 'WITHOUT_COACH(' || count(*) || ')' end as c6
  from challenge_participants where status = 'approved' and designated_coach_id is null \gset
\echo 'CONFIRM: STEP 6 coach designation=' :c6

\echo ''
\echo '--- an out-of-branch manager cannot designate, and a DEACTIVATED coach cannot be designated ---'
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select designate_challenge_coach(
  (select cp.id from challenge_participants cp join profiles pr on pr.id = cp.participant_profile_id
    where cp.challenge_id = :'branch_challenge' and pr.branch_id = :NASR limit 1),
  :COACH2, 'wrong branch coach');
reset role;
select case when count(*) = 0 then 'CROSS_BRANCH_REFUSED' else 'CROSS_BRANCH_ALLOWED' end as c6b
  from challenge_participants where challenge_id = :'branch_challenge' and designated_coach_id = :COACH2 \gset
\echo 'CONFIRM: STEP 6 cross-branch designation=' :c6b

set request.jwt.claim.role = 'service_role';
update profiles set is_active = false where id = :COACH1;
reset request.jwt.claim.role;
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select designate_challenge_coach(
  (select cp.id from challenge_participants cp where cp.challenge_id = :'branch_challenge' limit 1),
  :COACH1, 'deactivated coach');
reset role;
set request.jwt.claim.role = 'service_role';
update profiles set is_active = true where id = :COACH1;
reset request.jwt.claim.role;
\echo '(the refusal text above is the assertion for the deactivated-coach case)'

-- =========================================================================
\echo ''
\echo '########## STEP 7 — competitions go active; coaches submit results ##########'
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select set_challenge_status(:'branch_challenge', 'active', 'Competition week has started.');
set request.jwt.claim.sub = :SUPER;
select set_challenge_status(:'global_challenge', 'active', 'Competition week has started.');
reset role;
select case when count(*) = 2 then 'BOTH_ACTIVE' else 'ACTIVE(' || count(*) || ')' end as c7
  from challenges where id in (:'branch_challenge', :'global_challenge') and status = 'active' \gset
\echo 'CONFIRM: STEP 7 competitions active=' :c7

\echo ''
\echo '--- each designated coach records their own athletes'' results ---'
do $$
declare r record; v_value numeric; i int := 0;
begin
  for r in select cp.challenge_id, cp.participant_profile_id, cp.designated_coach_id, c.measurement_unit
             from public.challenge_participants cp
             join public.challenges c on c.id = cp.challenge_id
            where cp.status = 'approved' and cp.designated_coach_id is not null
            order by cp.challenge_id, cp.participant_profile_id
  loop
    i := i + 1;
    v_value := 30 + (i * 3) % 47;          -- spread the scores so ranks differ
    execute 'set local role authenticated';
    execute format('set local request.jwt.claim.sub = %L', r.designated_coach_id);
    begin
      perform public.submit_challenge_result(
        r.challenge_id, r.participant_profile_id, v_value, r.measurement_unit, now() - interval '1 hour');
    exception when others then
      raise notice 'submit failed for %: %', r.participant_profile_id, sqlerrm;
    end;
    execute 'reset role';
  end loop;
end $$;
select case when count(*) = (select count(*) from challenge_participants where status = 'approved' and designated_coach_id is not null)
            then 'EVERY_ATHLETE_HAS_A_RESULT' else 'RESULTS(' || count(*) || ')' end as c7b
  from challenge_results where corrects_result_id is null \gset
\echo 'CONFIRM: STEP 7 submitted results=' :c7b
select case when count(*) = 0 then 'ALL_PENDING' else 'NOT_PENDING(' || count(*) || ')' end as c7c
  from challenge_results where status <> 'pending' \gset
\echo 'CONFIRM: STEP 7 every new result starts pending=' :c7c

\echo ''
\echo '--- a coach cannot record a result for someone else''s athlete, and a MEMBER cannot record their own ---'
set role authenticated;
set request.jwt.claim.sub = :COACH2;
select submit_challenge_result(:'branch_challenge',
  (select participant_profile_id from challenge_participants where challenge_id = :'branch_challenge'
     and designated_coach_id = :COACH1 limit 1), 999, 'reps', now());
set request.jwt.claim.sub = 'bbbb0001-0000-4000-8000-000000000001';
select submit_challenge_result(:'branch_challenge', 'bbbb0001-0000-4000-8000-000000000001', 999, 'reps', now());
reset role;
select case when count(*) = 0 then 'UNAUTHORIZED_SUBMISSIONS_REFUSED' else 'ACCEPTED(' || count(*) || ')' end as c7d
  from challenge_results where result_value = 999 \gset
\echo 'CONFIRM: STEP 7 unauthorized submissions=' :c7d

-- =========================================================================
\echo ''
\echo '########## STEP 8 — the branch manager reviews ##########'
-- Approve everything in the BRANCH competition except one, which is
-- rejected with a reason, so the UI has both outcomes to show.
do $$
declare r record; i int := 0;
begin
  for r in select id from public.challenge_results
            where challenge_id = (select id from public.challenges where title = 'Nasr City Push-Up Championship')
              and status = 'pending' order by created_at
  loop
    i := i + 1;
    execute 'set local role authenticated';
    execute format('set local request.jwt.claim.sub = %L', 'aaaa0001-0000-4000-8000-000000000001');
    begin
      if i = 1 then
        perform public.reject_challenge_result(r.id, 'Form broke on the last ten reps — please re-attempt.');
      else
        perform public.approve_challenge_result(r.id, null);
      end if;
    exception when others then
      raise notice 'review failed for %: %', r.id, sqlerrm;
    end;
    execute 'reset role';
  end loop;
end $$;
select case when count(*) = 1 then 'ONE_REJECTED_WITH_A_REASON' else 'REJECTED(' || count(*) || ')' end as c8
  from challenge_results r
  join challenge_result_reviews v on v.result_id = r.id
 where r.challenge_id = :'branch_challenge' and r.status = 'rejected' and v.notes is not null \gset
\echo 'CONFIRM: STEP 8 rejection=' :c8
select case when count(*) = 5 then 'FIVE_APPROVED' else 'APPROVED(' || count(*) || ')' end as c8b
  from challenge_results where challenge_id = :'branch_challenge' and status = 'approved' \gset
\echo 'CONFIRM: STEP 8 approvals=' :c8b
-- The ledger is append-only: every recompute writes a fresh set of deltas
-- that net against the previous ones, so a ROW COUNT means nothing here.
-- What matters is the NET total per athlete, which is what the season
-- leaderboards sum.
select case when count(*) = 5 then 'FIVE_ATHLETES_SCORED' else 'SCORED(' || count(*) || ')' end as c8c
  from (select participant_profile_id from challenge_points_ledger
         where challenge_id = :'branch_challenge'
         group by participant_profile_id having sum(points_delta) > 0) s \gset
\echo 'CONFIRM: STEP 8 points awarded=' :c8c
select case when count(*) = 0 then 'REJECTED_ATHLETE_SCORED_NOTHING' else 'REJECTED_ATHLETE_SCORED' end as c8c2
  from (select l.participant_profile_id from challenge_points_ledger l
         join challenge_results r on r.challenge_id = l.challenge_id
                                 and r.participant_profile_id = l.participant_profile_id
         where l.challenge_id = :'branch_challenge' and r.status = 'rejected'
         group by l.participant_profile_id having sum(l.points_delta) > 0) s \gset
\echo 'CONFIRM: STEP 8 the rejected athlete=' :c8c2

\echo ''
\echo '--- H-2: in a GLOBAL competition a COACH may not review; a manager or admin may ---'
set role authenticated;
set request.jwt.claim.sub = :COACH2;
select approve_challenge_result(
  (select id from challenge_results where challenge_id = :'global_challenge' and status = 'pending' limit 1), null);
reset role;
select case when count(*) = 0 then 'GLOBAL_COACH_REFUSED' else 'GLOBAL_COACH_APPROVED' end as c8d
  from challenge_results where challenge_id = :'global_challenge' and status = 'approved' \gset
\echo 'CONFIRM: STEP 8 GLOBAL review by a coach=' :c8d

do $$
declare r record;
begin
  for r in select id from public.challenge_results
            where challenge_id = (select id from public.challenges where title = 'All-Branch Plank Hold')
              and status = 'pending' order by created_at
  loop
    execute 'set local role authenticated';
    execute format('set local request.jwt.claim.sub = %L', 'aaaa0001-0000-4000-8000-000000000001');
    begin
      perform public.approve_challenge_result(r.id, null);
    exception when others then
      raise notice 'global review failed for %: %', r.id, sqlerrm;
    end;
    execute 'reset role';
  end loop;
end $$;
select case when count(*) = 10 then 'TEN_APPROVED_GLOBALLY' else 'GLOBAL_APPROVED(' || count(*) || ')' end as c8e
  from challenge_results where challenge_id = :'global_challenge' and status = 'approved' \gset
\echo 'CONFIRM: STEP 8 GLOBAL review by the branch manager=' :c8e

-- =========================================================================
\echo ''
\echo '########## STEP 9 — a correction is requested and approved ##########'
select r.id as correct_target, r.participant_profile_id as correct_athlete, r.result_value::text as correct_old
  from challenge_results r
 where r.challenge_id = :'branch_challenge' and r.status = 'approved' and r.superseded_by_result_id is null
 order by r.created_at limit 1 \gset
select designated_coach_id as correct_coach from challenge_participants
 where challenge_id = :'branch_challenge' and participant_profile_id = :'correct_athlete' \gset

set role authenticated;
set request.jwt.claim.sub = :'correct_coach';
select request_challenge_result_correction(:'correct_target', 77, 'reps', now() - interval '30 minutes')::text as correction \gset
reset role;
select case when status = 'correction_pending' then 'CORRECTION_PENDING' else 'STATUS_' || upper(status::text) end as c9
  from challenge_results where id = :'correction' \gset
\echo 'CONFIRM: STEP 9 correction requested=' :c9

\echo ''
\echo '--- the author cannot approve their own correction ---'
set role authenticated;
set request.jwt.claim.sub = :'correct_coach';
select approve_challenge_result_correction(:'correction', null);
reset role;
select case when status = 'correction_pending' then 'SELF_REVIEW_REFUSED' else 'SELF_REVIEW_ALLOWED' end as c9b
  from challenge_results where id = :'correction' \gset
\echo 'CONFIRM: STEP 9 self-review of a correction=' :c9b

set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select approve_challenge_result_correction(:'correction', 'Re-counted from the video.');
reset role;
select case when status = 'approved' and result_value = 77 then 'CORRECTION_APPROVED' else 'STATUS_' || upper(status::text) end as c9c
  from challenge_results where id = :'correction' \gset
\echo 'CONFIRM: STEP 9 correction approved=' :c9c
-- There is no 'superseded' value in challenge_result_status (the enum is
-- pending / approved / rejected / correction_pending). The original row
-- KEEPS status 'approved' and is marked by superseded_by_result_id, which
-- is what takes it off the leaderboard — every read path filters on
-- `superseded_by_result_id is null`. Asserting the real invariant.
select case when superseded_by_result_id = :'correction' and status = 'approved'
            then 'ORIGINAL_MARKED_SUPERSEDED'
            else 'ORIGINAL_' || upper(status::text) || '/' || coalesce(superseded_by_result_id::text, 'not-superseded') end as c9d
  from challenge_results where id = :'correct_target' \gset
\echo 'CONFIRM: STEP 9 the original result=' :c9d

\echo ''
\echo '--- and the corrected value, not the original, is what the standings show ---'
set role authenticated;
set request.jwt.claim.sub = 'bbbb0012-0000-4000-8000-000000000012';
select case when count(*) = 1 then 'CORRECTED_VALUE_ON_BOARD' else 'ORIGINAL_VALUE_ON_BOARD' end as c9e
  from challenge_leaderboard
 where challenge_id = :'branch_challenge'
   and participant_profile_id = :'correct_athlete' and result_value = 77 \gset
select case when count(*) = 0 then 'SUPERSEDED_VALUE_GONE' else 'SUPERSEDED_VALUE_STILL_THERE' end as c9f
  from challenge_leaderboard
 where challenge_id = :'branch_challenge'
   and participant_profile_id = :'correct_athlete' and result_value::text = :'correct_old' \gset
reset role;
\echo 'CONFIRM: STEP 9 the standings show=' :c9e
\echo 'CONFIRM: STEP 9 the old value=' :c9f

-- =========================================================================
\echo ''
\echo '########## STEP 10 — the competition is completed; the standings are read ##########'
set role authenticated;
set request.jwt.claim.sub = :MANAGER;
select set_challenge_status(:'branch_challenge', 'completed', 'Final standings published.');
reset role;
select case when status = 'completed' then 'COMPLETED' else 'STATUS_' || upper(status::text) end as c10
  from challenges where id = :'branch_challenge' \gset
\echo 'CONFIRM: STEP 10 competition=' :c10

\echo ''
\echo '--- a completed competition cannot be reopened ---'
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select set_challenge_status(:'branch_challenge', 'registration_open', 'reopen attempt');
select set_challenge_status(:'branch_challenge', 'active', 'reactivate attempt');
reset role;
select case when status = 'completed' then 'STILL_COMPLETED' else 'REOPENED' end as c10b
  from challenges where id = :'branch_challenge' \gset
\echo 'CONFIRM: STEP 10 reopen attempts=' :c10b

\echo ''
\echo '--- the standings, read as an ORDINARY MEMBER who is not in this competition ---'
set role authenticated;
set request.jwt.claim.sub = 'bbbb0012-0000-4000-8000-000000000012';   -- the over-39 member, in no competition
select case when count(*) = 5 then 'FIVE_RANKED' else 'RANKED(' || count(*) || ')' end as c10c
  from challenge_leaderboard where challenge_id = :'branch_challenge' \gset
select case when count(*) = 0 then 'NO_DUPLICATE_RANKS' else 'DUPLICATE_RANKS' end as c10d
  from (select overall_rank from challenge_leaderboard where challenge_id = :'branch_challenge'
        group by overall_rank having count(*) > 1) d \gset
select case when bool_and(display_name is not null and display_name <> '') then 'ALL_NAMED' else 'MISSING_NAMES' end as c10e
  from challenge_leaderboard where challenge_id = :'branch_challenge' \gset
select case when count(*) > 0 then 'SEASON_OVERALL_POPULATED' else 'SEASON_OVERALL_EMPTY' end as c10f
  from challenge_season_leaderboard_overall where season_id = :'season' \gset
select case when count(*) > 0 then 'SEASON_BY_BRANCH_POPULATED' else 'SEASON_BY_BRANCH_EMPTY' end as c10g
  from challenge_season_leaderboard_by_branch where season_id = :'season' \gset
select case when count(*) = 0 then 'NO_OTHER_PARTICIPANT_ROWS' else 'LEAKED(' || count(*) || ')' end as c10h
  from challenge_participants where participant_profile_id <> 'bbbb0012-0000-4000-8000-000000000012' \gset
select case when count(*) = 0 then 'NO_STAFF_ON_THE_BOARD' else 'STAFF_ON_BOARD' end as c10i
  from challenge_leaderboard lb join profiles pr on pr.id = lb.participant_profile_id
 where pr.role <> 'member' \gset
reset role;
\echo 'CONFIRM: STEP 10 challenge leaderboard rows=' :c10c
\echo 'CONFIRM: STEP 10 rank uniqueness=' :c10d
\echo 'CONFIRM: STEP 10 display names=' :c10e
\echo 'CONFIRM: STEP 10 season overall leaderboard=' :c10f
\echo 'CONFIRM: STEP 10 season by-branch leaderboard=' :c10g
\echo 'CONFIRM: STEP 10 other people''s raw participant rows=' :c10h
\echo 'CONFIRM: STEP 10 staff on the leaderboard=' :c10i

\echo ''
\echo '--- the final standings, in order ---'
set role authenticated;
set request.jwt.claim.sub = 'bbbb0012-0000-4000-8000-000000000012';
select overall_rank as "#", display_name as athlete, result_value as score
  from challenge_leaderboard where challenge_id = :'branch_challenge' order by overall_rank;
reset role;

\echo ''
\echo '########## STEP 11 — rejected result resubmission, and the audit trail ##########'
-- Runs inside a transaction that is ROLLED BACK, so the demo data the browser
-- needs is left exactly as it was. Expected refusals sit inside savepoints: a
-- raised exception aborts the surrounding transaction until the savepoint is
-- rolled back to, which would otherwise discard everything after it.
begin;
set role authenticated;
set request.jwt.claim.sub = :SUPER;
select challenge_id::text as rs_ch from create_challenge(
  :'season', 'Resubmission Probe', null, 'strength'::challenge_category, 'ninth_round'::program_type,
  'BRANCH'::challenge_scope, :NASR, 'COUNT'::challenge_measurement_type, 'reps',
  'HIGHER_IS_BETTER'::challenge_scoring_direction, 10,
  now() - interval '1 day', now() + interval '14 days', now() - interval '1 day', now() + interval '21 days', '[]'::jsonb, null) \gset
select set_challenge_status(:'rs_ch', 'published', 'probe');
select set_challenge_status(:'rs_ch', 'registration_open', 'probe');
set request.jwt.claim.sub = 'bbbb0001-0000-4000-8000-000000000001';
select participant_id::text as rs_part from request_challenge_participation(:'rs_ch', :NASR) \gset
set request.jwt.claim.sub = :MANAGER;
select designate_challenge_coach(:'rs_part', :COACH1, 'probe');
select set_challenge_status(:'rs_ch', 'active', 'probe');

-- coach submits; a second ORIGINAL while the first is pending is refused
set request.jwt.claim.sub = :COACH1;
select result_id::text as rs_r1 from submit_challenge_result(:'rs_ch', 'bbbb0001-0000-4000-8000-000000000001', 40, 'reps', now()) \gset
savepoint sp;
select submit_challenge_result(:'rs_ch', 'bbbb0001-0000-4000-8000-000000000001', 41, 'reps', now());
rollback to savepoint sp;
select case when count(*) = 1 then 'ONE_PENDING_ORIGINAL' else 'ORIGINALS(' || count(*) || ')' end as c11a
  from challenge_results where challenge_id = :'rs_ch' and corrects_result_id is null \gset
\echo 'CONFIRM: STEP 11 a second original while one is pending=' :c11a

-- manager rejects with a reason
set request.jwt.claim.sub = :MANAGER;
select reject_challenge_result(:'rs_r1', 'Form broke on the last ten reps.');
reset role;
select status::text as c11b from challenge_results where id = :'rs_r1' \gset
\echo 'CONFIRM: STEP 11 first result after rejection=' :c11b

-- the coach submits a CORRECTED result: allowed, because a rejected original is not live
set role authenticated;
set request.jwt.claim.sub = :COACH1;
select result_id::text as rs_r2 from submit_challenge_result(:'rs_ch', 'bbbb0001-0000-4000-8000-000000000001', 45, 'reps', now()) \gset
reset role;
select case when count(*) = 2 and count(*) filter (where status = 'rejected') = 1 and count(*) filter (where status = 'pending') = 1
            then 'REJECTED_KEPT_AND_NEW_PENDING' else 'STATE(' || count(*) || ')' end as c11c
  from challenge_results where challenge_id = :'rs_ch' and corrects_result_id is null \gset
\echo 'CONFIRM: STEP 11 resubmission after rejection=' :c11c

-- nobody else may resubmit for the athlete
set role authenticated;
savepoint sp; set request.jwt.claim.sub = :MANAGER;
select submit_challenge_result(:'rs_ch', 'bbbb0001-0000-4000-8000-000000000001', 99, 'reps', now());
rollback to savepoint sp;
savepoint sp; set request.jwt.claim.sub = :COACH2;
select submit_challenge_result(:'rs_ch', 'bbbb0001-0000-4000-8000-000000000001', 99, 'reps', now());
rollback to savepoint sp;
savepoint sp; set request.jwt.claim.sub = 'bbbb0001-0000-4000-8000-000000000001';
select submit_challenge_result(:'rs_ch', 'bbbb0001-0000-4000-8000-000000000001', 99, 'reps', now());
rollback to savepoint sp;
reset role;
select case when count(*) = 0 then 'NOBODY_ELSE_COULD' else 'EXTRA_RESULT' end as c11d
  from challenge_results where challenge_id = :'rs_ch' and result_value = 99 \gset
\echo 'CONFIRM: STEP 11 resubmission by a manager, another coach or the athlete=' :c11d

-- manager approves the corrected result; the coach cannot review their own
set role authenticated;
savepoint sp; set request.jwt.claim.sub = :COACH1;
select approve_challenge_result(:'rs_r2', null);
rollback to savepoint sp;
set request.jwt.claim.sub = :MANAGER;
select approve_challenge_result(:'rs_r2', null);
-- once an original is APPROVED, a further original is refused: corrections only
set request.jwt.claim.sub = :COACH1;
savepoint sp;
select submit_challenge_result(:'rs_ch', 'bbbb0001-0000-4000-8000-000000000001', 50, 'reps', now());
rollback to savepoint sp;
reset role;
select case when (select status from challenge_results where id = :'rs_r2') = 'approved'
             and (select status from challenge_results where id = :'rs_r1') = 'rejected'
             and (select count(*) from challenge_results where challenge_id = :'rs_ch' and result_value = 50) = 0
            then 'APPROVED_AND_HISTORY_KEPT' else 'WRONG' end as c11e
  from (select 1) x \gset
\echo 'CONFIRM: STEP 11 approval of the corrected result=' :c11e
select case when coalesce(sum(points_delta), 0) > 0 then 'POINTS_AWARDED' else 'NO_POINTS' end as c11f
  from challenge_points_ledger where challenge_id = :'rs_ch' \gset
\echo 'CONFIRM: STEP 11 points for the approved result=' :c11f

-- ---- the audit trail ------------------------------------------------------
-- Rows written inside one transaction share a timestamp, so ORDER is asserted
-- in the browser run (separate transactions); here the SET, the ACTORS and the
-- payloads are.
select case when count(*) = 2 and count(*) filter (where admin_id = :COACH1) = 2
            then 'TWO_SUBMISSIONS_BY_THE_COACH' else 'SUBMITTED(' || count(*) || ')' end as c11g
  from admin_audit_log where action = 'challenge_result_submitted' and target_id in (:'rs_r1', :'rs_r2') \gset
\echo 'CONFIRM: STEP 11 audit: submissions=' :c11g
select case when count(*) = 2
             and count(*) filter (where admin_id = :MANAGER) = 2
             and bool_or(after ->> 'decision' = 'rejected' and after ->> 'notes' = 'Form broke on the last ten reps.' and target_id = :'rs_r1')
             and bool_or(after ->> 'decision' = 'approved' and target_id = :'rs_r2')
            then 'REJECTION_REASON_AND_APPROVAL_RECORDED' else 'REVIEWED(' || count(*) || ')' end as c11h
  from admin_audit_log where action = 'challenge_result_reviewed' and target_id in (:'rs_r1', :'rs_r2') \gset
\echo 'CONFIRM: STEP 11 audit: reviews=' :c11h
select case when count(*) = 2
             and bool_or(before ->> 'status' = 'pending' and after ->> 'status' = 'rejected' and target_id = :'rs_r1')
             and bool_or(before ->> 'status' = 'pending' and after ->> 'status' = 'approved' and target_id = :'rs_r2')
            then 'BOTH_TRANSITIONS_RECORDED' else 'TRANSITIONS(' || count(*) || ')' end as c11i
  from admin_audit_log where action = 'challenge_result_status_changed' and target_id in (:'rs_r1', :'rs_r2') \gset
\echo 'CONFIRM: STEP 11 audit: status transitions=' :c11i
select case when count(*) = 6 and bool_and(metadata ->> 'challenge_id' = :'rs_ch')
            then 'SIX_EVENTS_ALL_TAGGED_WITH_THE_COMPETITION' else 'EVENTS(' || count(*) || ')' end as c11j
  from admin_audit_log where target_id in (:'rs_r1', :'rs_r2') \gset
\echo 'CONFIRM: STEP 11 audit: complete history=' :c11j
rollback;
select case when count(*) = 0 then 'PROBE_LEFT_NOTHING_BEHIND' else 'PROBE_PERSISTED' end as c11z
  from challenges where title = 'Resubmission Probe' \gset
\echo 'CONFIRM: STEP 11 demo data=' :c11z

\echo ''
\echo '--- and the demo state the browser needs ---'
select status::text as status, count(*) as competitions from challenges group by status order by status;
select 'DEMO: open_for_registration=' || (select count(*) from challenges where status = 'registration_open')
    || ' active=' || (select count(*) from challenges where status = 'active')
    || ' completed=' || (select count(*) from challenges where status = 'completed') as demo_state;
select case when count(*) = 0 then 'NO_PROFILE_LEFT_DEACTIVATED' else 'DEACTIVATED(' || count(*) || ')' end as c_final
  from profiles where not is_active \gset
\echo 'CONFIRM: every account restored=' :c_final
