-- PUBLIC reads (anon): only a PUBLISHED season, only the allow-listed fields, nothing that identifies a person beyond a public display name.
reset role;
select race_test.login('lg_other_admin');       -- admin of season-two (created in suite 32; draft, unpublished)
select race_league_set_season_status(race_test.id('s2'), 'scheduled');
select race_test.put('s2c1', race_league_upsert_challenge(race_test.id('s2'), 1, '{"name":"Draft week","metric_kind":"REPS","unit":"reps"}'));
select race_test.put('s2c2', race_league_upsert_challenge(race_test.id('s2'), 2, '{"name":"Published week","metric_kind":"TIME","unit":"s"}'));
select race_league_set_challenge_status(race_test.id('s2c2'), 'published');
select race_league_add_participant(race_test.id('s2'), 'Other Season P.', 'M-OTHER', true);
reset role;
select race_test.put('s2p', (select id from race_league_participants where season_id = race_test.id('s2')));
create table race_test.t34 (k text primary key, v text);
grant all on race_test.t34 to anon, authenticated;
insert into race_test.t34 values ('s2pub', (select public_id from race_league_participants where id = race_test.id('s2p')));
insert into race_test.t34 values ('s1pub', (select public_id from race_league_participants where id = race_test.id('pA')));
create function race_test.t34v(p text) returns text language sql stable security definer as $$ select v from race_test.t34 where k = p $$;
grant execute on function race_test.t34v(text) to anon, authenticated;

select race_test.anon();
select race_test.ok(not (race_league_public_season('season-two') ->> 'available')::boolean, 'public: an UNPUBLISHED season is not available');
select race_test.eq(race_league_public_season('season-two'), race_league_public_season('no-such-season'), 'public: an unpublished season and a missing one are indistinguishable (no enumeration)');
select race_test.eq(race_league_public_season('no-such-season'), '{"available": false}'::jsonb, 'public: nothing else is returned for an unavailable season');
select race_test.eq(race_league_public_participant('season-two', race_test.t34v('s2pub')), '{"available": false}'::jsonb, 'public: no participant of an unpublished season');
select race_test.eq(race_league_public_challenge_results('season-two', 2), '{"available": false}'::jsonb, 'public: no results of an unpublished season');

select race_test.ok((race_league_public_season('SEASON-ONE') ->> 'available')::boolean, 'public: a published season is available (slug is case-insensitive)');
select race_test.eq(jsonb_array_length(race_league_public_season('season-one') -> 'standings'), 6, 'public: standings list every participant');
select race_test.eq((select array_agg(k order by k) from jsonb_object_keys(race_league_public_season('season-one') -> 'standings' -> 0) k),
                    array['challengesCompleted', 'displayName', 'gapToNext', 'movement', 'publicId', 'rank', 'tied', 'totalPoints', 'weeklyPoints'], 'public: a standing row carries exactly the allow-listed fields');
select race_test.eq((select array_agg(k order by k) from jsonb_object_keys(race_league_public_season('season-one') -> 'season') k),
                    array['currentWeek', 'endsOn', 'name', 'slug', 'startsOn', 'status', 'throughWeek', 'totalWeeks'], 'public: the season block carries exactly the allow-listed fields');
select race_test.eq((select array_agg(k order by k) from jsonb_object_keys(race_league_public_season('season-one') -> 'challenges' -> 0) k),
                    array['description', 'direction', 'instructions', 'metricKind', 'name', 'referenceUrl', 'safetyNotes', 'status', 'unit', 'weekNumber'], 'public: a challenge carries exactly the allow-listed fields');
select race_test.ok(race_league_public_season('season-one')::text !~* '(M-[0-9]|external|season_id|"id"|recorded|reviewed|created_by|profile|email|phone|rules|points_cents)', 'public: no external reference, internal id, staff identity, contact field or scoring rule appears anywhere in the payload');
select race_test.ok(race_league_public_season('season-one')::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'public: no UUID appears anywhere in the payload');
select race_test.ok(race_league_public_participant('season-one', race_test.t34v('s1pub'))::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'public: a participant page carries no UUID either');
select race_test.ok(race_league_public_participant('season-one', race_test.t34v('s1pub'))::text !~* '(M-[0-9]|external|recorded|reviewed|email|phone)', 'public: a participant page carries no private field');
select race_test.eq((select count(*) from jsonb_array_elements(race_league_public_season('season-one') -> 'challenges'))::int, 3, 'public: the three non-draft challenges are listed');
select race_test.eq(jsonb_array_length(race_league_public_participant('season-one', race_test.t34v('s1pub')) -> 'results'), 3, 'public: a participant page lists the closed challenges');
select race_test.eq(race_league_public_participant('season-one', race_test.t34v('s2pub')), '{"available": false}'::jsonb, 'public: a participant of ANOTHER season cannot be read through this season (no cross-season access)');
select race_test.eq(race_league_public_participant('season-one', 'does-not-exist'), '{"available": false}'::jsonb, 'public: an unknown participant id is just unavailable');
select race_test.eq(race_league_public_participant('season-one', race_test.t34v('s1pub') || ' or 1=1'), '{"available": false}'::jsonb, 'public: an injected participant id matches nothing');
select race_test.ok((race_league_public_challenge_results('season-one', 1) ->> 'available')::boolean, 'public: closed challenge results are available');
select race_test.eq((select array_agg(k order by k) from jsonb_object_keys(race_league_public_challenge_results('season-one', 1) -> 'results' -> 0) k),
                    array['displayName', 'points', 'publicId', 'rank', 'value'], 'public: a result row carries exactly the allow-listed fields');
select race_test.eq(race_league_public_challenge_results('season-one', 8), '{"available": false}'::jsonb, 'public: a week without a closed challenge has no results');
select race_test.ok(race_league_public_challenge_results('season-one', 1)::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'public: results carry no UUID');

-- tables stay closed to anon / authenticated
select race_test.throws($$select * from race_league_participants$$, 'permission denied', 'anon cannot read the participants table');
select race_test.throws($$select * from race_league_attempts$$, 'permission denied', 'anon cannot read attempts');
select race_test.throws($$select * from race_league_points_ledger$$, 'permission denied', 'anon cannot read the ledger');
select race_test.throws($$select * from race_league_seasons$$, 'permission denied', 'anon cannot read seasons directly');
select race_test.throws($$insert into race_league_points_ledger (season_id, challenge_id, participant_id, points_cents, reason) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 99999, 'AWARD')$$, 'permission denied', 'anon cannot write to the ledger');
select race_test.login('lg_plain');
select race_test.throws($$select * from race_league_participants$$, 'permission denied', 'a signed-in account cannot read participants directly');
select race_test.throws($$update race_league_seasons set published = true$$, 'permission denied', 'a signed-in account cannot publish a season directly');
select race_test.throws($$select race_league_standings_rows(race_test.id('s1'))$$, 'permission denied', 'a signed-in account cannot call the internal standings function');
select race_test.ok(jsonb_array_length(race_league_my_seasons()) = 0, 'a signed-in account with no league role sees no season in the admin list');

-- unpublishing hides it again, republishing restores it
select race_test.login('lg_admin');
select race_league_set_published(race_test.id('s1'), false, 'hide while checking the table');
select race_test.anon();
select race_test.ok(not (race_league_public_season('season-one') ->> 'available')::boolean, 'public: unpublishing a season hides it at once');
select race_test.login('lg_admin');
select race_league_set_published(race_test.id('s1'), true, 'checked');
select race_test.anon();
select race_test.ok((race_league_public_season('season-one') ->> 'available')::boolean, 'public: republishing restores it');

-- only the published week of a scheduled season would show: publish season-two and check the draft challenge stays hidden
select race_test.login('lg_other_admin');
select race_league_set_published(race_test.id('s2'), true, 'preview');
select race_test.anon();
select race_test.eq((select array_agg((c ->> 'weekNumber')::int) from jsonb_array_elements(race_league_public_season('season-two') -> 'challenges') c), array[2], 'public: a DRAFT challenge never appears, even in a published season');
select race_test.eq((race_league_public_season('season-two') -> 'standings' -> 0 ->> 'totalPoints')::numeric, 0::numeric, 'public: a participant with no points is listed with 0');
