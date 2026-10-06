-- Registration abuse protection (runbook §11): per-IP and per-event limits, hashed IP only, staff exemption, idempotency/quota behaviour, permissions.
-- Everything runs against the REAL public RPC race_register_athlete() with PostgREST-style request headers.
reset role;
select race_test.make_user('ab_judge', '');
create table race_test.t28 (k text primary key, v text);
grant all on race_test.t28 to anon, authenticated;

-- one event for the suite (the creator bm_a is its Event Manager)
select race_test.login('bm_a');
select race_test.put('ev_ab', race_create_event('abuse-2026', date '2026-12-01'));
select race_set_event_status(race_test.id('ev_ab'), 'REGISTRATION_OPEN');
reset role;
insert into race_staff (event_id, profile_id, role) values (race_test.id('ev_ab'), race_test.id('rec'), 'RECEPTION');
insert into race_staff (event_id, profile_id, role, station_id)
select race_test.id('ev_ab'), race_test.id('ab_judge'), 'JUDGE', (select id from race_stations where event_id = race_test.id('ev_ab') and number = 1);

create function race_test.ab_ev() returns uuid language sql stable as $$ select race_test.id('ev_ab') $$;
-- register one athlete as a PUBLIC (anon) caller arriving from p_ip (null = no request headers at all); returns the race number or the error code
create function race_test.ab_reg(p_ip text, p_i int, p_xff_raw text default null) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.headers', case when p_xff_raw is not null then jsonb_build_object('x-forwarded-for', p_xff_raw)::text
                                              when p_ip is not null then jsonb_build_object('x-forwarded-for', p_ip)::text else '' end, false);
  perform race_test.anon();
  begin
    select race_number into v from race_register_athlete(race_test.ab_ev(), 'Abuse Athlete ' || p_i, '0155' || lpad(p_i::text, 7, '0'), null, 'male', date '1991-01-01', 'MEN', null, true,
                                                       '{"name":"Family","phone":"01011112222"}'::jsonb);
  exception when others then
    v := coalesce(substring(sqlerrm from 'RACE_[A-Z_]+'), left(sqlerrm, 40));
  end;
  perform set_config('role', 'postgres', false);
  perform set_config('request.headers', '', false);
  return v;
end $$;
grant execute on function race_test.ab_reg(text, int, text), race_test.ab_ev() to anon, authenticated;
create function race_test.ab_attempts(p_hash text default null) returns bigint language sql stable security definer as $$
  select count(*) from race_registration_attempts where event_id = race_test.ab_ev() and (p_hash is null or ip_hash = p_hash) $$;
create function race_test.ab_hash(p_ip text) returns text language sql stable security definer as $$
  select encode(sha256(convert_to(s.ip_salt || ':' || p_ip, 'UTF8')), 'hex') from race_registration_settings s where s.id $$;
create function race_test.ab_age(p_interval interval) returns void language sql security definer as $$
  update race_registration_attempts set created_at = created_at - p_interval where event_id = race_test.ab_ev() $$;
create function race_test.ab_limits(p_ip10 int, p_iph int, p_ev int, p_enabled boolean default true) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform race_test.login('bm_a');
  v := race_set_registration_limits(race_test.ab_ev(), p_ip10, p_iph, p_ev, p_enabled, 'abuse test');
  perform set_config('role', 'postgres', false);
  return v;
end $$;
grant execute on function race_test.ab_attempts(text), race_test.ab_hash(text), race_test.ab_age(interval), race_test.ab_limits(int, int, int, boolean) to anon, authenticated;

-- DEFAULTS ------------------------------------------------------------------------------------------------------------------------------------
select race_test.ok((select per_ip_10min = 8 and per_ip_hour = 30 and per_event_minute = 120 and enabled and ip_header = 'x-forwarded-for' and ip_from_right = 1 and length(ip_salt) >= 64
                       from race_registration_settings where id), 'defaults: 8 per IP / 10 min, 30 per IP / hour, 120 per event / minute, last x-forwarded-for hop, a random salt');
select race_test.eq((select count(*) from race_registration_settings), 1::bigint, 'defaults: exactly one settings row (singleton)');

-- NORMAL REGISTRATION + HASHED IP ---------------------------------------------------------------------------------------------------------------
select race_test.ok(race_test.ab_reg('203.0.113.9', 1) ~ '^N[0-9]{3}$', 'normal: a public registration from a PostgREST caller succeeds');
select race_test.eq(race_test.ab_attempts(), 1::bigint, 'normal: one completed registration = one counted attempt');
select race_test.eq(race_test.ab_attempts(race_test.ab_hash('203.0.113.9')), 1::bigint, 'hashed IP: the stored value is sha256(salt:ip), computed independently');
select race_test.ok(not exists (select 1 from race_registration_attempts a where a::text like '%203.0.113.9%'), 'hashed IP: the raw address appears nowhere in the attempts table');
select race_test.ok(not exists (select 1 from race_registration_attempts a where a.ip_hash !~ '^[0-9a-f]{64}$'), 'hashed IP: every stored value is a 64-hex digest');
select race_test.ok(race_test.ab_hash('203.0.113.9') <> race_test.ab_hash('203.0.113.10'), 'hashed IP: different addresses → different hashes');
select race_test.ok(race_test.ab_hash('203.0.113.9') = race_test.ab_hash('203.0.113.9'), 'hashed IP: the same address → the same hash (so it can be limited)');
update race_registration_settings set ip_salt = 'another-salt-for-the-test' where id;
select race_test.ok(race_test.ab_hash('203.0.113.9') <> (select ip_hash from race_registration_attempts where event_id = race_test.ab_ev() limit 1), 'hashed IP: a different salt gives a different hash (the stored hash is not reversible without the salt)');
update race_registration_settings set ip_salt = (select ip_salt from (select gen_random_uuid()::text || gen_random_uuid()::text ip_salt) q) where id;
select race_test.ab_age(interval '3 hours');        -- start the limit tests from a clean window (the guard prunes old rows)

-- PER-IP LIMIT (10 minutes) --------------------------------------------------------------------------------------------------------------------
select race_test.ok(race_test.ab_limits(3, 30, 120) ->> 'per_ip_10min' = '3', 'limits: the Event Manager sets 3 / 10 min for the event');
select race_test.ok(race_test.ab_reg('198.51.100.1', 11) ~ '^N', 'per-IP: 1st from 198.51.100.1 accepted');
select race_test.ok(race_test.ab_reg('198.51.100.1', 12) ~ '^N', 'per-IP: 2nd accepted');
select race_test.ok(race_test.ab_reg('198.51.100.1', 13) ~ '^N', 'per-IP: 3rd accepted');
select race_test.eq(race_test.ab_reg('198.51.100.1', 14), 'RACE_RATE_LIMITED', 'per-IP: the 4th from the same address is refused RACE_RATE_LIMITED');
select race_test.eq((select count(*) from race_athletes where full_name = 'Abuse Athlete 14'), 0::bigint, 'per-IP: the refused registration created NOTHING (no athlete, no registration)');
select race_test.eq(race_test.ab_attempts(race_test.ab_hash('198.51.100.1')), 3::bigint, 'per-IP: the refusal consumed no quota and left no row (still exactly 3)');
select race_test.ok(race_test.ab_reg('198.51.100.2', 15) ~ '^N', 'per-IP: a DIFFERENT address is unaffected');
select race_test.eq(race_test.ab_reg('198.51.100.1', 16), 'RACE_RATE_LIMITED', 'per-IP: still refused on a retry (a refusal never extends or shortens the lock)');
select race_test.ab_age(interval '11 minutes');
select race_test.ok(race_test.ab_reg('198.51.100.1', 17) ~ '^N', 'per-IP: after the 10-minute window passes the address may register again');

-- PER-IP LIMIT (hour) ---------------------------------------------------------------------------------------------------------------------------
select race_test.ab_age(interval '3 hours');
select race_test.ok(race_test.ab_limits(50, 4, 120) ->> 'per_ip_hour' = '4', 'limits: hourly limit 4');
select race_test.ok(race_test.ab_reg('198.51.100.3', 21) ~ '^N' and race_test.ab_reg('198.51.100.3', 22) ~ '^N' and race_test.ab_reg('198.51.100.3', 23) ~ '^N' and race_test.ab_reg('198.51.100.3', 24) ~ '^N', 'per-hour: four accepted');
select race_test.eq(race_test.ab_reg('198.51.100.3', 25), 'RACE_RATE_LIMITED', 'per-hour: the 5th within the hour is refused');
select race_test.ab_age(interval '30 minutes');
select race_test.eq(race_test.ab_reg('198.51.100.3', 26), 'RACE_RATE_LIMITED', 'per-hour: still refused 30 minutes later (the 10-minute window alone would have allowed it)');
select race_test.ab_age(interval '40 minutes');
select race_test.ok(race_test.ab_reg('198.51.100.3', 27) ~ '^N', 'per-hour: allowed again after the hour');

-- PER-EVENT LIMIT (flood brake) -----------------------------------------------------------------------------------------------------------------
select race_test.ab_age(interval '3 hours');
select race_test.ok(race_test.ab_limits(50, 100, 4) ->> 'per_event_minute' = '4', 'limits: 4 registrations per minute for the whole event');
select race_test.ok(race_test.ab_reg('192.0.2.1', 31) ~ '^N' and race_test.ab_reg('192.0.2.2', 32) ~ '^N' and race_test.ab_reg('192.0.2.3', 33) ~ '^N' and race_test.ab_reg('192.0.2.4', 34) ~ '^N', 'per-event: four different addresses accepted');
select race_test.eq(race_test.ab_reg('192.0.2.5', 35), 'RACE_RATE_LIMITED', 'per-event: the 5th in the minute is refused even from a brand-new address');
select race_test.eq(race_test.ab_reg(null, 36), 'RACE_RATE_LIMITED', 'per-event: … and from a caller with no IP at all (the ceiling always applies)');
select race_test.ab_age(interval '61 seconds');
select race_test.ok(race_test.ab_reg('192.0.2.5', 37) ~ '^N', 'per-event: a minute later registration is open again');

-- THE IP SOURCE: the LAST x-forwarded-for hop, so a client cannot dodge the limit by prepending addresses ---------------------------------------------
select race_test.ab_age(interval '3 hours');
select race_test.ok(race_test.ab_limits(2, 100, 100) ->> 'per_ip_10min' = '2', 'limits: 2 / 10 min');
select race_test.ok(race_test.ab_reg(null, 41, '1.1.1.1, 203.0.113.50') ~ '^N' and race_test.ab_reg(null, 42, '2.2.2.2, 203.0.113.50') ~ '^N', 'spoofing: two requests with different spoofed leading addresses but the same real (last) hop are accepted');
select race_test.eq(race_test.ab_reg(null, 43, '3.3.3.3, 203.0.113.50'), 'RACE_RATE_LIMITED', 'spoofing: the third is refused — the spoofed prefix did not create a new identity');
select race_test.eq(race_test.ab_attempts(race_test.ab_hash('203.0.113.50')), 2::bigint, 'spoofing: counted against the real hop only');
select race_test.ok(not exists (select 1 from race_registration_attempts where ip_hash in (race_test.ab_hash('1.1.1.1'), race_test.ab_hash('2.2.2.2'), race_test.ab_hash('3.3.3.3'))), 'spoofing: the spoofed addresses were never recorded');
update race_registration_settings set ip_from_right = 2 where id;
select race_test.ok(race_test.ab_reg(null, 44, '9.9.9.9, 203.0.113.50') ~ '^N', 'configurable hop: with from_right = 2 the second-last entry is the identity (a different one → accepted)');
update race_registration_settings set ip_from_right = 1 where id;

-- NO IP KNOWN (a direct database session) -------------------------------------------------------------------------------------------------------
select race_test.ab_age(interval '3 hours');
select race_test.ok(race_test.ab_limits(1, 1, 100) ->> 'per_ip_hour' = '1', 'limits: 1 per IP');
select race_test.ok(race_test.ab_reg(null, 51) ~ '^N' and race_test.ab_reg(null, 52) ~ '^N' and race_test.ab_reg(null, 53) ~ '^N', 'no IP: per-IP limits are skipped when no address can be determined (only the event ceiling applies)');
select race_test.ok(not exists (select 1 from race_registration_attempts where event_id = race_test.ab_ev() and ip_hash is null and false) and exists (select 1 from race_registration_attempts where event_id = race_test.ab_ev() and ip_hash is null), 'no IP: those attempts are recorded with a NULL hash (still counted for the event ceiling)');

-- STAFF EXEMPTION ------------------------------------------------------------------------------------------------------------------------------
select race_test.ab_age(interval '3 hours');
select race_test.ok(race_test.ab_limits(1, 1, 1) ->> 'per_event_minute' = '1', 'limits: the tightest possible (1 / 1 / 1)');
select race_test.login('rec');
select race_test.ok((select count(*) = 6 from (select r.race_number from generate_series(1, 6) i, lateral race_staff_register_athlete(race_test.ab_ev(), 'Door ' || i, '0166' || lpad(i::text, 7, '0'), null, 'male', date '1990-01-01', 'MEN', null, true, '{"name":"W","phone":"01011112222"}') r) q), 'staff exemption: Reception door-registers 6 athletes in a row despite 1 / 1 / 1');
select race_test.ok((select count(*) = 1 from (select set_config('request.headers', '{"x-forwarded-for":"198.18.0.7"}', false)) a, lateral (select race_number from race_register_athlete(race_test.ab_ev(), 'Staff Via Public 1', '01770000001', null, 'male', date '1990-01-01', 'MEN', null, true, '{"name":"W","phone":"01011112222"}')) q), 'staff exemption: event staff using the public form are not limited either (1st)');
select race_test.ok((select count(*) = 1 from race_register_athlete(race_test.ab_ev(), 'Staff Via Public 2', '01770000002', null, 'male', date '1990-01-01', 'MEN', null, true, '{"name":"W","phone":"01011112222"}')), 'staff exemption: … (2nd, same address, same minute)');
reset role; select set_config('request.headers', '', false);
select race_test.eq(race_test.ab_attempts(race_test.ab_hash('198.18.0.7')), 0::bigint, 'staff exemption: nothing was counted for the staff address');
select race_test.ab_age(interval '3 hours');
select race_test.login('nobody');
select set_config('request.headers', '{"x-forwarded-for":"198.18.0.8"}', false);
select race_test.ok((select count(*) = 1 from race_register_athlete(race_test.ab_ev(), 'Signed In Stranger 1', '01880000001', null, 'male', date '1990-01-01', 'MEN', null, true, '{"name":"W","phone":"01011112222"}')), 'staff exemption: a signed-in NON-staff account is limited like anyone else (1st accepted)');
select race_test.throws($$select * from race_register_athlete(race_test.ab_ev(), 'Signed In Stranger 2', '01880000002', null, 'male', date '1990-01-01', 'MEN', null, true, '{"name":"W","phone":"01011112222"}')$$, 'RACE_RATE_LIMITED', 'staff exemption: … and refused on the 2nd');
reset role; select set_config('request.headers', '', false);
select race_test.login('ab_judge');
select race_test.throws($$select * from race_staff_register_athlete(race_test.ab_ev(), 'Judge Door', '01990000001', null, 'male', date '1990-01-01', 'MEN', null, true, '{"name":"W","phone":"01011112222"}')$$, 'RACE_FORBIDDEN', 'staff exemption: a judge still cannot register athletes (the exemption is not a new permission)');
reset role;

-- DISABLE / PER-EVENT OVERRIDE -------------------------------------------------------------------------------------------------------------------
select race_test.ab_age(interval '3 hours');
select race_test.ok(race_test.ab_limits(1, 1, 1, false) ->> 'enabled' = 'false', 'override: limits switched OFF for this event');
select race_test.ok(race_test.ab_reg('198.51.100.60', 61) ~ '^N' and race_test.ab_reg('198.51.100.60', 62) ~ '^N' and race_test.ab_reg('198.51.100.60', 63) ~ '^N', 'override: with limits off nothing is refused and nothing is recorded');
select race_test.eq(race_test.ab_attempts(race_test.ab_hash('198.51.100.60')), 0::bigint, 'override: … and no attempt rows are written while disabled');

-- IDEMPOTENCY / QUOTA BEHAVIOUR --------------------------------------------------------------------------------------------------------------------
select race_test.ab_age(interval '3 hours');
select race_test.ok(race_test.ab_limits(3, 30, 100) ->> 'per_ip_10min' = '3', 'limits: back to 3 / 10 min');
select race_test.ok(race_test.ab_reg('198.51.100.70', 71) ~ '^N', 'idempotency: first registration of person 71 accepted');
select race_test.eq(race_test.ab_reg('198.51.100.70', 71), 'RACE_ALREADY_REGISTERED', 'idempotency: re-submitting the same person is refused as already registered');
select race_test.eq(race_test.ab_reg('198.51.100.70', 71), 'RACE_ALREADY_REGISTERED', 'idempotency: … every time');
select race_test.eq(race_test.ab_attempts(race_test.ab_hash('198.51.100.70')), 1::bigint, 'idempotency: the duplicate submissions consumed NO quota (still 1)');
select race_test.ok(race_test.ab_reg('198.51.100.70', 72) ~ '^N' and race_test.ab_reg('198.51.100.70', 73) ~ '^N', 'idempotency: the address still has its remaining 2 registrations');
select race_test.eq(race_test.ab_reg('198.51.100.70', 74), 'RACE_RATE_LIMITED', 'idempotency: and the 4th is refused');
-- invalid input (name too short) does not consume quota either
select race_test.ab_age(interval '3 hours');
do $$
declare v text;
begin
  perform set_config('request.headers', '{"x-forwarded-for":"198.51.100.71"}', false);
  perform race_test.anon();
  begin
    perform * from race_register_athlete(race_test.ab_ev(), 'X', '01550000099', null, 'male', date '1991-01-01', 'MEN', null, true, '{"name":"F","phone":"01011112222"}'::jsonb);
  exception when others then v := substring(sqlerrm from 'RACE_[A-Z_]+');
  end;
  perform set_config('role', 'postgres', false);
  perform set_config('request.headers', '', false);
  perform race_test.eq(v, 'RACE_INVALID_NAME', 'idempotency: invalid input is refused by the core as before');
end $$;
select race_test.eq(race_test.ab_attempts(race_test.ab_hash('198.51.100.71')), 0::bigint, 'idempotency: … and consumed no quota');
select race_test.ok(race_test.ab_limits(3, 30, 100) = race_test.ab_limits(3, 30, 100), 'idempotency: setting the same limits twice returns the same state');
select race_test.eq((select count(*) from race_registration_limit_overrides where event_id = race_test.ab_ev()), 1::bigint, 'idempotency: … and keeps ONE override row for the event');
insert into race_registration_settings (id) values (true) on conflict (id) do nothing;
select race_test.eq((select count(*) from race_registration_settings), 1::bigint, 'idempotency: the settings seed can be re-applied without creating a second row');

-- PERMISSIONS -----------------------------------------------------------------------------------------------------------------------------------
select race_test.anon();
select race_test.throws($$select * from race_registration_attempts$$, 'permission denied', 'permissions: anonymous cannot read the attempts');
select race_test.throws($$select * from race_registration_settings$$, 'permission denied', 'permissions: anonymous cannot read the settings (the salt)');
select race_test.throws($$select race_registration_guard(race_test.ab_ev())$$, 'permission denied', 'permissions: the guard is not API surface');
select race_test.throws($$select race_request_ip()$$, 'permission denied', 'permissions: the IP reader is not API surface');
select race_test.throws($$select race_set_registration_limits(race_test.ab_ev(), 1, 1, 1, true, 'x')$$, 'permission denied', 'permissions: anonymous cannot change limits');
reset role;
select race_test.login('bm_a');
select race_test.throws($$select * from race_registration_settings$$, 'permission denied', 'permissions: not even the Event Manager can read the salt through the API');
select race_test.throws($$select * from race_registration_attempts$$, 'permission denied', 'permissions: nor the attempts');
select race_test.throws($$select race_set_registration_limits(race_test.ab_ev(), 1, 1, 1, true, '  ')$$, 'RACE_REASON_REQUIRED', 'permissions: a reason is mandatory');
select race_test.throws($$select race_set_registration_limits(race_test.ab_ev(), 0, 1, 1, true, 'bad')$$, 'check|violat', 'permissions: out-of-range values are refused');
select race_test.ok((select count(*) >= 1 from race_audit_log where action = 'race.registration.limits' and metadata ->> 'event_id' = race_test.ab_ev()::text and metadata ->> 'reason' is not null), 'permissions: every limit change is audited with its reason');
reset role;
select race_test.deny('rec', $$select race_set_registration_limits(race_test.ab_ev(), 1, 1, 1, true, 'x')$$, 'RACE_FORBIDDEN', 'permissions: Reception cannot change limits');
select race_test.deny('ab_judge', $$select race_set_registration_limits(race_test.ab_ev(), 1, 1, 1, true, 'x')$$, 'RACE_FORBIDDEN', 'permissions: a Judge cannot change limits');
select race_test.deny('master', $$select race_set_registration_limits(race_test.ab_ev(), 1, 1, 1, true, 'x')$$, 'RACE_FORBIDDEN', 'permissions: Master Control cannot change limits');
select race_test.deny('bm_b', $$select race_set_registration_limits(race_test.ab_ev(), 1, 1, 1, true, 'x')$$, 'RACE_FORBIDDEN', 'permissions: another event''s manager cannot');
select race_test.ok((select count(*) = 0 from race_registration_attempts a join race_events e on e.id = a.event_id where a::text ~ '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+'), 'privacy: no dotted-quad address is stored anywhere in the attempts table');

-- the registration contract is unchanged ----------------------------------------------------------------------------------------------------------
select race_test.ok((select pg_get_function_result(p.oid) = 'TABLE(registration_id uuid, race_number text, access_token text, status race_reg_status, amount_due numeric, currency text)'
                       from pg_proc p where p.proname = 'race_register_athlete'), 'contract: race_register_athlete returns exactly what it returned before');
select race_test.ok(has_function_privilege('anon', 'race_register_athlete(uuid,text,text,text,race_gender,date,race_category_code,race_pushup_style,boolean,jsonb)', 'EXECUTE'), 'contract: still callable by anonymous (it is the public form)');
-- cleanup of this suite's limits so later suites are unaffected
delete from race_registration_limit_overrides;
reset role;
