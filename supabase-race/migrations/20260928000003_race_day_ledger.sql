-- THE NINTH race system — 3/5: race-day records + append-only protection.
--
-- Three kinds of table here:
--   LEDGER (append-only, never updated or deleted, by anyone — including the
--   table owner and service_role; triggers fire for every role):
--     race_performance_events, race_action_reviews, race_result_corrections,
--     race_tie_draws, race_check_ins, race_rankings (+ race_payment_events
--     from 20260928000002).
--   CONSTRAINED STATE (one legal mutation each, enforced by trigger):
--     race_pauses (resume once), race_ocr_records (CAPTURED -> final once).
--   STATE CACHE (updated by the engine's SECURITY DEFINER RPCs, never deleted):
--     race_clock, race_start_slots, race_station_results.
--
-- Server timestamps are authoritative: every "when did the server see this"
-- column is overwritten with clock_timestamp() by a BEFORE INSERT trigger,
-- so even a privileged caller cannot back-date or forward-date a row.

-- ---------------------------------------------------------------------------
-- Generic guards
-- ---------------------------------------------------------------------------

create or replace function race_forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'RACE_APPEND_ONLY: % is append-only (% refused)', TG_TABLE_NAME, TG_OP
    using errcode = 'insufficient_privilege';
end;
$$;

create or replace function race_forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'RACE_NO_DELETE: rows in % are never deleted (% refused)', TG_TABLE_NAME, TG_OP
    using errcode = 'insufficient_privilege';
end;
$$;

-- BEFORE INSERT: NEW.<TG_ARGV[0]> := clock_timestamp(), whatever the caller sent.
create or replace function race_stamp_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  NEW := jsonb_populate_record(NEW, jsonb_build_object(TG_ARGV[0], clock_timestamp()));
  return NEW;
end;
$$;

-- Attach append-only protection (row UPDATE/DELETE + statement TRUNCATE).
create or replace function race_make_append_only(p_table regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_name text := (select relname from pg_class where oid = p_table);
begin
  execute format(
    'create trigger trg_%s_append_only before update or delete on %s for each row execute function public.race_forbid_mutation()',
    v_name, p_table);
  execute format(
    'create trigger trg_%s_no_truncate before truncate on %s for each statement execute function public.race_forbid_mutation()',
    v_name, p_table);
end;
$$;

-- ---------------------------------------------------------------------------
-- Race clock — one row per event. race time (§2.2):
--   race_ms(t) = (t − started_at) − paused_total_ms − (paused ? t − paused_at : 0)
-- ---------------------------------------------------------------------------

create table race_clock (
  event_id uuid primary key references race_events (id) on delete cascade,
  started_at timestamptz,
  started_by uuid references race_profiles (id),
  paused_at timestamptz,
  paused_total_ms bigint not null default 0 check (paused_total_ms >= 0),
  finished_at timestamptz,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default clock_timestamp(),
  check (paused_at is null or (started_at is not null and paused_at >= started_at)),
  check (finished_at is null or (started_at is not null and finished_at >= started_at)),
  check (started_at is not null or (paused_total_ms = 0 and paused_at is null))
);

create table race_pauses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id),
  paused_at timestamptz not null default clock_timestamp(),
  paused_race_ms bigint not null check (paused_race_ms >= 0),
  paused_by uuid not null references race_profiles (id),
  reason text,
  resumed_at timestamptz,
  resumed_by uuid references race_profiles (id),
  check ((resumed_at is null) = (resumed_by is null)),
  check (resumed_at is null or resumed_at >= paused_at)
);
-- At most one open pause per event.
create unique index uq_race_pauses_open on race_pauses (event_id) where resumed_at is null;

-- ---------------------------------------------------------------------------
-- Check-in, tie draws, start slots
-- ---------------------------------------------------------------------------

create table race_tie_draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  heat_id uuid not null,
  tied_at timestamptz not null,
  seed bytea not null check (length(seed) >= 16),
  participants uuid[] not null check (cardinality(participants) >= 2),  -- registration ids, in draw order
  created_at timestamptz not null default clock_timestamp(),
  unique (id, heat_id),
  foreign key (heat_id, event_id) references race_heats (id, event_id)
);

create table race_check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  registration_id uuid not null unique,
  heat_id uuid not null,
  checked_in_at timestamptz not null default clock_timestamp(),  -- forced to clock_timestamp()
  checked_in_by uuid not null references race_profiles (id),
  kind race_checkin_kind not null,
  tie_draw_id uuid,
  tie_draw_position smallint check (tie_draw_position is null or tie_draw_position >= 1),
  foreign key (registration_id, event_id) references race_registrations (id, event_id),
  foreign key (heat_id, event_id) references race_heats (id, event_id),
  foreign key (tie_draw_id, heat_id) references race_tie_draws (id, heat_id),
  check ((tie_draw_id is null) = (tie_draw_position is null))
);
create index idx_race_check_ins_order on race_check_ins (heat_id, checked_in_at, tie_draw_position);

create table race_start_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  heat_id uuid not null,
  slot_index smallint not null check (slot_index >= 0),       -- k within heat (≥ planned count = overflow)
  is_overflow boolean not null default false,
  registration_id uuid unique,
  status race_slot_status not null default 'OPEN',
  bound_at timestamptz,
  skipped_at timestamptz,
  skipped_by uuid references race_profiles (id),
  skip_reason text,
  unique (heat_id, slot_index),
  unique (id, event_id),
  foreign key (heat_id, event_id) references race_heats (id, event_id),
  foreign key (registration_id, event_id) references race_registrations (id, event_id),
  -- Slot start/end times are NOT stored: always derived from
  -- race_heats.anchor_race_ms + slot_index × start_interval_ms.
  check (
    case status
      when 'OPEN' then registration_id is null
      when 'EMPTY' then registration_id is null
      when 'BOUND' then registration_id is not null and bound_at is not null
      when 'STARTED' then registration_id is not null and bound_at is not null
      when 'SKIPPED' then registration_id is not null and skipped_at is not null
        and length(trim(coalesce(skip_reason, ''))) > 0
    end
  )
);

-- ---------------------------------------------------------------------------
-- Station results (derived cache) and the judge action ledger
-- ---------------------------------------------------------------------------

create table race_station_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  registration_id uuid not null,
  station_id uuid not null,
  slot_id uuid not null,
  window_start_race_ms bigint not null check (window_start_race_ms >= 0),
  window_end_race_ms bigint not null,                  -- performance lock, no grace
  judge_profile_id uuid references race_profiles (id),
  status race_result_status not null default 'SCHEDULED',
  official_score numeric check (official_score is null or official_score >= 0),
  derived jsonb not null default '{}'::jsonb check (jsonb_typeof(derived) = 'object'),
  technique_score numeric(3, 1) check (technique_score is null or technique_score between 0 and 10),
  derived_version bigint not null default 0,
  locked_at timestamptz,
  unique (registration_id, station_id),
  unique (id, event_id, station_id),
  foreign key (registration_id, event_id) references race_registrations (id, event_id),
  foreign key (station_id, event_id) references race_stations (id, event_id),
  foreign key (slot_id, event_id) references race_start_slots (id, event_id),
  check (window_end_race_ms > window_start_race_ms)
);
create index idx_race_station_results_station on race_station_results (station_id, window_start_race_ms);

create table race_performance_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  station_id uuid not null,
  station_result_id uuid not null,
  type race_action_type not null,
  value numeric,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  voids_event_id uuid references race_performance_events (id),
  client_event_id uuid not null unique,                -- idempotency key: a retry can never duplicate
  device_id uuid references race_devices (id),
  device_seq bigint check (device_seq is null or device_seq >= 1),
  origin race_action_origin not null,
  device_recorded_at timestamptz,
  device_clock_offset_ms int,
  device_race_ms bigint,
  server_received_at timestamptz not null default clock_timestamp(),  -- forced to clock_timestamp()
  server_race_ms bigint not null,
  judge_profile_id uuid not null references race_profiles (id),
  status race_action_status not null,
  rejection_code text,
  unique (device_id, device_seq),
  foreign key (station_result_id, event_id, station_id)
    references race_station_results (id, event_id, station_id),
  check ((type = 'VOID') = (voids_event_id is not null)),
  check (type <> 'TECHNIQUE_SCORE' or (value is not null and value between 0 and 10)),
  check (status <> 'REJECTED' or rejection_code is not null),
  check (origin <> 'OFFLINE_QUEUE' or (device_recorded_at is not null and device_seq is not null))
);
create index idx_race_perf_events_result on race_performance_events (station_result_id, server_race_ms);
create index idx_race_perf_events_pending on race_performance_events (event_id) where status = 'PENDING_MASTER_REVIEW';

create table race_action_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id),
  performance_event_id uuid not null unique references race_performance_events (id),
  decision text not null check (decision in ('APPROVED', 'REJECTED')),
  reason text not null check (length(trim(reason)) > 0),
  reviewed_by uuid not null references race_profiles (id),
  reviewed_at timestamptz not null default clock_timestamp()
);

create table race_ocr_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  station_id uuid not null,
  station_result_id uuid not null,
  storage_path text not null check (length(trim(storage_path)) > 0),  -- original image, never overwritten
  provider text,
  raw_response jsonb,
  proposed_distance_m int check (proposed_distance_m is null or proposed_distance_m >= 0),
  confidence numeric check (confidence is null or confidence between 0 and 1),
  confirmed_distance_m int check (confirmed_distance_m is null or confirmed_distance_m >= 0),
  status race_ocr_status not null default 'CAPTURED',
  retake_of uuid references race_ocr_records (id),
  captured_by uuid not null references race_profiles (id),
  captured_at timestamptz not null default clock_timestamp(),
  confirmed_by uuid references race_profiles (id),
  confirmed_at timestamptz,
  foreign key (station_result_id, event_id, station_id)
    references race_station_results (id, event_id, station_id),
  check (status not in ('CONFIRMED', 'MANUAL') or (confirmed_distance_m is not null and confirmed_by is not null))
);

create table race_result_corrections (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  station_id uuid not null,
  station_result_id uuid not null,
  field text not null check (length(trim(field)) > 0),
  old_value jsonb,
  new_value jsonb not null,
  reason text not null check (length(trim(reason)) > 0),
  corrected_by uuid not null references race_profiles (id),
  corrected_at timestamptz not null default clock_timestamp(),
  foreign key (station_result_id, event_id, station_id)
    references race_station_results (id, event_id, station_id)
);
create index idx_race_corrections_result on race_result_corrections (station_result_id, corrected_at);

-- Versioned, append-only ranking snapshots. Marking results official means
-- writing a new version with is_official = true, never flipping an old row.
create table race_rankings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  category_id uuid not null,
  registration_id uuid not null,
  version int not null check (version >= 1),
  station_placements jsonb not null check (jsonb_typeof(station_placements) = 'object'),
  total_points int not null check (total_points >= 9),
  tb_s04_technique numeric(3, 1),
  tb_s07_technique numeric(3, 1),
  tb_sum numeric(4, 1),
  overall_rank int not null check (overall_rank >= 1),
  is_official boolean not null default false,
  computed_at timestamptz not null default clock_timestamp(),
  computed_by uuid references race_profiles (id),
  unique (category_id, registration_id, version),
  foreign key (category_id, event_id) references race_categories (id, event_id),
  foreign key (registration_id, event_id) references race_registrations (id, event_id)
);

-- ---------------------------------------------------------------------------
-- Protection
-- ---------------------------------------------------------------------------

-- Server-authoritative timestamps.
create trigger trg_race_check_ins_server_time before insert on race_check_ins
  for each row execute function race_stamp_server_time('checked_in_at');
create trigger trg_race_perf_events_server_time before insert on race_performance_events
  for each row execute function race_stamp_server_time('server_received_at');
create trigger trg_race_reviews_server_time before insert on race_action_reviews
  for each row execute function race_stamp_server_time('reviewed_at');
create trigger trg_race_corrections_server_time before insert on race_result_corrections
  for each row execute function race_stamp_server_time('corrected_at');
create trigger trg_race_tie_draws_server_time before insert on race_tie_draws
  for each row execute function race_stamp_server_time('created_at');
create trigger trg_race_ocr_server_time before insert on race_ocr_records
  for each row execute function race_stamp_server_time('captured_at');
create trigger trg_race_pauses_server_time before insert on race_pauses
  for each row execute function race_stamp_server_time('paused_at');
create trigger trg_race_payment_events_server_time before insert on race_payment_events
  for each row execute function race_stamp_server_time('received_at');
create trigger trg_race_rankings_server_time before insert on race_rankings
  for each row execute function race_stamp_server_time('computed_at');

-- Append-only ledgers.
select race_make_append_only('race_performance_events');
select race_make_append_only('race_action_reviews');
select race_make_append_only('race_result_corrections');
select race_make_append_only('race_tie_draws');
select race_make_append_only('race_check_ins');
select race_make_append_only('race_rankings');
select race_make_append_only('race_payment_events');

-- race_pauses: the only legal change is closing an open pause, once.
create or replace function race_guard_pause_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'RACE_NO_DELETE: race_pauses rows are never deleted' using errcode = 'insufficient_privilege';
  end if;
  if OLD.resumed_at is not null then
    raise exception 'RACE_APPEND_ONLY: pause % is already closed', OLD.id using errcode = 'insufficient_privilege';
  end if;
  if NEW.resumed_by is null
     or (NEW.id, NEW.event_id, NEW.paused_at, NEW.paused_race_ms, NEW.paused_by, NEW.reason)
        is distinct from (OLD.id, OLD.event_id, OLD.paused_at, OLD.paused_race_ms, OLD.paused_by, OLD.reason) then
    raise exception 'RACE_APPEND_ONLY: a pause can only be closed (resumed_at/resumed_by), nothing else changes'
      using errcode = 'insufficient_privilege';
  end if;
  NEW.resumed_at := clock_timestamp();
  return NEW;
end;
$$;
create trigger trg_race_pauses_guard before update or delete on race_pauses
  for each row execute function race_guard_pause_update();
create trigger trg_race_pauses_no_truncate before truncate on race_pauses
  for each statement execute function race_forbid_mutation();

-- race_ocr_records: evidence is immutable; only the CAPTURED -> final
-- decision (status/confirmed_*) may be written, once.
create or replace function race_guard_ocr_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'RACE_NO_DELETE: OCR evidence is never deleted' using errcode = 'insufficient_privilege';
  end if;
  if OLD.status <> 'CAPTURED' then
    raise exception 'RACE_APPEND_ONLY: OCR record % is already %', OLD.id, OLD.status using errcode = 'insufficient_privilege';
  end if;
  if (NEW.id, NEW.event_id, NEW.station_id, NEW.station_result_id, NEW.storage_path, NEW.provider,
      NEW.raw_response, NEW.proposed_distance_m, NEW.confidence, NEW.retake_of, NEW.captured_by, NEW.captured_at)
     is distinct from
     (OLD.id, OLD.event_id, OLD.station_id, OLD.station_result_id, OLD.storage_path, OLD.provider,
      OLD.raw_response, OLD.proposed_distance_m, OLD.confidence, OLD.retake_of, OLD.captured_by, OLD.captured_at) then
    raise exception 'RACE_APPEND_ONLY: OCR evidence fields are immutable' using errcode = 'insufficient_privilege';
  end if;
  if NEW.status in ('CONFIRMED', 'MANUAL') then
    NEW.confirmed_at := clock_timestamp();
  end if;
  return NEW;
end;
$$;
create trigger trg_race_ocr_guard before update or delete on race_ocr_records
  for each row execute function race_guard_ocr_update();
create trigger trg_race_ocr_no_truncate before truncate on race_ocr_records
  for each statement execute function race_forbid_mutation();

-- State caches: updatable by the engine, never deleted.
create trigger trg_race_start_slots_no_delete before delete on race_start_slots
  for each row execute function race_forbid_delete();
create trigger trg_race_station_results_no_delete before delete on race_station_results
  for each row execute function race_forbid_delete();
create trigger trg_race_registrations_no_delete before delete on race_registrations
  for each row execute function race_forbid_delete();
create trigger trg_race_payments_no_delete before delete on race_payments
  for each row execute function race_forbid_delete();

-- ---------------------------------------------------------------------------
-- Lock down.
-- ---------------------------------------------------------------------------

alter table race_clock enable row level security;
alter table race_pauses enable row level security;
alter table race_tie_draws enable row level security;
alter table race_check_ins enable row level security;
alter table race_start_slots enable row level security;
alter table race_station_results enable row level security;
alter table race_performance_events enable row level security;
alter table race_action_reviews enable row level security;
alter table race_ocr_records enable row level security;
alter table race_result_corrections enable row level security;
alter table race_rankings enable row level security;

revoke all on race_clock, race_pauses, race_tie_draws, race_check_ins, race_start_slots,
  race_station_results, race_performance_events, race_action_reviews, race_ocr_records,
  race_result_corrections, race_rankings
  from anon, authenticated;

revoke execute on function race_make_append_only(regclass) from public, anon, authenticated;
