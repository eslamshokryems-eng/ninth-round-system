-- THE NINTH race system — 2/5: athletes, heats, registrations, payments,
-- race staff, judge applications, devices.
--
-- Same isolation rules as 20260928000001_race_config.sql: race_* only, RLS
-- on at creation, API grants revoked until 20260928000004_race_access.sql.
--
-- Cross-event integrity is enforced with composite foreign keys
-- (child.x_id, child.event_id) -> parent(id, event_id): a registration can
-- never point at another event's category or heat, a judge can never be
-- assigned to another event's station, etc. — by the database, not by app code.

-- ---------------------------------------------------------------------------
-- Athletes (a person; one row reused across events)
-- ---------------------------------------------------------------------------

create table race_athletes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,  -- optional app account (athlete portal)
  member_id uuid references members (id) on delete set null,    -- optional link to a gym member
  full_name text not null check (length(trim(full_name)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  email text,
  gender gender,
  date_of_birth date,
  emergency_contact jsonb check (emergency_contact is null or jsonb_typeof(emergency_contact) = 'object'),
  created_at timestamptz not null default now()
);

create index idx_race_athletes_phone on race_athletes (phone);
create index idx_race_athletes_profile on race_athletes (profile_id) where profile_id is not null;
create index idx_race_athletes_name_trgm on race_athletes using gin (full_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Heats
-- ---------------------------------------------------------------------------

create table race_heats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  number smallint not null check (number >= 1),
  status race_heat_status not null default 'DRAFT',
  start_mode race_heat_start_mode,                     -- null = inherit race_events.heat_start_mode
  planned_slot_count smallint check (planned_slot_count is null or planned_slot_count between 1 and 9), -- frozen at START EVENT
  anchor_race_ms bigint check (anchor_race_ms is null or anchor_race_ms >= 0),                        -- frozen (AUTO at START EVENT, MANUAL at START NEXT HEAT)
  anchored_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  unique (event_id, number),
  unique (id, event_id)
);

-- ---------------------------------------------------------------------------
-- Registrations (athlete × event)
-- ---------------------------------------------------------------------------

create table race_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id),
  athlete_id uuid not null references race_athletes (id),
  category_id uuid not null,
  heat_id uuid,
  race_number text not null check (race_number ~ '^N[0-9]{3,4}$'),
  status race_reg_status not null default 'PENDING_PAYMENT',
  race_status race_status not null default 'REGISTERED',
  pushup_style race_pushup_style not null,
  pushup_style_locked_at timestamptz,
  waiver_accepted_at timestamptz,
  payment_waived_by uuid references profiles (id),
  payment_waiver_reason text,
  created_at timestamptz not null default now(),
  unique (event_id, race_number),
  unique (event_id, athlete_id),
  unique (id, event_id),
  foreign key (category_id, event_id) references race_categories (id, event_id),
  foreign key (heat_id, event_id) references race_heats (id, event_id),
  check (payment_waived_by is null or length(trim(coalesce(payment_waiver_reason, ''))) > 0)
);

create index idx_race_registrations_heat on race_registrations (heat_id);
create index idx_race_registrations_athlete on race_registrations (athlete_id);
create index idx_race_registrations_event_status on race_registrations (event_id, race_status);

-- ---------------------------------------------------------------------------
-- Payments — manual confirmation for the pilot (D-11); Paymob-ready fields.
-- ---------------------------------------------------------------------------

create table race_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  registration_id uuid not null,
  amount numeric(10, 2) not null check (amount >= 0),
  currency char(3) not null default 'EGP',
  status race_payment_status not null default 'PENDING',
  provider race_payment_provider not null default 'MANUAL',
  method race_payment_method,
  provider_order_id text,
  provider_txn_id text,
  idempotency_key text unique,
  recorded_by uuid references profiles (id),
  paid_at timestamptz,
  refunded_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (registration_id, event_id) references race_registrations (id, event_id),
  check (status <> 'PAID' or paid_at is not null),
  check (status <> 'REFUNDED' or refunded_at is not null),
  check (status <> 'CANCELLED' or cancelled_at is not null),
  check (provider <> 'MANUAL' or provider_txn_id is null)
);

create index idx_race_payments_registration on race_payments (registration_id);

-- Append-only provider/webhook ledger (Paymob later). Immutability trigger in 20260928000003.
create table race_payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references race_payments (id),
  provider race_payment_provider not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------
-- Race staff: event-scoped race roles (§17). Existing gym roles are untouched;
-- a person's race authority comes only from these rows (plus super_admin).
-- ---------------------------------------------------------------------------

create table race_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  profile_id uuid not null references profiles (id),
  role race_role not null,
  station_id uuid,
  active boolean not null default true,
  assigned_by uuid references profiles (id),
  assigned_at timestamptz not null default clock_timestamp(),
  foreign key (station_id, event_id) references race_stations (id, event_id),
  -- JUDGE and STATION_SCREEN are always bound to exactly one station; other roles never are.
  check ((role in ('JUDGE', 'STATION_SCREEN')) = (station_id is not null))
);

create unique index uq_race_staff_assignment on race_staff (
  event_id, profile_id, role, coalesce(station_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index idx_race_staff_profile on race_staff (profile_id) where active;

-- ---------------------------------------------------------------------------
-- Judge applications (public form)
-- ---------------------------------------------------------------------------

create table race_judge_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  phone text not null check (length(trim(phone)) > 0),
  email text,
  experience text,
  preferred_stations smallint[] not null default '{}'
    check (preferred_stations <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9]::smallint[]),
  status race_judge_app_status not null default 'SUBMITTED',
  reviewed_by uuid references profiles (id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index idx_race_judge_applications_event on race_judge_applications (event_id, status);

-- ---------------------------------------------------------------------------
-- Devices (judge phones, station screens, venue screen, master console)
-- ---------------------------------------------------------------------------

create table race_devices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  profile_id uuid references profiles (id),
  kind race_device_kind not null,
  station_id uuid,
  label text not null,
  pairing_code_hash text,
  last_seen_at timestamptz,
  last_seq bigint not null default 0 check (last_seq >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (station_id, event_id) references race_stations (id, event_id),
  check (kind not in ('JUDGE', 'STATION_SCREEN') or station_id is not null)
);

-- ---------------------------------------------------------------------------
-- Lock down.
-- ---------------------------------------------------------------------------

alter table race_athletes enable row level security;
alter table race_heats enable row level security;
alter table race_registrations enable row level security;
alter table race_payments enable row level security;
alter table race_payment_events enable row level security;
alter table race_staff enable row level security;
alter table race_judge_applications enable row level security;
alter table race_devices enable row level security;

revoke all on race_athletes, race_heats, race_registrations, race_payments, race_payment_events,
  race_staff, race_judge_applications, race_devices
  from anon, authenticated;
