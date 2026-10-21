-- Independent review probes: client roles have no path around the checked functions; cross-season writes are refused; privileged internals stay internal.
reset role;
select race_test.use_gate();      -- the API's request carries the gate secret (see suite 34)
select race_test.make_user('rv_judge_a', '');
select race_test.make_user('rv_admin_a', 'C');
select race_test.make_user('rv_admin_a2', '');
select race_test.make_user('rv_admin_b', 'C');
select race_test.make_user('rv_admin_b2', '');
select race_test.login('rv_admin_a');
select race_test.put('ra', race_league_create_season('review-a', 'Review A', date '2026-11-02', date '2026-12-27'));
select race_test.login('rv_admin_b');
select race_test.put('rb', race_league_create_season('review-b', 'Review B', date '2026-11-02', date '2026-12-27'));
reset role;
insert into race_league_staff (season_id, profile_id, role) values
  (race_test.id('ra'), race_test.id('rv_admin_a2'), 'LEAGUE_ADMIN'), (race_test.id('ra'), race_test.id('rv_judge_a'), 'JUDGE'),
  (race_test.id('rb'), race_test.id('rv_admin_b2'), 'LEAGUE_ADMIN');

-- 1. no direct table access of any kind, for either client role, on all ten tables (and the ledger sequence cannot be moved)
do $$
declare t text; r text; ok boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach t in array array['race_league_seasons', 'race_league_challenges', 'race_league_participants', 'race_league_attempts', 'race_league_points_ledger', 'race_league_staff',
                             'race_league_eligibility_decisions', 'race_league_correction_requests', 'race_league_corrections', 'race_league_appeals', 'race_league_public_gate'] loop
      ok := not has_table_privilege(r, 'public.' || t, 'select') and not has_table_privilege(r, 'public.' || t, 'insert') and not has_table_privilege(r, 'public.' || t, 'update')
        and not has_table_privilege(r, 'public.' || t, 'delete') and not has_table_privilege(r, 'public.' || t, 'truncate') and not has_table_privilege(r, 'public.' || t, 'references')
        and not has_table_privilege(r, 'public.' || t, 'trigger');
      if not ok then raise exception 'FAIL: % has a privilege on %', r, t; end if;
    end loop;
    if has_sequence_privilege(r, 'public.race_league_points_ledger_seq_seq', 'usage') or has_sequence_privilege(r, 'public.race_league_points_ledger_seq_seq', 'update')
       or has_sequence_privilege(r, 'public.race_league_points_ledger_seq_seq', 'select') then
      raise exception 'FAIL: % can use the ledger sequence', r;
    end if;
  end loop;
  raise notice 'PASS  review: neither client role holds any privilege on any of the 11 league tables or on the ledger sequence';
end $$;
select race_test.login('rv_admin_a');
select race_test.throws($$select setval('public.race_league_points_ledger_seq_seq', 1)$$, 'permission denied', 'review: a signed-in administrator cannot reset the ledger sequence');
select race_test.throws($$select * from race_league_points_ledger$$, 'permission denied', 'review: a signed-in administrator cannot read the ledger directly');
select race_test.throws($$update race_league_seasons set published = true$$, 'permission denied', 'review: nor update a season directly');
select race_test.anon();
select race_test.throws($$select * from race_league_appeals$$, 'permission denied', 'review: anon cannot read appeals');
select race_test.throws($$select race_league_admin_count(gen_random_uuid())$$, 'permission denied', 'review: internal helpers stay internal (admin_count)');
select race_test.throws($$select race_league_rules_json('{}')$$, 'permission denied', 'review: internal helpers stay internal (rules_json)');

-- 2. a full season in each of two separate seasons, then every cross-season write is refused
select race_test.login('rv_admin_a');
select race_league_set_season_status(race_test.id('ra'), 'scheduled');
select race_league_set_season_status(race_test.id('ra'), 'active');
select race_test.put('rca', race_league_upsert_challenge(race_test.id('ra'), 1, '{"name":"A one","metric_kind":"REPS","unit":"reps","requires_verification":false}'));
select race_league_set_challenge_status(race_test.id('rca'), 'published');
select race_league_set_challenge_status(race_test.id('rca'), 'open');
select race_test.put('rpa', (select race_test.q('select id from race_league_participants where public_id = ''' || race_league_add_participant(race_test.id('ra'), 'Alpha One', 'A-1', true) || '''')::uuid));
select race_test.login('rv_admin_b');
select race_league_set_season_status(race_test.id('rb'), 'scheduled');
select race_league_set_season_status(race_test.id('rb'), 'active');
select race_test.put('rcb', race_league_upsert_challenge(race_test.id('rb'), 1, '{"name":"B one","metric_kind":"REPS","unit":"reps","requires_verification":false}'));
select race_league_set_challenge_status(race_test.id('rcb'), 'published');
select race_league_set_challenge_status(race_test.id('rcb'), 'open');
select race_test.put('rpb', (select race_test.q('select id from race_league_participants where public_id = ''' || race_league_add_participant(race_test.id('rb'), 'Beta One', 'B-1', true) || '''')::uuid));

select race_test.login('rv_judge_a');
select race_test.put('rax', (race_league_record_attempt(race_test.id('rca'), race_test.id('rpa'), 30, null, gen_random_uuid()) ->> 'id')::uuid);
select race_test.throws($$select race_league_record_attempt(race_test.id('rcb'), race_test.id('rpb'), 30, null, gen_random_uuid())$$, 'LEAGUE_FORBIDDEN', 'review: a judge of season A cannot record in season B');
select race_test.throws($$select race_league_record_attempt(race_test.id('rca'), race_test.id('rpb'), 30, null, gen_random_uuid())$$, 'LEAGUE_NOT_FOUND', 'review: a participant of season B cannot be given a result in season A');
select race_test.login('rv_admin_a');
select race_test.throws($$select race_league_set_challenge_status(race_test.id('rcb'), 'closed')$$, 'LEAGUE_FORBIDDEN', 'review: the admin of A cannot close a challenge of B');
select race_test.throws($$select race_league_set_eligibility(race_test.id('rpb'), false, 'FRAUD', 'x')$$, 'LEAGUE_FORBIDDEN', 'review: ... nor restrict a participant of B');
select race_test.throws($$select race_league_correct_attempt((select race_test.q('select id from race_league_attempts limit 1')::uuid), 1, 'x')$$, 'LEAGUE_FORBIDDEN|LEAGUE_NOT_FOUND', 'review: ... nor correct B''s results');
select race_test.throws($$select race_league_lodge_appeal(race_test.id('rca'), race_test.id('rpb'), 'cross')$$, 'LEAGUE_NOT_FOUND|LEAGUE_APPEAL_CLOSED', 'review: an appeal cannot mix seasons');
select race_test.throws($$select race_league_set_staff(race_test.id('rb'), race_test.id('rv_judge_a'), 'JUDGE', true, 'test reason')$$, 'LEAGUE_FORBIDDEN', 'review: the admin of A cannot appoint staff in B');
select race_test.throws($$select race_league_admin_overview(race_test.id('rb'))$$, 'LEAGUE_FORBIDDEN', 'review: ... nor read B''s overview');

-- 3. exactly-once: the same correction cannot be applied twice, and a retry of a decided request fails instead of doubling
select race_test.login('rv_admin_a');
select race_league_set_challenge_status(race_test.id('rca'), 'closed');
select race_league_correct_attempt(race_test.id('rax'), 40, 'recount');
select race_test.throws($$select race_league_correct_attempt(race_test.id('rax'), 40, 'recount again')$$, 'pending or approved', 'review: correcting an already-voided attempt a second time is refused');
reset role;
select race_test.eq((select count(*) from race_league_points_ledger where challenge_id = race_test.id('rca'))::int, 1, 'review: one participant, one ledger line — a same-points correction appended nothing');
select race_test.eq((select count(*) from race_league_corrections where attempt_id = race_test.id('rax'))::int, 1, 'review: exactly one correction record');

-- 4. the public read is bounded and says so
select race_test.anon();
select race_test.ok((race_league_public_season('review-a') ->> 'available')::boolean is false, 'review: an unpublished season is invisible');
select race_test.login('rv_admin_a');
select race_league_set_published(race_test.id('ra'), true, 'review publish');
select race_test.anon();
select race_test.eq(race_league_public_season('review-a') -> 'season' ->> 'participantCount', '1', 'review: the public season states how many athletes it has');
select race_test.eq(race_league_public_season('review-a') -> 'season' ->> 'truncated', 'false', 'review: ... and whether the list was cut');
select race_test.ok(position('rv_admin' in race_league_public_season('review-a')::text) = 0 and position('A-1' in race_league_public_season('review-a')::text) = 0, 'review: no staff identity or member reference in the public payload');

-- 5. scaling guard: the public standings must not be quadratic. 3,000 athletes x 2 closed challenges (the previous per-row subqueries needed ~12 s here; this must finish in 5 s).
reset role;
do $$
declare s uuid; c uuid; w int; sup uuid := (select id from race_test.fx where key = 'super');
begin
  insert into race_league_seasons (public_slug, name, status, starts_on, ends_on, rules, published, first_published_at, created_by)
    values ('review-scale', 'Scale', 'active', date '2026-11-02', date '2026-12-27', race_league_default_rules(), true, now(), sup) returning id into s;
  insert into race_league_participants (season_id, display_name, identity_key, created_by) select s, 'Scale ' || lpad(g::text, 5, '0'), 'name:scale ' || g, sup from generate_series(1, 3000) g;
  for w in 1..2 loop
    insert into race_league_challenges (season_id, week_number, name, metric_kind, unit, direction, max_attempts, counting, status, closed_at)
      values (s, w, 'W' || w, 'REPS', 'reps', 'HIGHER_WINS', 3, 'BEST', 'closed', now()) returning id into c;
    insert into race_league_attempts (season_id, challenge_id, participant_id, value, unit, attempt_no, attempted_at, recorded_by, reviewed_by, status, client_request_id)
      select s, c, p.id, 1 + (abs(hashtext(p.id::text || w)) % 500), 'reps', 1, now(), sup, sup, 'approved', gen_random_uuid() from race_league_participants p where p.season_id = s;
    perform race_league_apply_scores(c);
  end loop;
end $$;
select race_test.anon();
set statement_timeout = '5s';
select race_test.eq((race_league_public_season('review-scale') -> 'season' ->> 'participantCount'), '3000', 'scale: 3,000 athletes — the public standings answer inside 5 s');
select race_test.eq(jsonb_array_length(race_league_public_season('review-scale') -> 'standings'), 1000, 'scale: ... and return the best 1,000 only');
select race_test.eq(race_league_public_season('review-scale') -> 'season' ->> 'truncated', 'true', 'scale: ... and say that the list was cut');
select race_test.ok(race_league_public_participant('review-scale', race_test.q('select public_id from race_league_participants where display_name = ''Scale 01500''')) ->> 'available' = 'true', 'scale: one athlete''s public page also answers inside 5 s');
reset statement_timeout;
reset role;

-- 6. a direct call without the gate secret costs nothing: it is answered before any work, even on a big season
select race_test.anon();
select race_test.send_header('{}');
set statement_timeout = '300ms';
select race_test.eq(race_league_public_season('review-scale'), '{"available": false}'::jsonb, 'gate: a direct call without the secret on a 3,000-athlete season is answered instantly with "not available"');
select race_test.eq(race_league_public_participant('review-scale', 'abcd1234abcd1234'), '{"available": false}'::jsonb, 'gate: ... for the athlete read as well');
reset statement_timeout;
select race_test.use_gate();
reset role;
