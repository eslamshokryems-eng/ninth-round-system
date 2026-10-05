-- Phase 10: the Rowing (Station 09) evidence workflow — capture -> OCR -> judge CONFIRM / RETAKE -> official result, manual correction,
-- late confirmation, offline replay, idempotency, security, and integration with Results & Rankings. Against the REAL RPCs.
-- Timeline (race ms) of athlete i (slot i-1): Station 09 work window ends 1,920,000 + (i-1)*210,000; its 0:30 transition ends 30,000 later.
--   N001  3:00 at 1,920,000 / transition end 1,950,000     N002  2,130,000 / 2,160,000     N003  2,340,000 / 2,370,000
--   N004  2,550,000 / 2,580,000                            N005  2,760,000 / 2,790,000
reset role;
select race_test.make_user('judge9', '');
select race_test.make_user('judge9b', '');
select race_test.make_user('screen9', '');
create table race_test.t24 (k text primary key, v text);
grant all on race_test.t24 to anon, authenticated;
create function race_test.mk9() returns void language plpgsql as $$
begin
  perform race_test.mkevent('ev_row', 'rowing-2026', 6);
  insert into race_heats (event_id, number) values (race_test.id('ev_row'), 1);
  perform race_move_athlete_heat(race_test.rid('ev_row' || i), (select id from race_heats where event_id = race_test.id('ev_row'))) from generate_series(1, 6) i;
  insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_row'), race_test.id('master'), 'MASTER_CONTROL');
  insert into race_staff (event_id, profile_id, role, station_id)
  select race_test.id('ev_row'), race_test.id(k), r::race_role, (select id from race_stations where event_id = race_test.id('ev_row') and number = n)
    from (values ('judge9', 'JUDGE', 9), ('judge9b', 'JUDGE', 9), ('judge1', 'JUDGE', 1), ('screen9', 'STATION_SCREEN', 9)) v(k, r, n);
  perform race_test.login('bm_a'); perform race_lock_heats(race_test.id('ev_row'));
  perform race_test.login('rec');
  perform race_check_in(race_test.rid('ev_row' || i)) from generate_series(1, 5) i;     -- athlete 6 never arrives
  perform set_config('role', 'postgres', false);
end $$;
select race_test.mk9();
select race_test.login('master'); select race_start_event(race_test.id('ev_row')); reset role;

-- helpers -------------------------------------------------------------------------------------------------------------------------------------
create function race_test.ev() returns uuid language sql stable security definer as $$ select race_test.id('ev_row') $$;
create function race_test.r9(p_i int) returns uuid language sql stable security definer as $$
  select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id where st.event_id = race_test.ev() and st.number = 9 and sr.registration_id = race_test.rid('ev_row' || p_i) $$;
create function race_test.rs(p_i int, p_station int) returns uuid language sql stable security definer as $$
  select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id where st.event_id = race_test.ev() and st.number = p_station and sr.registration_id = race_test.rid('ev_row' || p_i) $$;
grant execute on function race_test.rs(int, int) to anon, authenticated;
create function race_test.imgpath(p_i int, p_name text) returns text language sql stable security definer as $$ select race_test.ev()::text || '/rowing/' || race_test.r9(p_i)::text || '/' || p_name $$;
create function race_test.mkimg(p_i int, p_name text, p_bytes int default 120000) returns void language plpgsql security definer as $$
begin
  insert into storage.objects (bucket_id, name, owner, metadata) values ('race-evidence', race_test.imgpath(p_i, p_name), race_test.id('judge9'), jsonb_build_object('size', p_bytes, 'mimetype', 'image/jpeg'))
  on conflict do nothing;
end $$;
create function race_test.att(p_key text) returns uuid language sql stable as $$ select v::uuid from race_test.t24 where k = 'att_' || p_key $$;
grant execute on function race_test.att(text), race_test.r9(int), race_test.ev(), race_test.imgpath(int, text) to anon, authenticated;
create function race_test.cap(p_user text, p_i int, p_name text, p_key text, p_origin text default 'ONLINE') returns jsonb language plpgsql as $$
declare v jsonb; cid uuid;
begin
  perform set_config('role', 'postgres', false);
  perform race_test.mkimg(p_i, p_name);
  insert into race_test.t24 values ('cid_' || p_key, gen_random_uuid()::text) on conflict do nothing;
  cid := (select t.v::uuid from race_test.t24 t where t.k = 'cid_' || p_key);
  perform race_test.login(p_user);
  v := race_ocr_capture(race_test.r9(p_i), cid, race_test.imgpath(p_i, p_name), 'image/jpeg', 120000, repeat('a', 64), p_origin::race_action_origin,
                        case when p_origin = 'OFFLINE_QUEUE' then clock_timestamp() end, case when p_origin = 'OFFLINE_QUEUE' then 1000 end, case when p_origin = 'OFFLINE_QUEUE' then 1 end);
  perform set_config('role', 'postgres', false);
  insert into race_test.t24 values ('att_' || p_key, v ->> 'attempt_id') on conflict do nothing;
  return v;
end $$;
create function race_test.sub(p_user text, p_key text, p_text text, p_dist int, p_conf numeric) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform race_test.login(p_user);
  v := race_ocr_submit(race_test.att(p_key), 'tesseract', 'tesseract.js@7', p_text, jsonb_build_object('text', p_text), p_dist, p_conf);
  perform set_config('role', 'postgres', false);
  return v;
end $$;
create function race_test.cf(p_user text, p_key text, p_ack boolean default false) returns jsonb language plpgsql as $$
declare v jsonb; cid uuid;
begin
  perform set_config('role', 'postgres', false);
  insert into race_test.t24 values ('cf_' || p_key, gen_random_uuid()::text) on conflict do nothing;
  cid := (select t.v::uuid from race_test.t24 t where t.k = 'cf_' || p_key);
  perform race_test.login(p_user);
  v := race_ocr_confirm(race_test.att(p_key), cid, p_ack);
  perform set_config('role', 'postgres', false);
  return v;
end $$;
create function race_test.rt(p_user text, p_key text, p_reason text default null) returns jsonb language plpgsql as $$
declare v jsonb; cid uuid;
begin
  perform set_config('role', 'postgres', false);
  insert into race_test.t24 values ('rt_' || p_key, gen_random_uuid()::text) on conflict do nothing;
  cid := (select t.v::uuid from race_test.t24 t where t.k = 'rt_' || p_key);
  perform race_test.login(p_user);
  v := race_ocr_retake(race_test.att(p_key), cid, p_reason);
  perform set_config('role', 'postgres', false);
  return v;
end $$;
create function race_test.row(p_i int) returns record language sql stable as $$ select sr.status, sr.official_score, race_evidence_state(sr.id) ev from race_station_results sr where sr.id = race_test.r9(p_i) $$;
create function race_test.st(p_i int) returns text language sql stable as $$ select race_evidence_state(race_test.r9(p_i)) $$;
create function race_test.sc(p_i int) returns numeric language sql stable as $$ select official_score from race_station_results where id = race_test.r9(p_i) $$;
create function race_test.t(p_ms bigint) returns void language sql as $$ select race_sim.travel_to(race_test.ev(), p_ms) $$;

-- Windows of every result BEFORE any evidence exists: nothing below may move them.
select race_test.t(1900000);
select race_test.login('master'); select race_advance(race_test.ev()); reset role;
insert into race_test.t24 select 'win0', md5(string_agg(id::text || ':' || window_start_race_ms || ':' || window_end_race_ms, ',' order by id)) from race_station_results where event_id = race_test.ev();
select race_test.ok((select count(*) = 45 from race_station_results where event_id = race_test.ev()) and (select status = 'ACTIVE' from race_station_results where id = race_test.r9(1)), 'setup: 5 athletes, 9 results each; N001''s rowing window is open (ACTIVE)');
select race_test.ok(race_test.st(1) = 'PENDING_EVIDENCE' and race_test.sc(1) is null, 'state: a rowing result starts as PENDING_EVIDENCE with no score');

-- TIME RULE: nothing can be captured while the 3:00 work window is open; taps never produce a rowing distance -------------------------------------
select race_test.login('judge9');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'early.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_OCR_TOO_EARLY', '3:00 boundary: a photo cannot be registered while the work window is still open (the display is not final)');
select race_test.throws($$select * from race_record_action(race_test.r9(1), 'REP', gen_random_uuid())$$, 'RACE_USE_OCR_EVIDENCE', 'no extra rowing meters: a tap on the rowing station is refused — distance only comes from the photographed display');
select race_test.throws($$select * from race_record_action(race_test.r9(1), 'LAP', gen_random_uuid())$$, 'RACE_USE_OCR_EVIDENCE', 'no extra rowing meters: … laps too');
reset role;
select race_test.eq((select count(*) from race_performance_events where station_result_id = race_test.r9(1)), 0::bigint, 'no extra rowing meters: not even a REJECTED row was written by the refused taps');

-- Window closed: the athlete's 3:00 is over, capture opens ----------------------------------------------------------------------------------------
select race_test.t(1921000);

-- Security of capture ------------------------------------------------------------------------------------------------------------------------------
select race_test.mkimg(1, 'a1.jpg');
select race_test.login('judge1');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_FORBIDDEN', 'security: the judge of another station cannot capture rowing evidence');
select race_test.login('screen9');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_FORBIDDEN', 'security: a station screen cannot capture');
select race_test.login('rec');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_FORBIDDEN', 'security: Reception cannot');
select race_test.login('nobody');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_FORBIDDEN', 'security: a stranger cannot');
select race_test.anon();
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'permission denied', 'security: anon cannot');
select race_test.login('judge9');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.ev()::text || '/rowing/other/x.jpg', 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_OCR_BAD_PATH', 'validation: the path must be <event>/rowing/<this result>/…');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'never-uploaded.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_OCR_IMAGE_MISSING', 'validation: the photo must be uploaded before it is registered');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 99, repeat('a', 64))$$, 'RACE_OCR_IMAGE_MISMATCH', 'validation: the registered size must match the uploaded file');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'application/pdf', 120000, repeat('a', 64))$$, 'RACE_OCR_BAD_IMAGE', 'validation: photos only');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, 'nothex')$$, 'RACE_OCR_BAD_IMAGE', 'validation: the SHA-256 fingerprint is required');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64), 'OFFLINE_QUEUE')$$, 'RACE_OFFLINE_METADATA_REQUIRED', 'validation: an offline capture must carry its device time and sequence');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), null, race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_CLIENT_EVENT_REQUIRED', 'validation: a capture id is mandatory (the idempotency key)');
select race_test.throws($$select race_ocr_capture(race_test.rs(1, 1), gen_random_uuid(), 'x', 'image/jpeg', 1, repeat('a', 64))$$, 'RACE_FORBIDDEN', 'security: a rowing judge cannot register evidence against any other station''s result');
reset role;

-- Storage RLS: only the judge of THIS station uploads under the result's folder -------------------------------------------------------------------
select race_test.login('judge1');
select race_test.throws($$select race_test.obj('race-evidence', race_test.imgpath(1, 'sneaky.jpg'))$$, 'row-level security', 'storage: the judge of another station cannot upload into the rowing result''s folder');
select race_test.login('judge9');
select race_test.obj('race-evidence', race_test.imgpath(1, 'uploaded-by-judge.jpg'), 'judge9');
select race_test.ok(exists (select 1 from storage.objects where name = race_test.imgpath(1, 'uploaded-by-judge.jpg')), 'storage: the assigned judge uploads into <event>/rowing/<result>/');
select race_test.throws($$select race_test.obj('race-evidence', race_test.ev()::text || '/rowing/' || gen_random_uuid()::text || '/x.jpg', 'judge9')$$, 'row-level security', 'storage: … but not under a result that does not exist');
select race_test.throws($$select race_test.obj('race-evidence', race_test.ev()::text || '/misc/x.jpg', 'judge9')$$, 'row-level security', 'storage: … nor outside the rowing structure');
select race_test.login('judge9b');
select race_test.ok((select count(*) >= 1 from storage.objects where name = race_test.imgpath(1, 'uploaded-by-judge.jpg')), 'storage: a second judge assigned to the same station can read it (shift change)');
select race_test.login('judge1');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'storage: the judge of another station sees no evidence');
select race_test.login('screen9');
select race_test.eq(race_test.count($$select 1 from storage.objects where bucket_id = 'race-evidence'$$), 0::bigint, 'storage: a station screen can never read the evidence image');
reset role;

-- 1. CAPTURE (N001, clear display) ---------------------------------------------------------------------------------------------------------------------
select race_test.ok((select v ->> 'status' = 'CAPTURED' and v ->> 'duplicate' = 'false' and v ->> 'after_transition' = 'false' and (v ->> 'attempt_no')::int = 1 and (v ->> 'capture_race_ms')::bigint between 1921000 and 1923000
                       from (select race_test.cap('judge9', 1, 'a1.jpg', 'n1a1') v) q), 'capture: the photo is registered against athlete + session + Station 09 result, with the SERVER race time (inside the transition)');
select race_test.ok((select o.captured_by = race_test.id('judge9') and o.storage_path = race_test.imgpath(1, 'a1.jpg') and o.image_sha256 = repeat('a', 64) and o.image_bytes = 120000 and o.origin = 'ONLINE'
                            and o.ocr_status = 'PENDING' and o.status = 'CAPTURED' and o.captured_at is not null and o.station_result_id = race_test.r9(1)
                       from race_ocr_records o where o.id = race_test.att('n1a1')), 'capture: judge, capture timestamp, image path/size/fingerprint and origin are stored; the original image path is kept');
-- duplicate upload retry
select race_test.ok((select v ->> 'duplicate' = 'true' and v ->> 'attempt_id' = race_test.att('n1a1')::text from (select race_test.cap('judge9', 1, 'a1.jpg', 'n1a1') v) q), 'idempotency: a retried upload/registration returns the ORIGINAL attempt (duplicate = true)');
select race_test.eq((select count(*) from race_ocr_records where station_result_id = race_test.r9(1)), 1::bigint, 'idempotency: … and no second attempt exists');
select race_test.login('judge9b');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), (select v::uuid from race_test.t24 where k = 'cid_n1a1'), race_test.imgpath(1, 'a1.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_IDEMPOTENCY_CONFLICT', 'idempotency: another judge cannot reuse the capture id');
select race_test.login('judge9');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), (select v::uuid from race_test.t24 where k = 'cid_n1a1'), race_test.imgpath(1, 'different.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_IDEMPOTENCY_CONFLICT', 'idempotency: the same id for a different photo is refused');
select race_test.mkimg(1, 'a1-second.jpg');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'a1-second.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_OCR_ATTEMPT_ACTIVE', 'one active attempt: a second photo needs a RETAKE of the first');
reset role;

-- 2. OCR -------------------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('judge9');
select race_test.throws($$select race_ocr_confirm(race_test.att('n1a1'), gen_random_uuid())$$, 'RACE_OCR_NOT_PROCESSED', 'confirm: nothing to confirm before the OCR result is in');
reset role;
select race_test.ok((select v ->> 'ocr_status' = 'SUCCEEDED' and (v ->> 'proposed_distance_m')::int = 842 and v ->> 'duplicate' = 'false' and (v ->> 'can_confirm') = 'true' and (v ->> 'requires_acknowledgement') = 'false'
                       from (select race_test.sub('judge9', 'n1a1', '842 m', 842, 0.97) v) q), 'OCR: "842 m" at 97% confidence -> SUCCEEDED, proposed distance 842, nothing to acknowledge');
select race_test.ok((select o.provider = 'tesseract' and o.ocr_engine = 'tesseract.js@7' and o.ocr_text = '842 m' and o.raw_response ->> 'text' = '842 m' and o.proposed_distance_m = 842 and o.confidence = 0.97
                            and o.ocr_processed_at is not null and o.ocr_status = 'SUCCEEDED' and o.status = 'CAPTURED' and o.confirmed_distance_m is null and o.ocr_submitted_by = race_test.id('judge9')
                       from race_ocr_records o where o.id = race_test.att('n1a1')), 'OCR: raw output, extracted distance, confidence, processing timestamp, engine and status are stored; nothing is confirmed yet');
select race_test.ok((select v ->> 'duplicate' = 'true' from (select race_test.sub('judge9', 'n1a1', '842 m', 842, 0.97) v) q), 'idempotency: re-submitting the same OCR result (a retried upload) is a no-op');
select race_test.login('judge9');
select race_test.throws($$select race_ocr_submit(race_test.att('n1a1'), 'tesseract', 'tesseract.js@7', '942 m', '{}', 942, 0.99)$$, 'RACE_OCR_ALREADY_PROCESSED', 'OCR: a different result can never replace the stored one');
reset role;
select race_test.eq((select proposed_distance_m from race_ocr_records where id = race_test.att('n1a1')), 842, 'OCR: the stored proposal is unchanged');

-- 5. No score before confirmation -------------------------------------------------------------------------------------------------------------------------
select race_test.ok(race_test.st(1) = 'PENDING_EVIDENCE' and race_test.sc(1) is null and (race_result_tally(race_test.r9(1)) ->> 'score') is null, 'no score before confirmation: Station 09 = PENDING_EVIDENCE, official score empty, derived score empty — although the OCR already says 842');
select race_test.ok((select (race_rank_blockers(race_test.ev(), (select category_id from race_registrations where id = race_test.rid('ev_row1'))) ->> 'pending_evidence')::int >= 1), 'integration: the unconfirmed rowing result is a named blocker for OFFICIAL results');
select race_test.login('bm_a');
select race_test.throws($$select race_compute_rankings(race_test.ev(), null, true)$$, '"pending_evidence"', 'integration: OFFICIAL rankings are refused while any rowing result lacks confirmed evidence');
reset role;

-- Station screens never receive the evidence --------------------------------------------------------------------------------------------------------------
select race_test.login('screen9');
select race_test.ok((select v::text !~* 'rowing/|image|storage|ocr|proposed|sha256|confidence|\.jpg' and (v -> 'current' ->> 'score') is null and (select array_agg(k order by k) from jsonb_object_keys(v) k) = array['clock', 'current', 'event', 'planned_next_ms', 'served_any', 'server_time', 'station', 'timing', 'upcoming']
                       from (select race_station_screen(race_test.ev(), 9) v) q), 'screens: the Station 09 screen payload has the same nine keys, no image/path/OCR data, and no score until the distance is confirmed');
select race_test.eq(race_test.count($$select 1 from race_ocr_records where event_id = race_test.ev()$$), 0::bigint, 'screens: no read access to OCR records');
select race_test.throws($$select race_rowing_view(race_test.ev())$$, 'RACE_FORBIDDEN', 'screens: the evidence view is closed to a station screen');
select race_test.throws($$select race_evidence_history(race_test.r9(1))$$, 'RACE_FORBIDDEN', 'screens: … and so is the evidence history');
reset role;

-- 3. JUDGE CONFIRMATION (inside the 0:30 transition) -----------------------------------------------------------------------------------------------------
select race_test.ok(position('distance' in pg_get_function_arguments('race_ocr_confirm(uuid,uuid,boolean)'::regprocedure)) = 0, 'confirmation: the CONFIRM RPC has no distance parameter — the judge can only confirm the OCR proposal');
select race_test.t(1930000);
select race_test.ok((select v ->> 'status' = 'CONFIRMED' and v ->> 'official' = 'true' and (v ->> 'distance_m')::int = 842 and v ->> 'after_transition' = 'false' and (v ->> 'score')::numeric = 842
                       from (select race_test.cf('judge9', 'n1a1') v) q), 'confirmation: judge confirms inside the 30-second transition -> CONFIRMED, official 842 m');
select race_test.ok(race_test.st(1) = 'OFFICIAL' and race_test.sc(1) = 842, 'official result: after confirmation Station 09 = OFFICIAL with the confirmed distance');
select race_test.ok((select o.status = 'CONFIRMED' and o.confirmed_distance_m = 842 and o.confirmed_by = race_test.id('judge9') and o.confirmed_at is not null and not o.confirmed_after_transition from race_ocr_records o where o.id = race_test.att('n1a1')), 'confirmation: who and when are stored');
select race_test.ok((select v ->> 'duplicate' = 'true' and v ->> 'status' = 'CONFIRMED' from (select race_test.cf('judge9', 'n1a1') v) q), 'idempotency: a retried CONFIRM answers with the original confirmation');
select race_test.login('judge9');
select race_test.throws($$select race_ocr_confirm(race_test.att('n1a1'), gen_random_uuid())$$, 'RACE_OCR_ALREADY_CONFIRMED', 'confirmation: confirming again with a new id is refused (one confirmation per result)');
select race_test.throws($$select race_ocr_retake(race_test.att('n1a1'), gen_random_uuid())$$, 'RACE_OCR_ALREADY_CONFIRMED', 'a confirmed distance cannot be retaken — only Master Control can correct it');
select race_test.mkimg(1, 'late-extra.jpg');
select race_test.throws($$select race_ocr_capture(race_test.r9(1), gen_random_uuid(), race_test.imgpath(1, 'late-extra.jpg'), 'image/jpeg', 120000, repeat('a', 64))$$, 'RACE_OCR_ALREADY_CONFIRMED', 'a new photo cannot be added to an official result');
select race_test.throws($$update race_ocr_records set confirmed_distance_m = 999$$, 'permission denied', 'security: a judge cannot write OCR records directly (no table privileges)');
reset role;
select race_test.throws($$update race_ocr_records set confirmed_distance_m = 999 where id = race_test.att('n1a1')$$, 'RACE_APPEND_ONLY', 'immutability: a confirmed record cannot be edited even by a superuser');
select race_test.throws($$delete from race_ocr_records where id = race_test.att('n1a1')$$, 'RACE_NO_DELETE', 'immutability: evidence is never deleted');
select race_test.throws($$update race_ocr_records set storage_path = 'x/y/z.jpg' where id = race_test.att('n1a1')$$, 'RACE_APPEND_ONLY', 'immutability: the original image path cannot be pointed elsewhere');
select race_test.ok((select count(*) = 4 from race_audit_log where action in ('race.ocr.capture', 'race.ocr.result', 'race.ocr.confirm') and target_id = race_test.att('n1a1')) or
                    (select count(*) = 3 from race_audit_log where action in ('race.ocr.capture', 'race.ocr.result', 'race.ocr.confirm') and target_id = race_test.att('n1a1')), 'audit: capture, OCR result and confirmation are each in the audit log');

-- 30-second TRANSITION BOUNDARY on N001: the lock came at exactly the scheduled time — evidence did not hold the athlete back ---------------------------
select race_test.t(1951000);
select race_test.login('master'); select race_advance(race_test.ev()); reset role;
select race_test.ok((select status = 'LOCKED' and official_score = 842 from race_station_results where id = race_test.r9(1)), 'transition boundary: N001''s result LOCKED at the end of its 0:30 with the confirmed 842 m');

-- 4. RETAKE: wrong OCR, then a correct one (N002) ----------------------------------------------------------------------------------------------------------
select race_test.t(2140000);
select race_test.ok((select v ->> 'status' = 'CAPTURED' from (select race_test.cap('judge9', 2, 'a2-1.jpg', 'n2a1') v) q), 'retake: N002 first photo captured');
select race_test.ok((select v ->> 'ocr_status' = 'SUCCEEDED' and (v ->> 'proposed_distance_m')::int = 342 from (select race_test.sub('judge9', 'n2a1', '342 m', 342, 0.93) v) q), 'wrong OCR: the engine read 342 m with high confidence (the display said 861)');
select race_test.throws($$update race_ocr_records set status = 'CONFIRMED', confirmed_distance_m = 861, confirmed_by = race_test.id('judge9') where id = race_test.att('n2a1')$$, 'RACE_OCR_SILENT_OVERWRITE', 'wrong OCR: a different distance can NOT be slipped in — a confirmed distance must equal the OCR proposal');
select race_test.ok((select v ->> 'status' = 'RETAKEN' and v ->> 'duplicate' = 'false' from (select race_test.rt('judge9', 'n2a1', 'display says 861, OCR read 342') v) q), 'retake: the judge presses RETAKE PHOTO — the first attempt is closed (RETAKEN), not deleted');
select race_test.ok((select v ->> 'duplicate' = 'true' from (select race_test.rt('judge9', 'n2a1', 'display says 861, OCR read 342') v) q), 'idempotency: a retried RETAKE is a no-op');
select race_test.ok((select v ->> 'status' = 'CAPTURED' and (v ->> 'attempt_no')::int = 2 from (select race_test.cap('judge9', 2, 'a2-2.jpg', 'n2a2') v) q), 'retake: a NEW attempt (no. 2) is created');
select race_test.ok((select retake_of = race_test.att('n2a1') from race_ocr_records where id = race_test.att('n2a2')), 'retake: the new attempt points at the one it replaces');
select race_test.ok((select v ->> 'ocr_status' = 'SUCCEEDED' and (v ->> 'proposed_distance_m')::int = 861 from (select race_test.sub('judge9', 'n2a2', '861m', 861, 0.95) v) q), 'retake: the second OCR run reads 861');
select race_test.t(2145000);
select race_test.ok((select v ->> 'official' = 'true' and (v ->> 'distance_m')::int = 861 from (select race_test.cf('judge9', 'n2a2') v) q), 'retake: confirming the second attempt makes 861 m official');
select race_test.ok((select count(*) = 2 and bool_or(status = 'RETAKEN' and ocr_text = '342 m' and proposed_distance_m = 342 and retake_reason = 'display says 861, OCR read 342' and retaken_by = race_test.id('judge9') and retaken_at is not null)
                            and bool_or(status = 'CONFIRMED' and confirmed_distance_m = 861) and count(distinct storage_path) = 2
                       from race_ocr_records where station_result_id = race_test.r9(2)), 'multiple attempts: both are kept with their own image, raw OCR output and decision — the wrong reading is evidence history, never deleted');
select race_test.login('master');
select race_test.ok((select jsonb_array_length(h -> 'attempts') = 2 and (h ->> 'evidence_state') = 'OFFICIAL'
                            and (select array_agg(x ->> 'action' order by ord) from jsonb_array_elements(h -> 'audit') with ordinality a(x, ord)) = array['race.ocr.capture', 'race.ocr.result', 'race.ocr.retake', 'race.ocr.capture', 'race.ocr.result', 'race.ocr.confirm']
                       from (select race_evidence_history(race_test.r9(2)) h) q), 'audit trail: the history shows capture → OCR → retake → capture → OCR → confirm, in order');
reset role;

-- N003: unreadable, then low confidence needing acknowledgement -------------------------------------------------------------------------------------------
select race_test.t(2350000);
select race_test.ok((select v ->> 'status' = 'CAPTURED' from (select race_test.cap('judge9', 3, 'a3-1.jpg', 'n3a1') v) q), 'N003: first photo (glare)');
select race_test.ok((select v ->> 'ocr_status' = 'FAILED' and v ->> 'can_confirm' = 'false' from (select race_test.sub('judge9', 'n3a1', '#@ ~', null, null) v) q), 'unclear photo: OCR finds no distance -> FAILED, cannot be confirmed');
select race_test.login('judge9');
select race_test.throws($$select race_ocr_confirm(race_test.att('n3a1'), gen_random_uuid(), true)$$, 'RACE_OCR_UNREADABLE', 'unclear photo: even with the acknowledgement a FAILED reading cannot be confirmed');
reset role;
select race_test.ok((select v ->> 'status' = 'RETAKEN' from (select race_test.rt('judge9', 'n3a1', 'glare') v) q), 'N003: retake after the failed reading');
select race_test.ok((select v ->> 'status' = 'CAPTURED' and (v ->> 'attempt_no')::int = 2 from (select race_test.cap('judge9', 3, 'a3-2.jpg', 'n3a2') v) q), 'N003: attempt 2');
select race_test.ok((select v ->> 'ocr_status' = 'LOW_CONFIDENCE' and v ->> 'requires_acknowledgement' = 'true' and v ->> 'can_confirm' = 'true' from (select race_test.sub('judge9', 'n3a2', '700 m', 700, 0.72) v) q), 'low-confidence OCR: 72% -> LOW_CONFIDENCE (a number, but it needs the judge''s explicit acknowledgement)');
select race_test.login('judge9');
select race_test.throws($$select race_ocr_confirm(race_test.att('n3a2'), gen_random_uuid())$$, 'RACE_OCR_LOW_CONFIDENCE', 'low-confidence OCR: a plain CONFIRM is refused');
reset role;
select race_test.ok((select v ->> 'official' = 'true' and (v ->> 'distance_m')::int = 700 from (select race_test.cf('judge9', 'n3a2', true) v) q), 'low-confidence OCR: confirmed with the acknowledgement -> official 700 m');
select race_test.ok((select low_confidence_ack from race_ocr_records where id = race_test.att('n3a2')), 'low-confidence OCR: the acknowledgement is recorded on the evidence');
select race_test.ok((select array_agg(race_ocr_classify(d, c, '{"min_confidence":0.6,"review_confidence":0.85,"max_distance_m":1500}'::jsonb) order by o) =
                            array['SUCCEEDED', 'LOW_CONFIDENCE', 'LOW_CONFIDENCE', 'FAILED', 'LOW_CONFIDENCE', 'FAILED', 'FAILED', 'SUCCEEDED', 'FAILED']
                       from (values (1, 842, 0.85), (2, 842, 0.8499), (3, 842, 0.60), (4, 842, 0.5999), (5, 842, null::numeric), (6, 1501, 0.99), (7, null::int, 0.99), (8, 0, 0.99), (9, -1, 0.99)) v(o, d, c)),
  'confidence handling: ≥85% SUCCEEDED · 60–85% and unknown LOW_CONFIDENCE · <60%, no number or > 1,500 m FAILED');
select race_test.t(2372000);
select race_test.login('master'); select race_advance(race_test.ev()); reset role;
select race_test.ok((select status = 'LOCKED' and official_score = 700 from race_station_results where id = race_test.r9(3)), 'transition boundary: N003 locked on schedule with 700 m');

-- 7. OFFLINE capture, then LATE confirmation (N004) -------------------------------------------------------------------------------------------------------
select race_test.t(2560000);
select race_test.ok((select v ->> 'status' = 'CAPTURED' and v ->> 'duplicate' = 'false' from (select race_test.cap('judge9', 4, 'a4-1.jpg', 'n4a1', 'OFFLINE_QUEUE') v) q), 'offline: a capture taken while the device was offline arrives with its device time/sequence');
select race_test.ok((select origin = 'OFFLINE_QUEUE' and device_seq = 1 and device_race_ms = 1000 and device_recorded_at is not null from race_ocr_records where id = race_test.att('n4a1')), 'offline: origin and device metadata are stored with the evidence');
select race_test.ok((select v ->> 'ocr_status' = 'SUCCEEDED' from (select race_test.sub('judge9', 'n4a1', '655 m', 655, 0.9) v) q), 'offline: the on-device OCR result is submitted with the capture');
select race_test.t(2590000);   -- the judge's confirm only reaches the server AFTER the 30-second transition (2,580,000)
select race_test.ok((select v ->> 'duplicate' = 'true' from (select race_test.cap('judge9', 4, 'a4-1.jpg', 'n4a1', 'OFFLINE_QUEUE') v) q), 'reconnect: the queued capture is replayed -> duplicate, no second attempt');
select race_test.ok((select v ->> 'duplicate' = 'true' from (select race_test.sub('judge9', 'n4a1', '655 m', 655, 0.9) v) q), 'reconnect: the queued OCR submission is replayed -> duplicate');
select race_test.ok((select v ->> 'status' = 'PENDING_REVIEW' and v ->> 'official' = 'false' and v ->> 'after_transition' = 'true' from (select race_test.cf('judge9', 'n4a1') v) q), 'late confirmation: reaching the server after the 0:30 transition -> PENDING_MASTER_REVIEW, not official');
select race_test.ok((select v ->> 'status' = 'PENDING_REVIEW' and v ->> 'duplicate' = 'true' from (select race_test.cf('judge9', 'n4a1') v) q), 'reconnect: replaying the confirmation again is idempotent');
select race_test.ok(race_test.st(4) = 'PENDING_MASTER_REVIEW' and race_test.sc(4) is null, 'late confirmation: no score until Master Control decides (evidence state PENDING_MASTER_REVIEW)');
select race_test.ok((select status = 'PENDING_REVIEW' and confirmed_after_transition and confirm_requested_by = race_test.id('judge9') and confirm_requested_at is not null and confirmed_distance_m is null from race_ocr_records where id = race_test.att('n4a1')), 'late confirmation: who asked and when is stored; no confirmed distance yet');
select race_test.login('judge9');
select race_test.throws($$select race_ocr_review(race_test.att('n4a1'), 'APPROVED', 'ok')$$, 'RACE_FORBIDDEN', 'review: a judge cannot approve their own late confirmation');
select race_test.login('master');
select race_test.throws($$select race_ocr_review(race_test.att('n4a1'), 'APPROVED', '  ')$$, 'RACE_REASON_REQUIRED', 'review: a reason is required');
select race_test.ok((select v ->> 'status' = 'REJECTED' and v ->> 'official' = 'false' from (select race_ocr_review(race_test.att('n4a1'), 'REJECTED', 'photo shows glare — retake') v) q), 'review: Master Control REJECTS the late confirmation');
reset role;
select race_test.ok(race_test.st(4) = 'PENDING_EVIDENCE' and race_test.sc(4) is null, 'review: after a rejection the result is back to PENDING_EVIDENCE');
select race_test.ok((select v ->> 'status' = 'CAPTURED' and (v ->> 'attempt_no')::int = 2 from (select race_test.cap('judge9', 4, 'a4-2.jpg', 'n4a2') v) q), 'review: the judge can capture a new attempt after the rejection (history kept)');
select race_test.ok((select v ->> 'ocr_status' = 'SUCCEEDED' from (select race_test.sub('judge9', 'n4a2', '655 m', 655, 0.96) v) q), 'review: attempt 2 OCR 655');
select race_test.ok((select v ->> 'status' = 'PENDING_REVIEW' from (select race_test.cf('judge9', 'n4a2') v) q), 'late confirmation again goes to review');
-- blockers while N004 is pending review and N005 is unconfirmed
select race_test.login('bm_a');
select race_test.throws($$select race_compute_rankings(race_test.ev(), null, true)$$, 'RACE_RESULTS_NOT_READY', 'integration: pending late confirmation blocks OFFICIAL rankings');
reset role;
select race_test.login('master');
select race_test.ok((select v ->> 'status' = 'CONFIRMED' and v ->> 'official' = 'true' and (v ->> 'score')::numeric = 655 from (select race_ocr_review(race_test.att('n4a2'), 'APPROVED', 'photo is clear, 655 m matches the display') v) q), 'review: Master Control APPROVES -> CONFIRMED, official 655 m');
select race_test.throws($$select race_ocr_review(race_test.att('n4a2'), 'APPROVED', 'again')$$, 'RACE_OCR_NOT_PENDING', 'review: a decision is final');
reset role;
select race_test.ok((select o.reviewed_by = race_test.id('master') and o.review_reason like 'photo is clear%' and o.confirmed_after_transition and o.confirm_requested_by = race_test.id('judge9') and o.confirmed_by = race_test.id('master') from race_ocr_records o where o.id = race_test.att('n4a2')), 'review: judge (requested), reviewer, reason and times are all on the record');
select race_test.ok(race_test.st(4) = 'OFFICIAL' and race_test.sc(4) = 655, 'late confirmation: after approval Station 09 = OFFICIAL');
select race_test.ok((select count(*) = 2 and bool_or(status = 'REJECTED' and review_reason like 'photo shows glare%') from race_ocr_records where station_result_id = race_test.r9(4)), 'audit trail: the rejected attempt is kept with its reason');

-- 6. MANUAL CORRECTION (N005: three unreadable photos) ----------------------------------------------------------------------------------------------------
select race_test.t(2761000);
select race_test.cap('judge9', 5, 'a5-1.jpg', 'n5a1'); select race_test.sub('judge9', 'n5a1', '', null, null); select race_test.rt('judge9', 'n5a1', 'unreadable');
select race_test.cap('judge9', 5, 'a5-2.jpg', 'n5a2'); select race_test.sub('judge9', 'n5a2', '8?2', null, 0.2); select race_test.rt('judge9', 'n5a2', 'still unreadable');
select race_test.cap('judge9', 5, 'a5-3.jpg', 'n5a3'); select race_test.sub('judge9', 'n5a3', '', 8, 0.3);
select race_test.ok((select count(*) = 3 and count(*) filter (where ocr_status = 'FAILED') = 3 from race_ocr_records where station_result_id = race_test.r9(5)), 'repeated OCR failure: three attempts, all FAILED — all kept');
select race_test.ok(race_test.st(5) = 'PENDING_EVIDENCE' and race_test.sc(5) is null, 'no score: N005 stays PENDING_EVIDENCE');
select race_test.t(2800000);
select race_test.login('master'); select race_advance(race_test.ev()); reset role;
select race_test.ok((select status = 'LOCKED' and official_score is null from race_station_results where id = race_test.r9(5)), '3:00 + 30-second boundaries: N005''s result was LOCKED on schedule although its evidence is still missing — evidence never holds an athlete');
select race_test.login('judge9');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), 777, 'display is cracked')$$, 'RACE_FORBIDDEN', 'correction: a judge cannot');
select race_test.login('rec');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), 777, 'x')$$, 'RACE_FORBIDDEN', 'correction: Reception cannot');
select race_test.login('screen9');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), 777, 'x')$$, 'RACE_FORBIDDEN', 'correction: a station screen cannot');
select race_test.login('master');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), 777, '  ')$$, 'RACE_REASON_REQUIRED', 'correction: a reason is required');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), 2000, 'x')$$, 'RACE_INVALID_VALUE', 'correction: a distance above 1,500 m is refused');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), -5, 'x')$$, 'RACE_INVALID_VALUE', 'correction: no negative distance');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), 777, 'x', race_test.att('n1a1'))$$, 'RACE_NOT_FOUND', 'correction: the cited evidence must belong to the same result');
select race_test.ok((select v ->> 'status' = 'CORRECTED' and (v ->> 'new')::int = 777 and v ->> 'old' is null and (v ->> 'evidence_attempt_id')::uuid = race_test.att('n5a3') and (v ->> 'score')::numeric = 777
                       from (select race_correct_rowing_result(race_test.r9(5), 777, 'display unreadable after 3 photos; read 777 m from the machine by eye with the athlete present') v) q),
  'correction: Master Control sets 777 m, citing the latest photo');
reset role;
select race_test.ok((select count(*) = 1 and bool_and(field = 'rowing_distance_m' and old_value is null and new_value = '777'::jsonb and reason like 'display unreadable%' and corrected_by = race_test.id('master')
                            and corrected_at is not null and evidence_ocr_id = race_test.att('n5a3')) from race_result_corrections where station_result_id = race_test.r9(5)), 'correction: ledger row — corrected distance, reason, user, timestamp and the reference to the original evidence');
select race_test.ok(race_test.st(5) = 'OFFICIAL' and race_test.sc(5) = 777 and (select status = 'CORRECTED' from race_station_results where id = race_test.r9(5)), 'correction: Station 09 = OFFICIAL (CORRECTED) with 777 m');
select race_test.ok((select count(*) = 3 and count(*) filter (where status = 'RETAKEN') = 2 and count(*) filter (where ocr_status = 'FAILED') = 3 and bool_and(confirmed_distance_m is null) from race_ocr_records where station_result_id = race_test.r9(5)),
  'correction: never a silent replacement — the OCR records are untouched (still FAILED, nothing "confirmed")');
select race_test.ok((select count(*) = 1 from race_audit_log where action = 'race.ocr.manual_correction' and target_id = race_test.r9(5) and metadata ->> 'reason' like 'display unreadable%' and (metadata ->> 'evidence_attempt_id')::uuid = race_test.att('n5a3')), 'correction: audited with reason and evidence reference');
select race_test.login('master');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(5), 777, 'again')$$, 'RACE_NO_CHANGE', 'correction: the same value is refused');
select race_test.ok((select (v ->> 'old')::int = 777 and (v ->> 'new')::int = 780 from (select race_correct_rowing_result(race_test.r9(5), 780, 'recount after video') v) q), 'correction: a second correction chains from the first (old 777 -> new 780)');
reset role;
select race_test.login('bm_a');
select race_test.throws($$select race_correct_station_result(race_test.r9(5), 'official_score', 800, 'sneaky')$$, 'RACE_USE_EVIDENCE_CORRECTION', 'the generic Phase 9 correction cannot be used to bypass the rowing evidence');
reset role;
select race_test.eq((select count(*) from race_result_corrections where station_result_id = race_test.r9(5)), 2::bigint, 'correction: both corrections are in the ledger');

-- 9. RESULTS INTEGRATION -------------------------------------------------------------------------------------------------------------------------------------
select race_test.ok((select (race_rank_blockers(race_test.ev(), (select category_id from race_registrations where id = race_test.rid('ev_row1'))) ->> 'pending_evidence')::int = 0), 'integration: every rowing result is official -> no evidence blocker left');
select race_test.t(5000000);
select race_test.login('master'); select race_advance(race_test.ev()); reset role;
select race_test.eq((select status::text from race_events where id = race_test.ev()), 'FINISHED', 'integration: the event finished by itself — pending/late evidence never stalled it');
select race_test.ok((select array_agg(race_number order by overall_rank, race_number) = array['N002', 'N001', 'N005', 'N003', 'N004'] and (select array_agg((placements ->> '9')::int order by overall_rank, race_number) from race_rank_rows(race_test.ev(), (select category_id from race_registrations where id = race_test.rid('ev_row1')))) = array[1, 2, 3, 4, 5]
                       from race_rank_rows(race_test.ev(), (select category_id from race_registrations where id = race_test.rid('ev_row1')))),
  'integration: confirmed distances (861, 842, 780 corrected, 700, 655) enter the ranking automatically — Station 09 placements 1..5');
select race_test.login('bm_a');
select race_test.ok((select r ->> 'status' = 'RESULTS_OFFICIAL' from (select race_publish_results(race_test.ev()) r) q), 'integration: with every Station 09 result confirmed the Event Manager can publish the official results');
reset role;
select race_test.ok((select (v -> 'categories' -> 0 -> 'rows' -> 0 ->> 'race_number') = 'N002' and v::text !~* 'rowing/|image|\.jpg|ocr|sha256' from (select race_leaderboard(race_test.ev()) v) q), 'integration: the public leaderboard carries the result and none of the evidence');
select race_test.login('master');
select race_test.throws($$select race_correct_rowing_result(race_test.r9(4), 900, 'x')$$, 'RACE_FORBIDDEN', 'correction after publication: only the Event Manager');
select race_test.login('bm_a');
select race_test.ok((select (v -> 'snapshot' ->> 'official') = 'true' and (v ->> 'new')::int = 900 from (select race_correct_rowing_result(race_test.r9(4), 900, 'recount: the athlete rowed 900 m — display photo re-read by the referee') v) q), 'correction after publication: Event Manager corrects N004 to 900 m -> a NEW OFFICIAL snapshot version');
reset role;
select race_test.ok((select (v -> 'categories' -> 0 -> 'rows' -> 0 ->> 'race_number') = 'N004' from (select race_leaderboard(race_test.ev()) v) q), 'correction after publication: the public leaderboard moves N004 to first place');

-- SECURITY / RLS recap ---------------------------------------------------------------------------------------------------------------------------------------
select race_test.login('judge9');
select race_test.ok((select count(*) = 10 from race_ocr_records where event_id = race_test.ev()), 'rls: the station judge sees the rowing evidence of the event they are assigned to');
select race_test.ok((select jsonb_array_length(v -> 'items') = 5 from (select race_rowing_view(race_test.ev(), true) v) q) and (select jsonb_array_length(v -> 'items') = 0 from (select race_rowing_view(race_test.ev()) v) q), 'rls: … through the rowing view (all 5 athletes on request; by default only what still needs attention — nothing, now that everything is official)');
select race_test.login('judge1');
select race_test.eq(race_test.count($$select 1 from race_ocr_records where event_id = race_test.ev()$$), 0::bigint, 'rls: the judge of another station sees no OCR records');
select race_test.throws($$select race_rowing_view(race_test.ev())$$, 'RACE_FORBIDDEN', 'rls: … and cannot open the rowing view');
select race_test.login('rec');
select race_test.eq(race_test.count($$select 1 from race_ocr_records where event_id = race_test.ev()$$), 0::bigint, 'rls: Reception sees no OCR records');
select race_test.login('bm_b');
select race_test.eq(race_test.count($$select 1 from race_ocr_records where event_id = race_test.ev()$$), 0::bigint, 'rls: another event''s manager sees none');
select race_test.throws($$select race_evidence_history(race_test.r9(1))$$, 'RACE_FORBIDDEN', 'rls: … nor the history');
select race_test.anon();
select race_test.throws($$select 1 from race_ocr_records$$, 'permission denied', 'rls: anon has no access to OCR records at all');
select race_test.throws($$select race_rowing_view(race_test.ev())$$, 'permission denied', 'rls: anon cannot open the rowing view');
select race_test.login('master');
select race_test.ok((select count(*) = 10 from race_ocr_records where event_id = race_test.ev()), 'rls: Master Control sees all of the event''s evidence');
select race_test.ok((select count(*) >= 1 from storage.objects where bucket_id = 'race-evidence' and name = race_test.imgpath(1, 'a1.jpg')), 'rls: … and every stored image');
reset role;

-- TIME RULE, final: nothing in this whole workflow moved a window ------------------------------------------------------------------------------------
select race_test.ok((select md5(string_agg(id::text || ':' || window_start_race_ms || ':' || window_end_race_ms, ',' order by id)) = (select v from race_test.t24 where k = 'win0') from race_station_results where event_id = race_test.ev()),
  'no extra rowing time: every result window (start and end) is identical before and after all captures, OCR runs, retakes, confirmations, reviews and corrections');
select race_test.ok((select count(*) = 5 and bool_and(window_end_race_ms - window_start_race_ms = 180000) from race_station_results r join race_stations st on st.id = r.station_id where st.number = 9 and r.event_id = race_test.ev() and r.status <> 'VOID_DNS'), 'no extra rowing time: every rowing work window is exactly 3:00');
select race_sim.check_invariants(race_test.ev(), 5000000);
select race_test.ok(true, 'timing invariants (no overlap, windows == model, statuses agree with race time) hold after the whole evidence workflow');
