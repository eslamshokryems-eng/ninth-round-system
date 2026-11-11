-- ===========================================================================
-- Device verification — race-safe attempt counting, replay prevention and
-- issuance limits (additive).
--
-- The problem, measured. verify-code read `attempts`, compared the code, and
-- only then wrote `attempts + 1` back. Nothing serialised those steps, so N
-- parallel requests all read the same value and all passed the "attempts <
-- max_attempts" check. On the local stack 40 parallel wrong guesses against a
-- code limited to 5 resulted in 29 evaluated guesses (36 x HTTP 400, 4 x 429).
-- With a 10^6 code space and a fresh code available every 60 seconds, that is
-- the realistic online attack.
--
-- The fix is structural, not a tighter check: the decision "may this attempt
-- be evaluated at all" and the increment that records it are ONE atomic step
-- in the database. The server is only handed the stored hash if that step
-- granted the attempt, so the number of guesses that can ever be compared is
-- bounded by max_attempts however many requests arrive at once.
--
--   issue_device_verification_code(...)    new code, with limits
--   begin_device_code_attempt(user)        atomically grant ONE attempt
--   complete_device_code_attempt(...)      record the outcome; consume once
--
-- All three are SECURITY DEFINER, pinned search_path, and EXECUTE is granted
-- to service_role ONLY. The tables keep RLS enabled with no policy, so
-- neither a client nor a super admin's browser session can reach any of this
-- directly — the route handlers under apps/web/app/api/auth/device/* call it
-- with the service-role key, exactly as they already did for the tables.
--
-- Hashing. The code hash is now computed by the SERVER as
--   HMAC-SHA256(server_pepper, user_id || ':' || code_id || ':' || code)
-- (apps/web/src/lib/device-verification-crypto.ts). The pepper lives in the
-- server environment, never in the database, so a leaked table or backup no
-- longer yields recoverable codes. The comparison therefore stays in the
-- server; the database never sees a code or the pepper. A code issued before
-- this migration was hashed with a bare SHA-256, will not match an HMAC, and
-- simply expires (TTL 5 minutes).
-- ===========================================================================

-- A successful verification is recorded explicitly, so "failed attempts" can
-- be counted across codes without conflating them with a consumed-by-success
-- or superseded row.
alter table device_verification_codes
  add column if not exists succeeded boolean not null default false;

-- `attempts` counts attempts GRANTED; `attempts_completed` counts attempts whose
-- outcome has been RECORDED. They differ while requests are in flight (the
-- server compares between the two calls). A code is only retired for having
-- spent its attempts once every granted attempt has reported back.
alter table device_verification_codes
  add column if not exists attempts_completed integer not null default 0;

create index if not exists idx_device_verification_codes_user_created
  on device_verification_codes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Limits live here so there is exactly one source for them. The route handler
-- passes none of these in; it cannot loosen them.
-- ---------------------------------------------------------------------------
create or replace function device_verification_limits()
returns table (
  ttl_seconds integer,
  cooldown_seconds integer,
  max_codes_per_hour integer,
  max_codes_per_day integer,
  max_failed_attempts_per_hour integer
)
language sql
immutable
set search_path = ''
as $$
  select 300, 60, 3, 10, 15;
$$;

-- Serialises everything that touches one user's codes. A transaction-scoped
-- advisory lock is released automatically at commit or rollback, so it cannot
-- be leaked by a crashed request.
create or replace function device_verification_lock(p_user_id uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('device_verification:' || p_user_id::text, 0));
$$;

-- Failed guesses by this user across ALL codes in the last hour. A successful
-- attempt is not a failure; every other counted attempt is.
create or replace function device_verification_recent_failures(p_user_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(attempts - case when succeeded then 1 else 0 end), 0)::integer
  from public.device_verification_codes
  where user_id = p_user_id and created_at > now() - interval '1 hour';
$$;

-- ---------------------------------------------------------------------------
-- issue_device_verification_code
--
-- Returns one of: issued | cooldown | hourly_limit | daily_limit | locked
-- ---------------------------------------------------------------------------
create or replace function issue_device_verification_code(
  p_user_id uuid,
  p_code_id uuid,
  p_code_hash text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits record;
  v_last_created timestamptz;
begin
  if p_user_id is null or p_code_id is null or p_code_hash is null or length(p_code_hash) <> 64 then
    raise exception 'invalid device verification code arguments';
  end if;

  perform public.device_verification_lock(p_user_id);
  select * into v_limits from public.device_verification_limits();

  -- A user who has burned through the failure budget cannot mint fresh codes
  -- to get fresh guesses — that is exactly how a 10^6 space gets walked.
  if public.device_verification_recent_failures(p_user_id) >= v_limits.max_failed_attempts_per_hour then
    return 'locked';
  end if;

  select max(created_at) into v_last_created
    from public.device_verification_codes where user_id = p_user_id;
  if v_last_created is not null and v_last_created > now() - make_interval(secs => v_limits.cooldown_seconds) then
    return 'cooldown';
  end if;

  if (select count(*) from public.device_verification_codes
       where user_id = p_user_id and created_at > now() - interval '1 hour') >= v_limits.max_codes_per_hour then
    return 'hourly_limit';
  end if;
  if (select count(*) from public.device_verification_codes
       where user_id = p_user_id and created_at > now() - interval '1 day') >= v_limits.max_codes_per_day then
    return 'daily_limit';
  end if;

  -- Only ONE code may be live at a time: a fresh one supersedes every earlier
  -- unconsumed code, so an old code cannot stay usable alongside a new one.
  update public.device_verification_codes
     set consumed_at = now()
   where user_id = p_user_id and consumed_at is null;

  insert into public.device_verification_codes (id, user_id, code_hash, expires_at)
  values (p_code_id, p_user_id, p_code_hash, now() + make_interval(secs => v_limits.ttl_seconds));

  return 'issued';
end;
$$;

-- ---------------------------------------------------------------------------
-- begin_device_code_attempt
--
-- Atomically decides whether ONE comparison may be made, and records it. The
-- stored hash is returned ONLY when status = 'ok'. Every other status carries
-- a NULL hash, so a caller cannot evaluate a guess that was not granted.
--
-- status: ok | not_found | expired | locked
-- ---------------------------------------------------------------------------
create or replace function begin_device_code_attempt(p_user_id uuid)
returns table (status text, code_id uuid, code_hash text, attempts_used integer, attempts_max integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limits record;
  v_row public.device_verification_codes%rowtype;
begin
  if p_user_id is null then
    raise exception 'invalid device verification attempt arguments';
  end if;

  perform public.device_verification_lock(p_user_id);
  select * into v_limits from public.device_verification_limits();

  if public.device_verification_recent_failures(p_user_id) >= v_limits.max_failed_attempts_per_hour then
    return query select 'locked'::text, null::uuid, null::text, null::integer, null::integer;
    return;
  end if;

  select * into v_row
    from public.device_verification_codes
   where user_id = p_user_id and consumed_at is null
   order by created_at desc
   limit 1
   for update;

  if v_row.id is null then
    return query select 'not_found'::text, null::uuid, null::text, null::integer, null::integer;
    return;
  end if;

  if v_row.expires_at <= now() then
    update public.device_verification_codes set consumed_at = now() where id = v_row.id;
    return query select 'expired'::text, null::uuid, null::text, v_row.attempts, v_row.max_attempts;
    return;
  end if;

  -- Refuse, but do NOT consume. Attempts already granted may still be in
  -- flight (the route compares in the server between begin and complete), and
  -- one of them can be the correct code. Consuming here would let the first
  -- request past the limit destroy a legitimate in-flight verification — found
  -- by the HTTP-level test, where 6+ simultaneous correct submissions all
  -- came back "replayed". The code is consumed by complete_device_code_attempt
  -- when the last granted attempt records a failure, or by expiry/supersession.
  if v_row.attempts >= v_row.max_attempts then
    return query select 'locked'::text, null::uuid, null::text, v_row.attempts, v_row.max_attempts;
    return;
  end if;

  -- The increment and the decision are the same statement sequence under the
  -- per-user lock: no other request can read this row between them.
  update public.device_verification_codes
     set attempts = attempts + 1
   where id = v_row.id
   returning attempts into v_row.attempts;

  return query select 'ok'::text, v_row.id, v_row.code_hash, v_row.attempts, v_row.max_attempts;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_device_code_attempt
--
-- Records the outcome of an attempt that begin_device_code_attempt() granted.
--
-- matched = true  -> verified | replayed
--   The code is consumed with `consumed_at is null and expires_at > now()` in
--   the WHERE clause, so of any number of simultaneous correct submissions
--   exactly ONE gets a row back; the rest are 'replayed'. A code that has
--   already been used, superseded, locked or has expired can never verify.
-- matched = false -> invalid | locked
--   Reaching max_attempts consumes the code, so it cannot be tried again.
-- ---------------------------------------------------------------------------
create or replace function complete_device_code_attempt(
  p_user_id uuid,
  p_code_id uuid,
  p_matched boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.device_verification_codes%rowtype;
begin
  if p_user_id is null or p_code_id is null or p_matched is null then
    raise exception 'invalid device verification completion arguments';
  end if;

  perform public.device_verification_lock(p_user_id);

  if p_matched then
    update public.device_verification_codes
       set consumed_at = now(), succeeded = true
     where id = p_code_id and user_id = p_user_id
       and consumed_at is null and expires_at > now()
    returning * into v_row;

    if v_row.id is null then
      return 'replayed';
    end if;
    return 'verified';
  end if;

  -- Lock the row, count this outcome, and retire the code only when EVERY
  -- granted attempt has now reported a failure. Retiring it on the first
  -- failure after the limit would destroy a correct attempt still in flight.
  update public.device_verification_codes
     set attempts_completed = attempts_completed + 1
   where id = p_code_id and user_id = p_user_id
  returning * into v_row;

  if v_row.id is not null and v_row.consumed_at is null
     and v_row.attempts >= v_row.max_attempts
     and v_row.attempts_completed >= v_row.attempts then
    update public.device_verification_codes set consumed_at = now() where id = v_row.id;
    return 'locked';
  end if;
  return 'invalid';
end;
$$;

-- ---------------------------------------------------------------------------
-- Least privilege. Postgres grants EXECUTE on a new function to PUBLIC, which
-- would let `anon` call these through the REST API. None of them is meant for
-- a client at all — only the server's route handlers, with the service-role
-- key. BYPASSRLS does not bypass function EXECUTE grants, so the explicit
-- grant to service_role is load-bearing (see 20261111000001).
-- ---------------------------------------------------------------------------
revoke execute on function device_verification_limits() from public, anon, authenticated;
revoke execute on function device_verification_lock(uuid) from public, anon, authenticated;
revoke execute on function device_verification_recent_failures(uuid) from public, anon, authenticated;
revoke execute on function issue_device_verification_code(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function begin_device_code_attempt(uuid) from public, anon, authenticated;
revoke execute on function complete_device_code_attempt(uuid, uuid, boolean) from public, anon, authenticated;

grant execute on function device_verification_limits() to service_role;
grant execute on function device_verification_lock(uuid) to service_role;
grant execute on function device_verification_recent_failures(uuid) to service_role;
grant execute on function issue_device_verification_code(uuid, uuid, text) to service_role;
grant execute on function begin_device_code_attempt(uuid) to service_role;
grant execute on function complete_device_code_attempt(uuid, uuid, boolean) to service_role;

comment on function begin_device_code_attempt(uuid) is
  'Atomically grants at most max_attempts comparisons per code. Returns the stored hash only when status = ok. Service role only.';
comment on function complete_device_code_attempt(uuid, uuid, boolean) is
  'Consumes a code exactly once on success (replay-safe) and locks it out when its attempts are spent. Service role only.';
comment on function issue_device_verification_code(uuid, uuid, text) is
  'Issues a code subject to cooldown, hourly and daily caps and a cumulative failure lockout; supersedes any earlier live code. Service role only.';
