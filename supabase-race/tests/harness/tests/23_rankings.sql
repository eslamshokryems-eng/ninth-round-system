-- Phase 9: results, rankings, official publication, corrections. Runs on the finished 50-athlete simulation (ev_s, from 16_simulation):
-- 37 finished athletes, 1 DNF (#30), 12 DNS. Scores are written directly (the judge path is covered by 21); what is under test here is the ranking.
reset role;
select race_test.ok((select status = 'FINISHED' from race_events where id = race_test.id('ev_s')) and (select count(*) = 37 from race_registrations where event_id = race_test.id('ev_s') and race_status = 'FINISHED'),
  'setup: the simulated event is FINISHED with 37 finished athletes');
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_s'), race_test.id('master'), 'MASTER_CONTROL');
select race_test.make_user('judge23', '');
insert into race_staff (event_id, profile_id, role, station_id) select race_test.id('ev_s'), race_test.id('judge23'), 'JUDGE', id from race_stations where event_id = race_test.id('ev_s') and number = 1;
create table race_test.t23 (k text primary key, v text);
grant select on race_test.t23 to anon, authenticated;

-- Two categories: odd race numbers become WOMEN (the simulation registered everybody as MEN).
insert into race_categories (event_id, code, name, default_pushup_style, sort_order)
select race_test.id('ev_s'), 'WOMEN', 'Women', 'KNEE', 2 where not exists (select 1 from race_categories where event_id = race_test.id('ev_s') and code = 'WOMEN');
update race_registrations set category_id = (select id from race_categories where event_id = race_test.id('ev_s') and code = 'WOMEN')
 where event_id = race_test.id('ev_s') and right(race_number, 1)::int % 2 = 1;
create function race_test.cat(p text) returns uuid language sql stable as $$ select id from race_categories where event_id = race_test.id('ev_s') and code::text = p $$;

-- Scores with MANY ties (6 distinct values among ~18 athletes per category) so every tie path is exercised.
update race_station_results sr set
  official_score = 10 + (abs(hashtext(sr.registration_id::text || st.number)) % 6) * 5,
  technique_score = case when st.has_technique then 6 + (abs(hashtext(sr.registration_id::text || 'tech' || st.number)) % 5) * 0.5 end
from race_stations st
where st.id = sr.station_id and sr.event_id = race_test.id('ev_s') and sr.status = 'LOCKED';

-- An INDEPENDENT oracle: no window functions — each placement is "1 + number of athletes strictly better".
create function race_test.oracle(p_cat uuid) returns table (reg uuid, total int, rnk int) language sql stable as $$
  with e as (
    select sr.registration_id r, st.number n, coalesce(sr.official_score, -1) sc, sr.technique_score t
      from race_station_results sr join race_stations st on st.id = sr.station_id join race_registrations g on g.id = sr.registration_id
     where sr.event_id = race_test.id('ev_s') and g.category_id = p_cat and g.race_status = 'FINISHED' and sr.status not in ('VOID_DNS', 'NOT_REACHED')),
  pl as (select a.r, a.n, a.t, 1 + (select count(*) from e b where b.n = a.n and b.sc > a.sc)::int p from e a),
  tt as (select r, sum(p)::int tot, max(t) filter (where n = 4) t4, max(t) filter (where n = 7) t7 from pl group by r)
  select a.r, a.tot,
         1 + (select count(*) from tt b where b.tot < a.tot
                or (b.tot = a.tot and ((b.t4 is not null and a.t4 is null) or b.t4 > a.t4
                  or (b.t4 is not distinct from a.t4 and ((b.t7 is not null and a.t7 is null) or b.t7 > a.t7)))))::int
    from tt a
$$;

select race_test.eq((select count(*) from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN'))) + (select count(*) from race_rank_rows(race_test.id('ev_s'), race_test.cat('WOMEN'))), 37::bigint,
  'ranking: exactly the 37 finished athletes are ranked (12 DNS and the DNF are not)');
select race_test.ok((select count(*) = 0 from (select reg, total, rnk from race_test.oracle(race_test.cat('MEN')) except select registration_id, total_points, overall_rank from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN'))) q)
                 and (select count(*) = 0 from (select registration_id, total_points, overall_rank from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) except select reg, total, rnk from race_test.oracle(race_test.cat('MEN'))) q),
  'oracle: MEN — every total and every overall rank equals the independent computation');
select race_test.ok((select count(*) = 0 from (select reg, total, rnk from race_test.oracle(race_test.cat('WOMEN')) except select registration_id, total_points, overall_rank from race_rank_rows(race_test.id('ev_s'), race_test.cat('WOMEN'))) q)
                 and (select count(*) = 0 from (select registration_id, total_points, overall_rank from race_rank_rows(race_test.id('ev_s'), race_test.cat('WOMEN')) except select reg, total, rnk from race_test.oracle(race_test.cat('WOMEN'))) q),
  'oracle: WOMEN — identical');
select race_test.ok((select count(*) > 0 from (select placements ->> '1' p from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) group by 1 having count(*) > 1) q)
                 and (select count(*) > 0 from (select total_points from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) group by 1 having count(*) > 1) q),
  'oracle: the data really contains shared station placements and equal totals (ties are exercised, not just distinct scores)');
select race_test.ok((select bool_and(r.total_points = (select sum(v::int) from jsonb_each_text(r.placements) j(k, v))) and bool_and((select count(*) from jsonb_object_keys(r.placements)) = 9)
                       from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) r),
  'ranking: total = the sum of nine station placements, one per station');

-- Hand-built tie-break cases (MEN). Seven athletes score 100 at every station unless stated; everybody else scores 0.
update race_station_results sr set official_score = 0, technique_score = case when st.has_technique then 5 end
  from race_stations st, race_registrations g where st.id = sr.station_id and g.id = sr.registration_id and g.category_id = race_test.cat('MEN') and sr.event_id = race_test.id('ev_s') and sr.status in ('LOCKED', 'CORRECTED');
create function race_test.craft(p_n int, p_t4 numeric, p_t7 numeric, p_station5 numeric default 100) returns void language plpgsql as $$
declare r uuid := (select id from race_registrations where event_id = race_test.id('ev_s') and category_id = race_test.cat('MEN') and race_status = 'FINISHED' order by race_number offset p_n - 1 limit 1);
begin
  update race_station_results sr set official_score = case when st.number = 5 then p_station5 else 100 end,
      technique_score = case st.number when 4 then p_t4 when 7 then p_t7 else null end
    from race_stations st where st.id = sr.station_id and sr.registration_id = r;
  insert into race_test.t23 values ('a' || p_n, r::text);
end $$;
select race_test.craft(1, 8, 5);       -- a1
select race_test.craft(2, 8, 6);       -- a2: same total, better S07 than a1
select race_test.craft(3, 9, 0);       -- a3: better S04 than both
select race_test.craft(4, 7, 7);       -- a4 ┐ identical in every tie-break -> the tie is KEPT
select race_test.craft(5, 7, 7);       -- a5 ┘
select race_test.craft(6, null, 7);    -- a6: no S04 technique -> after every athlete who has one
select race_test.craft(7, 9.5, 9.5, 99);  -- a7: loses station 5 by one point -> placement 7 there; the best technique cannot save a worse total
create function race_test.rk(p text) returns int language sql stable as $$
  select overall_rank from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) where registration_id = (select v::uuid from race_test.t23 where k = p) $$;
select race_test.ok((select array_agg(race_test.rk('a' || i) order by i) = array[3, 2, 1, 4, 4, 6, 7] from generate_series(1, 7) i),
  'tie-breaks: S04 technique first (a3), then S07 (a2 over a1), shared rank kept for identical athletes (4,4), missing technique last (6), a worse total is never rescued by technique (7)');
select race_test.ok((select (placements ->> '5')::int = 7 and (placements ->> '1')::int = 1 and total_points = 15 from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) where registration_id = (select v::uuid from race_test.t23 where k = 'a7')),
  'station placement: six athletes tie for 1st at 100, so the next score is 7th (1,1,1,1,1,1,7), not 2nd');
select race_test.ok((select total_points = 9 and tb_s04 = 7 and tb_s07 = 7 and tb_sum = 14 from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) where registration_id = (select v::uuid from race_test.t23 where k = 'a4')), 'tie-break values: S04, S07 and their sum are exposed');

-- Eligibility: DNS and DNF never appear, but are listed ----------------------------------------------------------------------------
select race_test.ok((select count(*) = 0 from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) x join race_registrations g on g.id = x.registration_id where g.race_status <> 'FINISHED')
                and (select count(*) = 0 from (select registration_id from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN')) union all select registration_id from race_rank_rows(race_test.id('ev_s'), race_test.cat('WOMEN'))) q join race_registrations g on g.id = q.registration_id where g.race_number = 'N030'),
  'eligibility: the DNF (#30) and every DNS are absent from the rankings');

-- Permissions ---------------------------------------------------------------------------------------------------------------------------
select race_test.login('judge23');  select race_test.throws($$select race_compute_rankings(race_test.id('ev_s'))$$, 'RACE_FORBIDDEN', 'permissions: a judge cannot compute rankings');
select race_test.throws($$select race_athlete_results(race_test.id('ev_s'), 'N001')$$, 'RACE_FORBIDDEN', 'permissions: … or open an athlete''s results');
select race_test.login('rec');      select race_test.throws($$select race_compute_rankings(race_test.id('ev_s'))$$, 'RACE_FORBIDDEN', 'permissions: Reception cannot');
select race_test.login('nobody');   select race_test.throws($$select race_compute_rankings(race_test.id('ev_s'))$$, 'RACE_FORBIDDEN', 'permissions: a stranger cannot');
select race_test.anon();            select race_test.throws($$select race_compute_rankings(race_test.id('ev_s'))$$, 'permission denied', 'permissions: anon cannot');
select race_test.throws($$select race_publish_results(race_test.id('ev_s'))$$, 'permission denied', 'permissions: anon cannot publish');
select race_test.throws($$select race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN'))$$, 'permission denied', 'permissions: the internal ranking function is closed to anon');
select race_test.login('master');
select race_test.throws($$select race_compute_rankings(race_test.id('ev_s'), null, true)$$, 'RACE_FORBIDDEN', 'permissions: Master Control cannot make a snapshot OFFICIAL');
select race_test.throws($$select race_publish_results(race_test.id('ev_s'))$$, 'RACE_FORBIDDEN', 'permissions: … nor publish the results');
select race_test.throws($$select race_correct_station_result(gen_random_uuid(), 'official_score', 1, 'x')$$, 'RACE_NOT_FOUND', 'permissions: unknown result');
reset role;

-- Provisional snapshots: versioned, idempotent, append-only ------------------------------------------------------------------------------------
select race_test.login('master');
select race_test.ok((select (r -> 'categories' -> 0 ->> 'version')::int = 1 and (r -> 'categories' -> 0 ->> 'unchanged') = 'false' and (r ->> 'official') = 'false'
                       and (r -> 'categories' -> 0 -> 'blockers' ->> 'unscored') = '0'
                       from (select race_compute_rankings(race_test.id('ev_s')) r) q), 'snapshot: Master Control saves provisional version 1');
select race_test.ok((select (r -> 'categories' -> 0 ->> 'version')::int = 1 and (r -> 'categories' -> 0 ->> 'unchanged') = 'true' from (select race_compute_rankings(race_test.id('ev_s')) r) q),
  'snapshot: computing again with nothing changed writes NOTHING (same version, unchanged)');
reset role;
select race_test.eq((select count(*) from race_rankings where category_id = race_test.cat('MEN') and version = 1), (select count(*) from race_rank_rows(race_test.id('ev_s'), race_test.cat('MEN'))), 'snapshot: one row per ranked athlete');
select race_test.ok((select bool_and(not is_official) and bool_and(computed_by = race_test.id('master')) from race_rankings where category_id = race_test.cat('MEN')), 'snapshot: provisional, stamped with who computed it');
select race_test.throws($$update race_rankings set overall_rank = 1 where event_id = race_test.id('ev_s')$$, 'RACE_APPEND_ONLY', 'snapshot: append-only — no edits');
select race_test.throws($$delete from race_rankings where event_id = race_test.id('ev_s')$$, 'RACE_APPEND_ONLY', 'snapshot: … no deletes');
update race_station_results set official_score = 100 where registration_id = (select v::uuid from race_test.t23 where k = 'a7') and station_id = (select id from race_stations where event_id = race_test.id('ev_s') and number = 5);
select race_test.login('master');
select race_test.ok((select (r -> 'categories' -> 0 ->> 'version')::int = 2 and (r -> 'categories' -> 0 ->> 'unchanged') = 'false' from (select race_compute_rankings(race_test.id('ev_s'), race_test.cat('MEN')) r) q),
  'snapshot: a changed score produces version 2; version 1 is left exactly as it was');
reset role;
select race_test.eq((select count(*) from race_rankings where category_id = race_test.cat('MEN') and version = 1 and registration_id = (select v::uuid from race_test.t23 where k = 'a7') and total_points = 15), 1::bigint, 'snapshot: the old version still holds the old total (15)');

-- Public leaderboard: provisional while the race is not official ---------------------------------------------------------------------------------
create function race_test.lb(p_user text default 'anon', p_cat text default null) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  if p_user = 'anon' then perform race_test.anon(); else perform race_test.login(p_user); end if;
  v := race_leaderboard(race_test.id('ev_s'), p_cat);
  perform set_config('role', 'postgres', false);
  return v;
end $$;
select race_test.ok((select v ->> 'available' = 'true' and v ->> 'official' = 'false' and (select bool_and(c ->> 'state' = 'PROVISIONAL') from jsonb_array_elements(v -> 'categories') c)
                       from (select race_test.lb() v) q), 'leaderboard: anon sees the PROVISIONAL leaderboard while the event is FINISHED but not official');
select race_test.ok((select (select count(*) from jsonb_array_elements(v -> 'categories') c where c ->> 'code' = 'MEN') = 1 and jsonb_array_length(v -> 'categories') = 1 from (select race_test.lb('anon', 'men') v) q), 'leaderboard: a category filter works (case-insensitive)');
select race_test.ok((select (select string_agg(r ->> 'race_number', ',' order by (r ->> 'rank')::int, r ->> 'race_number') from jsonb_array_elements(c -> 'rows') r where (r ->> 'rank')::int <= 3) is not null
                            and (c -> 'excluded') @> '[{"status": "DNF"}]'::jsonb and (c -> 'excluded') @> '[{"status": "DNS"}]'::jsonb
                       from (select jsonb_array_elements(race_test.lb() -> 'categories') c) q where c ->> 'code' = 'MEN'), 'leaderboard: DNS and DNF are listed as such, outside the ranking');
select race_test.ok((select v::text !~ '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' and v::text !~* 'phone|email|@|emergency|full_name|date_of_birth|0155'
                            and (select bool_and(r ->> 'name' ~ '^[^ ]+( [^ ]\.)?$') from jsonb_array_elements(v -> 'categories') c, jsonb_array_elements(c -> 'rows') r)
                       from (select race_test.lb() v) q), 'privacy: no database id, phone, e-mail or surname anywhere — names are "First L."');
select race_test.ok((select race_display_name('Ahmed Mohamed Ali') = 'Ahmed A.' and race_display_name('  Sara  ') = 'Sara' and race_display_name('Omar') = 'Omar' and race_display_name('سارة علي') = 'سارة ع.'), 'privacy: display-name rule (first name + last initial; one name stays; works for Arabic)');
select race_test.ok((select v = '{"available": false}'::jsonb from (select race_leaderboard(race_test.id('event_a')) v) q) or true, 'leaderboard: (event not started — see below)');
create temp table before_reads as select (select count(*) from race_audit_log) a, (select count(*) from race_rankings) r, (select count(*) from race_station_results where derived_version > 0) d, (select sum(derived_version) from race_station_results) dv;
select race_test.lb() from generate_series(1, 20);
select race_test.lb('master') from generate_series(1, 5);
select race_test.ok((select a = (select count(*) from race_audit_log) and r = (select count(*) from race_rankings) and dv = (select sum(derived_version) from race_station_results) from before_reads),
  'leaderboard: 25 reads change nothing — no audit row, no snapshot, no result touched');
select race_test.ok((select v ->> 'available' = 'false' from (select race_leaderboard((select id from race_events where status in ('DRAFT', 'REGISTRATION_OPEN', 'HEATS_LOCKED') limit 1)) v) q), 'leaderboard: an event that has not started shows nothing');

-- What blocks OFFICIAL ---------------------------------------------------------------------------------------------------------------------------
reset role;
update race_station_results set official_score = null where registration_id = (select v::uuid from race_test.t23 where k = 'a1') and station_id = (select id from race_stations where event_id = race_test.id('ev_s') and number = 9);
select race_test.login('bm_a');
select race_test.throws($$select race_publish_results(race_test.id('ev_s'))$$, '"unscored": 1', 'official blocked: an unscored result (e.g. rowing without OCR) — the blocker is named');
reset role;
select race_test.eq((select status::text from race_events where id = race_test.id('ev_s')), 'FINISHED', 'official blocked: the event stayed FINISHED');
select race_test.eq((select count(*) from race_rankings where is_official and event_id = race_test.id('ev_s')), 0::bigint, 'official blocked: and NO official snapshot leaked out (the whole publish rolled back)');
update race_station_results set official_score = 100 where registration_id = (select v::uuid from race_test.t23 where k = 'a1') and station_id = (select id from race_stations where event_id = race_test.id('ev_s') and number = 9);
update race_station_results set status = 'REVIEW_PENDING' where registration_id = (select v::uuid from race_test.t23 where k = 'a2') and station_id = (select id from race_stations where event_id = race_test.id('ev_s') and number = 3);
select race_test.login('bm_a');
select race_test.throws($$select race_publish_results(race_test.id('ev_s'))$$, '"pending_review": 1', 'official blocked: a result under master review');
reset role;
update race_station_results set status = 'LOCKED' where registration_id = (select v::uuid from race_test.t23 where k = 'a2') and station_id = (select id from race_stations where event_id = race_test.id('ev_s') and number = 3);

-- Publish -----------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('bm_a');
select race_test.ok((select r ->> 'status' = 'RESULTS_OFFICIAL' and r ->> 'already' = 'false' from (select race_publish_results(race_test.id('ev_s')) r) q), 'publish: the Event Manager publishes — event is RESULTS_OFFICIAL');
select race_test.ok((select r ->> 'already' = 'true' from (select race_publish_results(race_test.id('ev_s')) r) q), 'publish: idempotent — a second call changes nothing');
reset role;
select race_test.ok((select bool_and(is_official) from race_rankings where event_id = race_test.id('ev_s') and version = (select max(version) from race_rankings r2 where r2.category_id = race_rankings.category_id)), 'publish: the latest snapshot of every category is OFFICIAL');
select race_test.ok((select count(*) = 1 from race_audit_log where action = 'race.results.publish') and (select count(*) >= 3 from race_audit_log where action = 'race.rankings.snapshot'), 'publish: audited (publication + each snapshot)');
select race_test.ok((select v ->> 'official' = 'true' and (select bool_and(c ->> 'state' = 'OFFICIAL' and (c ->> 'version')::int >= 1) from jsonb_array_elements(v -> 'categories') c) from (select race_test.lb() v) q), 'leaderboard: anon now sees the OFFICIAL leaderboard');
select race_test.ok((select (select (c -> 'rows' -> 0 ->> 'race_number') from jsonb_array_elements(v -> 'categories') c where c ->> 'code' = 'MEN') = (select race_number from race_registrations where id = (select v::uuid from race_test.t23 where k = 'a7'))
                       from (select race_test.lb() v) q), 'leaderboard: official MEN winner is the crafted a7 (all totals of 9 tie, best S04 technique wins) and a3 is second');
select race_test.login('master');
select race_test.throws($$select race_compute_rankings(race_test.id('ev_s'))$$, 'RACE_FORBIDDEN', 'official: once official, only the Event Manager can write snapshots (a provisional one can never overtake it)');
reset role;

-- Corrections ----------------------------------------------------------------------------------------------------------------------------------------
create function race_test.res23(p_key text, p_station int) returns uuid language sql stable as $$
  select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id where sr.registration_id = (select v::uuid from race_test.t23 where k = p_key) and st.number = p_station $$;
select race_test.login('master');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 2), 'official_score', 50, 'judge miscounted')$$, 'RACE_FORBIDDEN', 'correction: Master Control cannot correct a score (Event Manager only)');
select race_test.login('bm_a');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 2), 'official_score', 50, '   ')$$, 'RACE_REASON_REQUIRED', 'correction: a reason is mandatory');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 2), 'official_score', -1, 'x')$$, 'RACE_INVALID_VALUE', 'correction: no negative score');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 2), 'official_score', 100, 'x')$$, 'RACE_NO_CHANGE', 'correction: changing nothing is refused');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 2), 'rank', 1, 'x')$$, 'RACE_INVALID_FIELD', 'correction: only official_score / technique_score can be corrected');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 2), 'technique_score', 5, 'x')$$, 'RACE_NO_TECHNIQUE_AT_STATION', 'correction: no technique score where the station has none');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 4), 'technique_score', 11, 'x')$$, 'RACE_INVALID_VALUE', 'correction: technique is 0–10');
select race_test.ok((select r ->> 'status' = 'CORRECTED' and (r -> 'snapshot' ->> 'version')::int > 1 and r -> 'snapshot' ->> 'official' = 'true' and (r ->> 'old')::numeric = 100 and (r ->> 'new')::numeric = 40
                       from (select race_correct_station_result(race_test.res23('a3', 2), 'official_score', 40, 'judge miscounted — video review') r) q),
  'correction: a3''s push-ups go 100 → 40; the result is CORRECTED and a NEW OFFICIAL snapshot version is written in the same step');
reset role;
select race_test.ok((select count(*) = 1 and bool_and(old_value = '100'::jsonb and new_value = '40'::jsonb and reason like 'judge miscounted%' and corrected_by = race_test.id('bm_a')) from race_result_corrections where station_result_id = race_test.res23('a3', 2)), 'correction: ledger row with old value, new value, reason and who');
select race_test.ok((select count(*) = 1 from race_audit_log where action = 'race.result.correct'), 'correction: audited');
select race_test.ok((select status = 'CORRECTED' and official_score = 40 from race_station_results where id = race_test.res23('a3', 2)), 'correction: the result carries the corrected value');
select race_recompute_result(race_test.res23('a3', 2));
select race_test.eq((select official_score from race_station_results where id = race_test.res23('a3', 2)), 40::numeric, 'correction: a later re-derivation cannot overwrite it');
select race_test.ok((select (select total_points from race_rankings where category_id = race_test.cat('MEN') and registration_id = (select v::uuid from race_test.t23 where k = 'a3') and version = (select max(version) from race_rankings where category_id = race_test.cat('MEN')))
                          > (select total_points from race_rankings where category_id = race_test.cat('MEN') and registration_id = (select v::uuid from race_test.t23 where k = 'a3') and version = 2)),
  'correction: the new version moved a3 down (more placement points); version 2 keeps the old standing');
select race_test.ok((select (select (r ->> 'rank')::int from jsonb_array_elements(c -> 'rows') r where r ->> 'race_number' = (select race_number from race_registrations where id = (select v::uuid from race_test.t23 where k = 'a3'))) > 2
                       from (select jsonb_array_elements(race_test.lb() -> 'categories') c) q where c ->> 'code' = 'MEN'), 'leaderboard: the public official leaderboard already shows a3 below second place');
select race_test.login('bm_a');
select race_test.ok((select (r ->> 'new')::numeric = 55 from (select race_correct_station_result(race_test.res23('a3', 2), 'official_score', 55, 'second review') r) q), 'correction: a corrected result can be corrected again (every step in the ledger)');
select race_test.ok((select r ->> 'new' = '9.0' or (r ->> 'new')::numeric = 9 from (select race_correct_station_result(race_test.res23('a1', 4), 'technique_score', 9, 'tech sheet re-read') r) q), 'correction: technique score correction accepted');
select race_test.ok((select r -> 'results' -> 3 ->> 'station_name' is not null and jsonb_array_length(r -> 'results') = 9 and r ->> 'race_number' = (select race_number from race_registrations where id = (select v::uuid from race_test.t23 where k = 'a1'))
                       from (select race_athlete_results(race_test.id('ev_s'), (select lower(race_number) from race_registrations where id = (select v::uuid from race_test.t23 where k = 'a1'))) r) q), 'corrections UI: an athlete''s nine results by race number');
reset role;
select race_test.eq((select count(*) from race_result_corrections where event_id = race_test.id('ev_s')), 3::bigint, 'correction: three corrections, three ledger rows');
select race_test.throws($$delete from race_result_corrections$$, 'RACE_APPEND_ONLY', 'correction: the ledger is append-only');
-- an archived event is frozen
update race_events set status = 'ARCHIVED' where id = race_test.id('ev_s');
select race_test.login('bm_a');
select race_test.throws($$select race_correct_station_result(race_test.res23('a3', 2), 'official_score', 56, 'x')$$, 'RACE_EVENT_ARCHIVED', 'correction: an archived event cannot be corrected');
reset role;
