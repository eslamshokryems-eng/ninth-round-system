-- THE NINTH race system — Phase 4: athlete registration, race numbers,
-- manual payments, athlete self-service and reception search.
--
-- Same isolation rules as the Phase 3 race migrations: race_* objects only,
-- no gym object is altered, RLS on, no API grants unless stated. Every RPC
-- here is SECURITY DEFINER with a pinned search_path and NULL-safe guards
-- (`is not true`, see 20260929000001 for why).
--
-- What this adds
--   * race_events: registration_fee / registration_currency / instructions
--   * race_athletes.phone_normalized (generated) for duplicate detection + search
--   * race_registrations.access_token_hash — the athlete's secret link
--   * race_event_counters — gapless, race-safe race numbers (N001, N002 …)
--   * RPCs: race_register_athlete (public), race_staff_register_athlete,
--           race_get_registration / race_update_pushup_style (token),
--           race_confirm_payment / race_waive_payment / race_refund_payment /
--           race_cancel_registration (staff), race_list_registrations (staff),
--           race_planned_heat_starts
--   * guards: payment status machine, registration status machine
--   * fix: race_event_schedule() now reports real heat numbers when a heat is empty
--   * fix: race_audit_row() never logs access_token_hash

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table race_events
  add column registration_fee numeric(10, 2) not null default 0 check (registration_fee >= 0),
  add column registration_currency char(3) not null default 'EGP',
  add column instructions text;

-- NOTE: race_events (incl. config/instructions) is readable by anon for any
-- published event. Never put secrets in race_events.config.
grant update (registration_fee, registration_currency, instructions) on race_events to authenticated;

create or replace function race_normalize_phone(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when d ~ '^0020' then '0' || substr(d, 5)
    when d ~ '^20[0-9]{10}$' then '0' || substr(d, 3)
    when d ~ '^1[0-9]{9}$' then '0' || d
    else d
  end
  from (select regexp_replace(
                 translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
                 '[^0-9]', '', 'g') as d) s  -- Arabic-Indic and Persian digits count as digits
$$;

alter table race_athletes
  add column phone_normalized text generated always as (public.race_normalize_phone(phone)) stored;
create index idx_race_athletes_phone_norm on race_athletes (phone_normalized, lower(full_name));

alter table race_registrations
  add column access_token_hash text unique;

create table race_event_counters (
  event_id uuid primary key references race_events (id) on delete cascade,
  last_number int not null default 0 check (last_number between 0 and 9999)
);
alter table race_event_counters enable row level security;
revoke all on race_event_counters from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit: never write the token hash (or anything token-like) to the audit log,
-- and audit payments (money) like every other configuration/business change.
-- ---------------------------------------------------------------------------

create or replace function race_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := case when TG_OP <> 'DELETE' then to_jsonb(NEW) - 'access_token_hash' end;
  v_old jsonb := case when TG_OP <> 'INSERT' then to_jsonb(OLD) - 'access_token_hash' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_event uuid := case when TG_TABLE_NAME = 'race_events' then (v_row ->> 'id')::uuid
                       else (v_row ->> 'event_id')::uuid end;
  v_changed text[];
begin
  if TG_OP = 'UPDATE' then
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n join jsonb_each(v_old) o using (key)
    where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_changed is null then
      return null;  -- no-op update: nothing to audit
    end if;
  end if;

  perform public.race_log_audit_event(
    'race.' || substr(TG_TABLE_NAME, 6) || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    (v_row ->> 'id')::uuid,
    v_old,
    v_new,
    jsonb_build_object('event_id', v_event, 'changed_fields', to_jsonb(v_changed))
  );
  return null;
end;
$$;

create trigger trg_race_payments_audit after insert or update on race_payments
  for each row execute function race_audit_row();

-- ---------------------------------------------------------------------------
-- Status machines (enforced for every writer, including the RPC owner)
-- ---------------------------------------------------------------------------

create or replace function race_guard_payment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (NEW.registration_id, NEW.event_id, NEW.provider) is distinct from (OLD.registration_id, OLD.event_id, OLD.provider) then
    raise exception 'RACE_PAYMENT_IMMUTABLE: payment ownership and provider never change' using errcode = 'check_violation';
  end if;
  if NEW.status = OLD.status then
    if OLD.status <> 'PENDING'
       and (NEW.amount, NEW.currency, NEW.method, NEW.paid_at, NEW.refunded_at, NEW.cancelled_at)
           is distinct from (OLD.amount, OLD.currency, OLD.method, OLD.paid_at, OLD.refunded_at, OLD.cancelled_at) then
      raise exception 'RACE_PAYMENT_IMMUTABLE: a % payment can no longer change', OLD.status using errcode = 'check_violation';
    end if;
    return NEW;
  end if;
  if not ((OLD.status = 'PENDING' and NEW.status in ('PAID', 'CANCELLED'))
       or (OLD.status = 'PAID' and NEW.status = 'REFUNDED')) then
    raise exception 'RACE_INVALID_PAYMENT_TRANSITION: % -> %', OLD.status, NEW.status using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;
create trigger trg_race_payments_guard before update on race_payments
  for each row execute function race_guard_payment();

create or replace function race_guard_registration_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' and OLD.status = 'CANCELLED' and NEW.status <> 'CANCELLED' then
    raise exception 'RACE_REGISTRATION_CANCELLED: a cancelled registration cannot be reactivated' using errcode = 'check_violation';
  end if;
  if NEW.status = 'CONFIRMED' and (TG_OP = 'INSERT' or OLD.status <> 'CONFIRMED') then
    if NEW.payment_waived_by is null
       and not exists (select 1 from public.race_payments p where p.registration_id = NEW.id and p.status = 'PAID')
       and (select e.registration_fee from public.race_events e where e.id = NEW.event_id) > 0 then
      raise exception 'RACE_PAYMENT_REQUIRED: a registration is CONFIRMED only when paid, waived, or free'
        using errcode = 'check_violation';
    end if;
  end if;
  return NEW;
end;
$$;
create trigger trg_race_registrations_status_guard before insert or update on race_registrations
  for each row execute function race_guard_registration_status();

-- ---------------------------------------------------------------------------
-- Planned heat starts (pre-START EVENT view). Maps plan positions back to the
-- real heat numbers, so an empty heat (e.g. heat 3 of 1,2,3,4) cannot shift labels.
-- ---------------------------------------------------------------------------

create or replace function race_planned_heat_starts(p_event_id uuid)
returns table (heat_id uuid, heat_number smallint, slot_count int, anchor_ms bigint)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.race_events;
  v_ids uuid[];
  v_nums smallint[];
  v_sizes int[];
begin
  select * into e from public.race_events where id = p_event_id;
  if e.id is null then
    return;
  end if;
  select array_agg(s.id order by s.number), array_agg(s.number order by s.number), array_agg(s.sz order by s.number)
    into v_ids, v_nums, v_sizes
  from (
    select h.id, h.number,
           coalesce(h.planned_slot_count,
                    (select count(*) from public.race_registrations r
                      where r.heat_id = h.id and r.status <> 'CANCELLED' and r.race_status <> 'WITHDRAWN'))::int as sz
    from public.race_heats h where h.event_id = p_event_id
  ) s
  where s.sz > 0;
  if v_sizes is null then
    return;
  end if;
  return query
    select v_ids[p.hn], v_nums[p.hn], v_sizes[p.hn], p.anchor
    from (select distinct ps.heat_number as hn, ps.heat_anchor_ms as anchor
          from public.race_plan_schedule(v_sizes, e.first_start_offset_ms, e.start_interval_ms, e.work_ms,
                 e.heat_gap_ms, e.bind_lead_ms, e.announce_lead_ms, e.station_count) ps) p;
end;
$$;
revoke execute on function race_planned_heat_starts(uuid) from public, anon, authenticated;

create or replace function race_event_schedule(p_event_id uuid)
returns table (
  athlete_no int, heat_number int, slot_index int,
  slot_start_ms bigint, bind_at_ms bigint, announce_at_ms bigint,
  s09_start_ms bigint, finish_ms bigint,
  heat_anchor_ms bigint, heat_last_start_ms bigint, next_heat_anchor_ms bigint
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.race_events;
  v_nums smallint[];
  v_sizes int[];
begin
  if public.race_event_visible(p_event_id) is not true then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  select * into e from public.race_events where id = p_event_id;
  select array_agg(s.number order by s.number), array_agg(s.sz order by s.number) into v_nums, v_sizes
  from (
    select h.number,
           coalesce(h.planned_slot_count,
                    (select count(*) from public.race_registrations r
                      where r.heat_id = h.id and r.status <> 'CANCELLED' and r.race_status <> 'WITHDRAWN'))::int as sz
    from public.race_heats h where h.event_id = p_event_id
  ) s
  where s.sz > 0;
  return query
    select p.athlete_no, v_nums[p.heat_number]::int, p.slot_index, p.slot_start_ms, p.bind_at_ms, p.announce_at_ms,
           p.s09_start_ms, p.finish_ms, p.heat_anchor_ms, p.heat_last_start_ms, p.next_heat_anchor_ms
    from public.race_plan_schedule(coalesce(v_sizes, '{}'), e.first_start_offset_ms, e.start_interval_ms, e.work_ms,
           e.heat_gap_ms, e.bind_lead_ms, e.announce_lead_ms, e.station_count) p;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registration
-- ---------------------------------------------------------------------------

create or replace function race_can_register_athletes(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.race_is_manager(p_event_id)
      or public.race_has_role(p_event_id, array['RECEPTION']::public.race_role[]);
$$;

-- Shared implementation; NOT callable by API roles (only via the two wrappers).
create or replace function race_register_core(
  p_event_id uuid, p_full_name text, p_phone text, p_email text, p_gender public.race_gender,
  p_date_of_birth date, p_category public.race_category_code, p_pushup_style public.race_pushup_style,
  p_waiver_accepted boolean, p_emergency_contact jsonb,
  p_allowed_statuses public.race_event_status[], p_link_profile boolean
)
returns table (
  registration_id uuid, race_number text, access_token text,
  status public.race_reg_status, amount_due numeric, currency text
)
language plpgsql volatile security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  e public.race_events;
  cat public.race_categories;
  v_name text := trim(coalesce(p_full_name, ''));
  v_phone text := public.race_normalize_phone(p_phone);
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_style public.race_pushup_style;
  v_athlete uuid;
  v_seq int;
  v_number text;
  v_token text;
  v_reg uuid;
  v_status public.race_reg_status;
  v_age int;
begin
  select * into e from public.race_events where id = p_event_id for share;
  if e.id is null or not (e.status = any (p_allowed_statuses)) then
    raise exception 'RACE_REGISTRATION_CLOSED: registration is not open for this event' using errcode = 'check_violation';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'RACE_INVALID_NAME: enter the athlete''s full name' using errcode = 'check_violation';
  end if;
  if length(v_phone) < 8 or length(v_phone) > 15 then
    raise exception 'RACE_INVALID_PHONE: enter a valid phone number' using errcode = 'check_violation';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'RACE_INVALID_EMAIL: enter a valid email address' using errcode = 'check_violation';
  end if;
  if p_waiver_accepted is not true then
    raise exception 'RACE_WAIVER_REQUIRED: the athlete must accept the waiver' using errcode = 'check_violation';
  end if;
  if p_emergency_contact is null or jsonb_typeof(p_emergency_contact) <> 'object'
     or length(trim(coalesce(p_emergency_contact ->> 'name', ''))) = 0
     or length(public.race_normalize_phone(p_emergency_contact ->> 'phone')) < 8 then
    raise exception 'RACE_EMERGENCY_CONTACT_REQUIRED: an emergency contact name and phone are required'
      using errcode = 'check_violation';
  end if;

  select * into cat from public.race_categories where event_id = p_event_id and code = p_category;
  if cat.id is null then
    raise exception 'RACE_INVALID_CATEGORY' using errcode = 'check_violation';
  end if;

  if p_date_of_birth is not null then
    v_age := extract(year from age(e.event_date, p_date_of_birth))::int;
    if p_date_of_birth >= e.event_date or v_age > 110 then
      raise exception 'RACE_INVALID_DOB: check the date of birth' using errcode = 'check_violation';
    end if;
  end if;
  if p_category = 'MEN' and p_gender is distinct from 'male' then
    raise exception 'RACE_CATEGORY_GENDER: the Men category is for male athletes' using errcode = 'check_violation';
  end if;
  if p_category = 'WOMEN' and p_gender is distinct from 'female' then
    raise exception 'RACE_CATEGORY_GENDER: the Women category is for female athletes' using errcode = 'check_violation';
  end if;
  if cat.min_age is not null then
    if p_date_of_birth is null then
      raise exception 'RACE_DOB_REQUIRED: date of birth is required for the % category', cat.name using errcode = 'check_violation';
    end if;
    if v_age < cat.min_age then
      raise exception 'RACE_CATEGORY_AGE: % is for athletes aged % or older on the event date', cat.name, cat.min_age
        using errcode = 'check_violation';
    end if;
  end if;

  -- Push-up style: the category default, or KNEE (any athlete may choose Knee).
  v_style := coalesce(p_pushup_style, cat.default_pushup_style);
  if v_style = 'STANDARD' and cat.default_pushup_style <> 'STANDARD' then
    raise exception 'RACE_PUSHUP_STYLE_NOT_ALLOWED: % athletes use Knee push-ups', cat.name using errcode = 'check_violation';
  end if;

  -- Serialize concurrent submissions of the SAME person (double-click, two devices), so
  -- duplicate detection below is atomic. Different people never wait on each other here.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || v_phone || ':' || lower(v_name), 0));

  -- Same person = same normalized phone + same name (a shared family phone still works).
  select a.id into v_athlete from public.race_athletes a
   where a.phone_normalized = v_phone and lower(a.full_name) = lower(v_name)
   order by a.created_at limit 1;
  if v_athlete is null then
    insert into public.race_athletes (profile_id, full_name, phone, email, gender, date_of_birth, emergency_contact)
    values (case when p_link_profile
                  and auth.uid() is not null
                  and not exists (select 1 from public.race_athletes x where x.profile_id = auth.uid())
                 then auth.uid() end,
            v_name, trim(p_phone), v_email, p_gender, p_date_of_birth, p_emergency_contact)
    returning id into v_athlete;
  elsif exists (select 1 from public.race_registrations r where r.event_id = p_event_id and r.athlete_id = v_athlete) then
    raise exception 'RACE_ALREADY_REGISTERED: this athlete is already registered for the event' using errcode = 'unique_violation';
  end if;

  -- Gapless, race-safe race number: the counter row is locked until this transaction ends,
  -- and a failure anywhere below rolls the increment back with it.
  insert into public.race_event_counters as c (event_id, last_number) values (p_event_id, 1)
  on conflict (event_id) do update set last_number = c.last_number + 1
  returning c.last_number into v_seq;
  if v_seq > 9999 then
    raise exception 'RACE_NUMBERS_EXHAUSTED' using errcode = 'check_violation';
  end if;
  v_number := 'N' || lpad(v_seq::text, 3, '0');

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_status := case when e.registration_fee > 0 then 'PENDING_PAYMENT' else 'CONFIRMED' end;

  insert into public.race_registrations (event_id, athlete_id, category_id, race_number, status, pushup_style,
                                         waiver_accepted_at, access_token_hash)
  values (p_event_id, v_athlete, cat.id, v_number, v_status, v_style, clock_timestamp(),
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  returning id into v_reg;

  if e.registration_fee > 0 then
    insert into public.race_payments (event_id, registration_id, amount, currency, status, provider)
    values (p_event_id, v_reg, e.registration_fee, e.registration_currency, 'PENDING', 'MANUAL');
  end if;

  return query select v_reg, v_number, v_token, v_status, e.registration_fee, e.registration_currency::text;
end;
$$;
revoke execute on function race_register_core(uuid, text, text, text, public.race_gender, date, public.race_category_code,
  public.race_pushup_style, boolean, jsonb, public.race_event_status[], boolean) from public, anon, authenticated;

-- Public online registration (anon or signed-in athlete). Returns the athlete's
-- secret token ONCE; only its SHA-256 is stored.
create or replace function race_register_athlete(
  p_event_id uuid, p_full_name text, p_phone text, p_email text, p_gender public.race_gender,
  p_date_of_birth date, p_category public.race_category_code, p_pushup_style public.race_pushup_style default null,
  p_waiver_accepted boolean default false, p_emergency_contact jsonb default null
)
returns table (
  registration_id uuid, race_number text, access_token text,
  status public.race_reg_status, amount_due numeric, currency text
)
language sql volatile security definer
set search_path = ''
as $$
  select * from public.race_register_core(p_event_id, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
    p_category, p_pushup_style, p_waiver_accepted, p_emergency_contact,
    array['REGISTRATION_OPEN']::public.race_event_status[], true);
$$;
grant execute on function race_register_athlete(uuid, text, text, text, public.race_gender, date, public.race_category_code,
  public.race_pushup_style, boolean, jsonb) to anon, authenticated;

-- Reception / Event Manager registers an athlete on their behalf (phone/walk-in),
-- until heats are locked.
create or replace function race_staff_register_athlete(
  p_event_id uuid, p_full_name text, p_phone text, p_email text, p_gender public.race_gender,
  p_date_of_birth date, p_category public.race_category_code, p_pushup_style public.race_pushup_style default null,
  p_waiver_accepted boolean default false, p_emergency_contact jsonb default null
)
returns table (
  registration_id uuid, race_number text, access_token text,
  status public.race_reg_status, amount_due numeric, currency text
)
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if public.race_can_register_athletes(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if public.race_heats_locked(p_event_id) then
    raise exception 'RACE_HEATS_LOCKED: heats are locked; new athletes need an authorized change' using errcode = 'check_violation';
  end if;
  return query select * from public.race_register_core(p_event_id, p_full_name, p_phone, p_email, p_gender,
    p_date_of_birth, p_category, p_pushup_style, p_waiver_accepted, p_emergency_contact,
    array['REGISTRATION_OPEN', 'REGISTRATION_CLOSED']::public.race_event_status[], false);
end;
$$;
grant execute on function race_staff_register_athlete(uuid, text, text, text, public.race_gender, date,
  public.race_category_code, public.race_pushup_style, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Athlete self-service (secret token)
-- ---------------------------------------------------------------------------

create or replace function race_get_registration(p_token text)
returns table (
  registration_id uuid, race_number text, full_name text,
  category_code public.race_category_code, category_name text,
  status public.race_reg_status, race_status public.race_status,
  pushup_style public.race_pushup_style, pushup_style_locked boolean,
  heat_number smallint, heat_start_at timestamptz, checkin_closes_at timestamptz,
  event_name text, event_slug text, event_date date, venue text, timezone text, instructions text,
  payment_status public.race_payment_status, payment_amount numeric, currency text
)
language sql stable security definer
set search_path = ''
as $$
  select r.id, r.race_number, a.full_name, c.code, c.name, r.status, r.race_status, r.pushup_style,
         r.pushup_style_locked_at is not null,
         h.number,
         case when e.heats_locked_at is not null and e.planned_start_at is not null and ph.anchor_ms is not null
              then e.planned_start_at + make_interval(secs => ph.anchor_ms / 1000.0) end,
         case when e.heats_locked_at is not null and e.planned_start_at is not null and ph.anchor_ms is not null
              then e.planned_start_at + make_interval(secs => (ph.anchor_ms - e.checkin_deadline_before_heat_ms) / 1000.0) end,
         e.name, e.slug, e.event_date, e.venue, e.timezone, e.instructions,
         p.status, p.amount, e.registration_currency::text
  from public.race_registrations r
  join public.race_athletes a on a.id = r.athlete_id
  join public.race_categories c on c.id = r.category_id
  join public.race_events e on e.id = r.event_id
  left join public.race_heats h on h.id = r.heat_id
  left join lateral public.race_planned_heat_starts(r.event_id) ph on ph.heat_id = r.heat_id
  left join lateral (select x.status, x.amount from public.race_payments x
                      where x.registration_id = r.id order by x.created_at desc limit 1) p on true
  where r.access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and length(coalesce(p_token, '')) >= 32
$$;
grant execute on function race_get_registration(text) to anon, authenticated;

create or replace function race_update_pushup_style(p_token text, p_style public.race_pushup_style)
returns public.race_pushup_style
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.race_registrations;
  v_default public.race_pushup_style;
begin
  select * into r from public.race_registrations
   where access_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
     and length(coalesce(p_token, '')) >= 32
   for update;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if r.status = 'CANCELLED' then
    raise exception 'RACE_REGISTRATION_CANCELLED' using errcode = 'check_violation';
  end if;
  if r.pushup_style_locked_at is not null then
    raise exception 'RACE_PUSHUP_STYLE_LOCKED: push-up style is locked once Station 02 starts' using errcode = 'check_violation';
  end if;
  select default_pushup_style into v_default from public.race_categories where id = r.category_id;
  if p_style = 'STANDARD' and v_default <> 'STANDARD' then
    raise exception 'RACE_PUSHUP_STYLE_NOT_ALLOWED: this category uses Knee push-ups' using errcode = 'check_violation';
  end if;
  update public.race_registrations set pushup_style = p_style where id = r.id;
  return p_style;
end;
$$;
grant execute on function race_update_pushup_style(text, public.race_pushup_style) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Manual payments (D-11). PENDING / PAID / REFUNDED / CANCELLED; Paymob later
-- = a new provider value + a webhook RPC writing race_payment_events.
-- ---------------------------------------------------------------------------

create or replace function race_confirm_payment(
  p_registration_id uuid, p_method public.race_payment_method, p_amount numeric default null,
  p_notes text default null, p_idempotency_key text default null
)
returns uuid
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.race_registrations;
  pay public.race_payments;
  e public.race_events;
begin
  select * into r from public.race_registrations where id = p_registration_id for update;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_can_register_athletes(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if p_method not in ('CASH', 'INSTAPAY', 'VODAFONE_CASH', 'CARD_POS', 'BANK_TRANSFER') then
    raise exception 'RACE_INVALID_PAYMENT_METHOD: manual confirmation supports cash, InstaPay, Vodafone Cash, card POS, bank transfer'
      using errcode = 'check_violation';
  end if;

  if p_idempotency_key is not null then
    select * into pay from public.race_payments where idempotency_key = p_idempotency_key;
    if pay.id is not null then
      if pay.registration_id <> r.id then
        raise exception 'RACE_IDEMPOTENCY_CONFLICT' using errcode = 'unique_violation';
      end if;
      return pay.id;  -- retry of the same request: never records a second payment
    end if;
  end if;

  if r.status = 'CANCELLED' then
    raise exception 'RACE_REGISTRATION_CANCELLED' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.race_payments x where x.registration_id = r.id and x.status = 'PAID') then
    raise exception 'RACE_ALREADY_PAID' using errcode = 'check_violation';
  end if;

  select * into e from public.race_events where id = r.event_id;
  select * into pay from public.race_payments x where x.registration_id = r.id and x.status = 'PENDING'
   order by x.created_at desc limit 1 for update;
  if pay.id is null then
    insert into public.race_payments (event_id, registration_id, amount, currency, status, provider)
    values (r.event_id, r.id, e.registration_fee, e.registration_currency, 'PENDING', 'MANUAL')
    returning * into pay;
  end if;
  if p_amount is not null and p_amount <> pay.amount then
    if p_amount < 0 or length(trim(coalesce(p_notes, ''))) = 0 then
      raise exception 'RACE_AMOUNT_MISMATCH: an amount different from the fee (%) needs a note', pay.amount
        using errcode = 'check_violation';
    end if;
  end if;

  update public.race_payments
     set status = 'PAID', method = p_method, amount = coalesce(p_amount, amount), paid_at = clock_timestamp(),
         recorded_by = auth.uid(), notes = p_notes, idempotency_key = p_idempotency_key
   where id = pay.id;
  if r.status = 'PENDING_PAYMENT' then
    update public.race_registrations set status = 'CONFIRMED' where id = r.id;
  end if;
  return pay.id;
end;
$$;
grant execute on function race_confirm_payment(uuid, public.race_payment_method, numeric, text, text) to authenticated;

create or replace function race_waive_payment(p_registration_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.race_registrations;
begin
  select * into r from public.race_registrations where id = p_registration_id for update;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_manager(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  if r.status = 'CANCELLED' then
    raise exception 'RACE_REGISTRATION_CANCELLED' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.race_payments x where x.registration_id = r.id and x.status = 'PAID') then
    raise exception 'RACE_ALREADY_PAID' using errcode = 'check_violation';
  end if;
  update public.race_payments set status = 'CANCELLED', cancelled_at = clock_timestamp(),
         notes = 'Waived: ' || p_reason
   where registration_id = r.id and status = 'PENDING';
  update public.race_registrations set payment_waived_by = auth.uid(), payment_waiver_reason = p_reason,
         status = 'CONFIRMED'
   where id = r.id;
end;
$$;
grant execute on function race_waive_payment(uuid, text) to authenticated;

create or replace function race_refund_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  pay public.race_payments;
  r public.race_registrations;
begin
  select * into pay from public.race_payments where id = p_payment_id for update;
  if pay.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_manager(pay.event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  if pay.status <> 'PAID' then
    raise exception 'RACE_INVALID_PAYMENT_TRANSITION: only a PAID payment can be refunded' using errcode = 'check_violation';
  end if;
  select * into r from public.race_registrations where id = pay.registration_id for update;
  if r.race_status <> 'REGISTERED' then
    raise exception 'RACE_ATHLETE_ALREADY_CHECKED_IN: use the race-control withdrawal workflow after check-in'
      using errcode = 'check_violation';
  end if;
  update public.race_payments set status = 'REFUNDED', refunded_at = clock_timestamp(),
         notes = coalesce(notes || E'\n', '') || 'Refunded: ' || p_reason
   where id = pay.id;
  update public.race_registrations set status = 'CANCELLED', heat_id = null where id = r.id;
end;
$$;
grant execute on function race_refund_payment(uuid, text) to authenticated;

create or replace function race_cancel_registration(p_registration_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  r public.race_registrations;
begin
  select * into r from public.race_registrations where id = p_registration_id for update;
  if r.id is null then
    raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if public.race_is_manager(r.event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED' using errcode = 'check_violation';
  end if;
  if r.status = 'CANCELLED' then
    return;
  end if;
  if r.race_status <> 'REGISTERED' then
    raise exception 'RACE_ATHLETE_ALREADY_CHECKED_IN: use the race-control withdrawal workflow after check-in'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.race_payments x where x.registration_id = r.id and x.status = 'PAID') then
    raise exception 'RACE_REFUND_REQUIRED: refund the payment first' using errcode = 'check_violation';
  end if;
  update public.race_payments set status = 'CANCELLED', cancelled_at = clock_timestamp(),
         notes = 'Registration cancelled: ' || p_reason
   where registration_id = r.id and status = 'PENDING';
  update public.race_registrations set status = 'CANCELLED', heat_id = null where id = r.id;
  perform public.race_audit('race.registration.cancel', r.event_id, 'race_registrations', r.id,
    null, null, jsonb_build_object('reason', p_reason, 'race_number', r.race_number));
end;
$$;
grant execute on function race_cancel_registration(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Staff list + search (reception preferred search: race number → then phone → name)
-- ---------------------------------------------------------------------------

create or replace function race_list_registrations(p_event_id uuid, p_query text default null, p_limit int default 200)
returns table (
  registration_id uuid, race_number text, full_name text, phone text, email text, gender public.race_gender,
  category_code public.race_category_code, heat_id uuid, heat_number smallint,
  status public.race_reg_status, race_status public.race_status, pushup_style public.race_pushup_style,
  payment_id uuid, payment_status public.race_payment_status, payment_amount numeric,
  payment_method public.race_payment_method, paid_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
  v_ascii text := translate(v_q, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  v_digits text := regexp_replace(v_ascii, '[^0-9]', '', 'g');
  v_number text;
begin
  if public.race_is_ops(p_event_id) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  -- "27", "n27", "N027" all mean N027.
  if v_ascii ~* '^n?[0-9]{1,4}$' then
    v_number := 'N' || lpad(v_digits, 3, '0');
  end if;
  return query
    select r.id, r.race_number, a.full_name, a.phone, a.email, a.gender, c.code, r.heat_id, h.number,
           r.status, r.race_status, r.pushup_style, p.id, p.status, p.amount, p.method, p.paid_at, r.created_at
    from public.race_registrations r
    join public.race_athletes a on a.id = r.athlete_id
    join public.race_categories c on c.id = r.category_id
    left join public.race_heats h on h.id = r.heat_id
    left join lateral (select x.* from public.race_payments x where x.registration_id = r.id
                        order by x.created_at desc limit 1) p on true
    where r.event_id = p_event_id
      and (v_q = ''
           or (v_number is not null and r.race_number = v_number)
           or (v_number is null and length(v_digits) >= 6 and a.phone_normalized like '%' || public.race_normalize_phone(v_digits) || '%')
           or (v_number is null and length(v_digits) < 6 and a.full_name ilike '%' || v_q || '%')
           or (v_number is null and length(v_digits) >= 6 and a.full_name ilike '%' || v_q || '%'))
    order by r.race_number
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;
grant execute on function race_list_registrations(uuid, text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Public event page. Anonymous visitors cannot read tables, so the registration
-- site gets exactly this projection (published events only; staff also see DRAFT).
-- ---------------------------------------------------------------------------

create or replace function race_get_public_event(p_slug text)
returns table (
  event_id uuid, slug text, name text, event_date date, venue text, timezone text,
  status public.race_event_status, registration_open boolean,
  registration_fee numeric, currency text, instructions text,
  planned_start_at timestamptz, heats_locked boolean
)
language sql stable security definer
set search_path = ''
as $$
  select e.id, e.slug, e.name, e.event_date, e.venue, e.timezone, e.status,
         e.status = 'REGISTRATION_OPEN', e.registration_fee, e.registration_currency::text, e.instructions,
         e.planned_start_at, e.heats_locked_at is not null
  from public.race_events e
  where e.slug = p_slug and public.race_event_visible(e.id) is true
$$;
grant execute on function race_get_public_event(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Defence in depth: Supabase grants EXECUTE on new public functions to anon by
-- default. Every staff/admin race RPC already refuses non-staff in its body
-- (NULL-safe), but anonymous callers should not even reach it. The public
-- RPCs (register, get_registration, update_pushup_style, server_time,
-- event_schedule) keep their anon grant.
-- ---------------------------------------------------------------------------

revoke execute on function race_create_event(text, date, text, text, timestamptz) from public, anon;
revoke execute on function race_set_event_status(uuid, public.race_event_status, text) from public, anon;
revoke execute on function race_lock_heats(uuid) from public, anon;
revoke execute on function race_move_athlete_heat(uuid, uuid, text) from public, anon;
revoke execute on function race_staff_register_athlete(uuid, text, text, text, public.race_gender, date,
  public.race_category_code, public.race_pushup_style, boolean, jsonb) from public, anon;
revoke execute on function race_confirm_payment(uuid, public.race_payment_method, numeric, text, text) from public, anon;
revoke execute on function race_waive_payment(uuid, text) from public, anon;
revoke execute on function race_refund_payment(uuid, text) from public, anon;
revoke execute on function race_cancel_registration(uuid, text) from public, anon;
revoke execute on function race_list_registrations(uuid, text, int) from public, anon;
grant execute on function race_create_event(text, date, text, text, timestamptz) to authenticated;
grant execute on function race_set_event_status(uuid, public.race_event_status, text) to authenticated;
grant execute on function race_lock_heats(uuid) to authenticated;
grant execute on function race_move_athlete_heat(uuid, uuid, text) to authenticated;
