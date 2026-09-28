-- THE NINTH race system — 1/5: enums + configuration tables.
--
-- Design: docs/race/01-schema-and-timing-model.md (approved, rev 2).
-- Timing validation: docs/race/02-timing-validation-50-athletes.md.
--
-- Isolation rules for every race migration (Phase 3 sign-off):
--   - every object is named race_* and lives in `public` next to — never
--     inside — the gym-management schema; no existing table, type, function
--     or policy is altered by this file;
--   - RLS is enabled on every table the moment it is created, and all
--     default API grants (Supabase grants anon/authenticated ALL on new
--     public tables) are revoked immediately, so each table is deny-all
--     until 20260928000004_race_access.sql adds explicit policies/grants.
--     There is never a window where a race table is reachable unguarded.
--   - Official time is server time: the race clock is derived from
--     race_clock (20260928000003) using clock_timestamp(), never from a
--     client-supplied value.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type race_event_status as enum (
  'DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'HEATS_LOCKED',
  'LIVE', 'FINISHED', 'RESULTS_OFFICIAL', 'ARCHIVED'
);
create type race_heat_start_mode as enum ('AUTO', 'MANUAL');
create type race_heat_status as enum ('DRAFT', 'LOCKED', 'AWAITING_START', 'RUNNING', 'FINISHED');
create type race_category_code as enum ('MEN', 'WOMEN', 'MASTERS');
create type race_scoring_type as enum ('REPS', 'HOLD_MS', 'LAPS', 'CONVERTED_REPS', 'DISTANCE_M');
create type race_reg_status as enum ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED');
create type race_status as enum (
  'REGISTERED', 'CHECKED_IN', 'LATE_CHECK_IN', 'STARTED', 'FINISHED',
  'MISSED_START', 'DNF', 'WITHDRAWN'
);
create type race_payment_status as enum ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');
create type race_payment_provider as enum ('MANUAL', 'PAYMOB');
create type race_payment_method as enum ('CASH', 'INSTAPAY', 'VODAFONE_CASH', 'CARD_POS', 'BANK_TRANSFER', 'ONLINE');
create type race_pushup_style as enum ('STANDARD', 'KNEE');
create type race_checkin_kind as enum ('ON_TIME', 'LATE');
create type race_slot_status as enum ('OPEN', 'BOUND', 'STARTED', 'SKIPPED', 'EMPTY');
create type race_result_status as enum (
  'SCHEDULED', 'ACTIVE', 'SCORING', 'REVIEW_PENDING', 'LOCKED', 'CORRECTED', 'VOID_DNS'
);
create type race_action_type as enum (
  'REP', 'NO_REP', 'LAP', 'PENALTY', 'HOLD_START', 'HOLD_BREAK', 'HOLD_RESUME',
  'TECHNIQUE_SCORE', 'OCR_CAPTURE', 'OCR_CONFIRM', 'OCR_RETAKE', 'VOID'
);
create type race_action_origin as enum ('ONLINE', 'OFFLINE_QUEUE');
-- The ledger row's status never changes (append-only). A Master decision on a
-- PENDING_MASTER_REVIEW action lives in race_action_reviews; the *effective*
-- status is the review decision if one exists, else this value.
create type race_action_status as enum ('ACCEPTED', 'REJECTED', 'PENDING_MASTER_REVIEW');
create type race_role as enum ('RECEPTION', 'JUDGE', 'MASTER_CONTROL', 'EVENT_MANAGER', 'STATION_SCREEN');
create type race_device_kind as enum ('JUDGE', 'STATION_SCREEN', 'VENUE_SCREEN', 'MASTER', 'RECEPTION');
create type race_judge_app_status as enum ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');
create type race_ocr_status as enum ('CAPTURED', 'CONFIRMED', 'RETAKEN', 'MANUAL');

-- ---------------------------------------------------------------------------
-- Rulebook templates. Seeded in 20260928000005_race_seed.sql; copied into
-- each new event by race_create_event() so an event's rules can be tuned
-- (before it goes LIVE) without touching the rulebook defaults.
-- ---------------------------------------------------------------------------

create table race_category_templates (
  code race_category_code primary key,
  name text not null,
  min_age smallint check (min_age is null or min_age > 0),
  default_pushup_style race_pushup_style not null,
  sort_order smallint not null unique
);

create table race_station_templates (
  number smallint primary key check (number between 1 and 9),
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  has_technique boolean not null default false,
  requires_ocr boolean not null default false
);

create table race_station_rule_templates (
  station_number smallint not null references race_station_templates (number),
  category_code race_category_code not null references race_category_templates (code),
  scoring_type race_scoring_type not null,
  higher_is_better boolean not null default true,
  movement text not null,
  equipment jsonb not null default '{}'::jsonb check (jsonb_typeof(equipment) = 'object'),
  rule jsonb not null default '{}'::jsonb check (jsonb_typeof(rule) = 'object'),
  primary key (station_number, category_code)
);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table race_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches (id),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null default 'THE NINTH' check (length(trim(name)) > 0),
  event_date date not null,
  venue text,
  timezone text not null default 'Africa/Cairo',
  status race_event_status not null default 'DRAFT',

  -- Timing model §2.1. Frozen once the race clock starts (guard trigger in
  -- 20260928000004). All values are milliseconds.
  work_ms int not null default 180000,
  transition_ms int not null default 30000,
  start_interval_ms int not null default 210000,
  station_count smallint not null default 9,
  heat_size smallint not null default 9,
  heat_gap_ms int not null default 600000,           -- measured from the LAST athlete's START (F-1)
  heat_start_mode race_heat_start_mode not null default 'AUTO',
  first_start_offset_ms int not null default 60000,  -- START EVENT -> first athlete (60 s pre-race countdown)
  bind_lead_ms int not null default 60000,           -- athlete fixed to slot this long before start
  announce_lead_ms int not null default 10000,       -- voice + GET READY countdown
  checkin_deadline_before_heat_ms int not null default 900000,
  planned_start_at timestamptz,                      -- planned START EVENT wall time (deadlines before start)

  heats_lock_at timestamptz,                         -- planned lock (48–72 h before)
  heats_locked_at timestamptz,
  heats_locked_by uuid references profiles (id),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),

  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- D-1: 3:00 work + 0:30 transition, 3:30 start interval — LOCKED by the rulebook.
  constraint race_events_work_locked check (work_ms = 180000 and transition_ms = 30000),
  constraint race_events_interval_is_work_plus_transition check (start_interval_ms = work_ms + transition_ms),
  constraint race_events_nine_stations check (station_count = 9),
  constraint race_events_heat_size check (heat_size between 1 and 9),
  -- F-1: a heat gap shorter than one interval would put two athletes on one
  -- station (min changeover at a heat boundary = gap − work ≥ transition).
  constraint race_events_heat_gap_min check (heat_gap_ms >= start_interval_ms),
  -- F-7: voice ≤ binding ≤ first-start offset, so an athlete is always named
  -- before the announcement and heat 1 slot 1 binds no earlier than START EVENT.
  constraint race_events_lead_order check (
    announce_lead_ms > 0 and announce_lead_ms <= bind_lead_ms and bind_lead_ms <= first_start_offset_ms
  ),
  constraint race_events_checkin_deadline check (checkin_deadline_before_heat_ms >= 0),
  constraint race_events_heats_locked_by_requires_at check (heats_locked_by is null or heats_locked_at is not null)
);

create index idx_race_events_branch on race_events (branch_id);
create index idx_race_events_status on race_events (status);

create trigger trg_race_events_updated_at
  before update on race_events
  for each row execute function set_updated_at();

create table race_categories (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  code race_category_code not null,
  name text not null,
  min_age smallint check (min_age is null or min_age > 0),
  default_pushup_style race_pushup_style not null,
  sort_order smallint not null,
  unique (event_id, code),
  unique (id, event_id)
);

create table race_stations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  number smallint not null check (number between 1 and 9),
  code text not null,
  name text not null,
  has_technique boolean not null default false,
  requires_ocr boolean not null default false,
  unique (event_id, number),
  unique (event_id, code),
  unique (id, event_id)
);

create table race_station_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  station_id uuid not null,
  category_id uuid not null,
  scoring_type race_scoring_type not null,
  higher_is_better boolean not null default true,
  movement text not null,
  equipment jsonb not null default '{}'::jsonb check (jsonb_typeof(equipment) = 'object'),
  rule jsonb not null default '{}'::jsonb check (jsonb_typeof(rule) = 'object'),
  version int not null default 1 check (version >= 1),
  unique (station_id, category_id),
  foreign key (station_id, event_id) references race_stations (id, event_id) on delete cascade,
  foreign key (category_id, event_id) references race_categories (id, event_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Lock down: RLS on, no API grants until 20260928000004.
-- ---------------------------------------------------------------------------

alter table race_category_templates enable row level security;
alter table race_station_templates enable row level security;
alter table race_station_rule_templates enable row level security;
alter table race_events enable row level security;
alter table race_categories enable row level security;
alter table race_stations enable row level security;
alter table race_station_rules enable row level security;

revoke all on race_category_templates, race_station_templates, race_station_rule_templates,
  race_events, race_categories, race_stations, race_station_rules
  from anon, authenticated;
