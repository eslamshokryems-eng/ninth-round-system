-- 9th Round Challenges — Phase 1: foundation schema only.
--
-- Purely additive: new tables/enums/indexes only, zero changes to any
-- existing table, column, function, or RLS policy. Mirrors the shape of
-- this codebase's other domains (leads, memberships): enums for closed
-- status/type sets, a partial unique index per uniqueness rule, the
-- existing set_updated_at() trigger reused rather than reinvented.
--
-- SECURITY POSTURE FOR THIS MIGRATION: every table below has RLS enabled
-- with ZERO policies defined yet. With RLS on and no policies, a table is
-- completely inaccessible to `authenticated`/`anon` — the safest possible
-- state for a table that exists but isn't fully wired up. The actual
-- read/write grants (member self-read, coach/branch_manager scoping,
-- reviewer-not-author enforcement, etc.) and every privileged RPC land in
-- Phase 2, per the approved phase plan. This migration is schema only.
--
-- NOT EXECUTED. Local file only, per Phase 1 authorization.

-- ---------------------------------------------------------------------------
-- Seasons — spec §2.4: every challenge belongs to exactly one season;
-- created manually by administration; historical seasons stay accessible
-- (status, never a delete).
-- ---------------------------------------------------------------------------

create type challenge_season_status as enum ('draft', 'active', 'completed', 'archived');

create table challenge_seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  starts_at date not null,
  ends_at date not null,
  status challenge_season_status not null default 'draft',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_challenge_season_dates check (ends_at > starts_at)
);

create trigger trg_challenge_seasons_updated_at
  before update on challenge_seasons
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Settings — spec §2.3: Super Admin controls the allowed weight range and
-- the rank-points policy. Same key/value shape as the existing
-- security_settings table (20260922000001_device_verification.sql) —
-- reusing that established convention rather than inventing a new one.
-- ---------------------------------------------------------------------------

create table challenge_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id)
);

create trigger trg_challenge_settings_updated_at
  before update on challenge_settings
  for each row execute function set_updated_at();

-- Seeded with the approved defaults (spec §2.3 confirmed values, §8
-- confirmed rank-points table) — never populated with an invented value
-- the business hasn't actually approved.
insert into challenge_settings (key, value) values
  ('min_weight', '1'),
  ('max_weight', '10'),
  ('rank_points_policy', '{"byRank":[100,90,80,75,70,65,60,55,50],"beyond":40}');

-- ---------------------------------------------------------------------------
-- Challenges — spec §2.1/§2.3/§3/§4/§8.
-- ---------------------------------------------------------------------------

create type challenge_category as enum ('strength', 'endurance', 'boxing', 'kickboxing', 'mma', 'ninth_round', 'hybrid_fitness');
create type challenge_scope as enum ('BRANCH', 'ALL_BRANCHES');
create type challenge_measurement_type as enum ('NUMERIC', 'TIME', 'COUNT');
create type challenge_scoring_direction as enum ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER');
-- Lifecycle, spec §3: Draft -> Published -> Registration Open -> Active -> Completed -> Archived.
create type challenge_status as enum ('draft', 'published', 'registration_open', 'active', 'completed', 'archived');

create table challenges (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references challenge_seasons (id) on delete restrict,
  title text not null,
  description text,
  category challenge_category not null,
  -- Reuses the EXISTING program_type enum (20260916000001_membership_program_type.sql)
  -- rather than defining a second, parallel one — same real-world concept.
  program_type program_type,
  scope challenge_scope not null,
  branch_id uuid references branches (id),
  measurement_type challenge_measurement_type not null,
  measurement_unit text not null,
  scoring_direction challenge_scoring_direction not null,
  -- Validated against challenge_settings' configured range by the Phase 2
  -- create_challenge() RPC (a CHECK constraint can't reference another
  -- table's row). This outer bound is a defense-in-depth sanity limit
  -- only, never the real 1-10 business rule.
  weight integer not null default 1 check (weight >= 1 and weight <= 100),
  registration_start_at timestamptz not null,
  registration_end_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status challenge_status not null default 'draft',
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- scope/branch_id consistency, spec §5.2 — mirrors validateChallengeScope()
  -- in packages/challenges/domain/challenge.ts exactly; both must agree.
  constraint chk_challenge_scope_branch check (
    (scope = 'ALL_BRANCHES' and branch_id is null) or (scope = 'BRANCH' and branch_id is not null)
  ),
  constraint chk_challenge_registration_window check (registration_end_at > registration_start_at),
  constraint chk_challenge_dates check (ends_at > starts_at)
);

create trigger trg_challenges_updated_at
  before update on challenges
  for each row execute function set_updated_at();

create index idx_challenges_season on challenges (season_id);
create index idx_challenges_branch on challenges (branch_id);
create index idx_challenges_status on challenges (status);

-- ---------------------------------------------------------------------------
-- Eligibility rules — spec §2.6/§5.4. A closed, structured rule type, never
-- arbitrary executable code — see validateChallengeEligibilityRule() in
-- packages/challenges/domain/challenge-eligibility-rule.ts, which this
-- enum's values must stay in lockstep with.
-- ---------------------------------------------------------------------------

create type challenge_eligibility_rule_type as enum ('active_membership', 'program_type', 'min_age', 'max_age', 'branch');

create table challenge_eligibility_rules (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  rule_type challenge_eligibility_rule_type not null,
  -- Shape validated at the application layer per rule_type (domain
  -- function above) — never a free-form expression, only fixed, known
  -- fields per type (e.g. {"programType": "boxing"}, {"age": 16}).
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_challenge_eligibility_rules_challenge on challenge_eligibility_rules (challenge_id);

-- ---------------------------------------------------------------------------
-- Participants — spec §2.7: self-requested, auto-decided server-side at
-- request time, no manual coach approval for joining. The eligibility
-- decision + reason are stored permanently for auditability, never
-- recomputed later even if the member's membership subsequently changes.
-- ---------------------------------------------------------------------------

create type challenge_participant_status as enum ('approved', 'rejected');

create table challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  status challenge_participant_status not null,
  eligibility_result boolean not null,
  eligibility_reason text,
  -- Coach-assignment ambiguity override (spec §6.6, Risk A) — set only by
  -- branch_manager/super_admin, only when the member's active memberships
  -- give no single unambiguous coach for this challenge's program_type.
  -- Null in the overwhelming common (unambiguous) case.
  designated_coach_id uuid references profiles (id),
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- One participation request per (challenge, member) — spec §2.7's
  -- "prevent duplicate participation requests".
  constraint uq_challenge_participants_once unique (challenge_id, member_id)
);

create index idx_challenge_participants_challenge on challenge_participants (challenge_id);
create index idx_challenge_participants_member on challenge_participants (member_id);

-- ---------------------------------------------------------------------------
-- Results — spec §2.2/§5.6/§7. One official (current) result per
-- (challenge, member) at any moment; corrections are new rows, never an
-- edit of an approved row — see the correction-chain design discussed and
-- approved before this migration was written.
-- ---------------------------------------------------------------------------

create type challenge_result_status as enum ('pending', 'approved', 'rejected', 'correction_pending');

create table challenge_results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references challenges (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  entered_by_profile_id uuid not null references profiles (id),
  result_value numeric not null,
  normalized_result_value numeric,
  measurement_unit text not null,
  performed_at timestamptz not null,
  status challenge_result_status not null default 'pending',
  -- Set only on a row proposing a correction; immutable after creation —
  -- no RPC ever updates this column once set.
  corrects_result_id uuid references challenge_results (id),
  -- Set only by the correction-approval RPC (Phase 2), the moment a
  -- correction targeting this row is approved. Null = this row is still
  -- (or was always) the current one for its moment in the chain.
  superseded_by_result_id uuid references challenge_results (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_challenge_results_no_self_correction check (corrects_result_id is distinct from id)
);

create trigger trg_challenge_results_updated_at
  before update on challenge_results
  for each row execute function set_updated_at();

create index idx_challenge_results_challenge on challenge_results (challenge_id);
create index idx_challenge_results_member on challenge_results (member_id);

-- A. At most one CURRENT official result per (challenge, member). Only
-- APPROVED rows compete for this — a CORRECTION_PENDING proposal never
-- does, so it can coexist with the original it's proposing to replace.
create unique index uq_challenge_results_current
  on challenge_results (challenge_id, member_id)
  where status = 'approved' and superseded_by_result_id is null;

-- B. At most one PENDING correction against any given original result —
-- a second correction request against the same target cannot be inserted
-- while one is still undecided.
create unique index uq_challenge_results_one_pending_correction
  on challenge_results (corrects_result_id)
  where status = 'correction_pending';

-- C. At most one PENDING first-time (non-correction) submission per
-- (challenge, member) — prevents two independent "first" results racing
-- for the same athlete.
create unique index uq_challenge_results_one_pending_original
  on challenge_results (challenge_id, member_id)
  where status = 'pending' and corrects_result_id is null;

-- ---------------------------------------------------------------------------
-- Result reviews — spec §2.2/§7. Append-only; a result's approve/reject/
-- correction-approve/correction-reject decision, one row per decision.
-- ---------------------------------------------------------------------------

create type challenge_result_review_decision as enum ('approved', 'rejected');

create table challenge_result_reviews (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references challenge_results (id) on delete cascade,
  reviewer_profile_id uuid not null references profiles (id),
  decision challenge_result_review_decision not null,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_challenge_result_reviews_result on challenge_result_reviews (result_id);

-- No update/delete grant — reviews are a permanent record, same posture as
-- membership_payments/admin_audit_log elsewhere in this schema. Enforced
-- below via RLS (select-only policies land in Phase 2); revoking the
-- privilege outright here too, as defense in depth.
revoke update, delete on challenge_result_reviews from authenticated;

-- ---------------------------------------------------------------------------
-- Points ledger — spec §6/§8. Append-only; a member's total points for a
-- season is always sum(points_delta) over their rows here, never a
-- separately-stored mutable total.
-- ---------------------------------------------------------------------------

create table challenge_points_ledger (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references challenge_seasons (id) on delete restrict,
  challenge_id uuid not null references challenges (id) on delete restrict,
  member_id uuid not null references members (id) on delete restrict,
  result_id uuid not null references challenge_results (id) on delete restrict,
  points_delta numeric not null,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references profiles (id)
);

create index idx_challenge_points_ledger_season_member on challenge_points_ledger (season_id, member_id);
create index idx_challenge_points_ledger_challenge on challenge_points_ledger (challenge_id);
create index idx_challenge_points_ledger_result on challenge_points_ledger (result_id);

-- Append-only — no row is ever updated or deleted by anything, including
-- this table's own owner role via ordinary client access. Every write
-- (the original award, a reversal, a corrected re-award) happens only via
-- the Phase 2 approval/correction RPCs.
revoke update, delete on challenge_points_ledger from authenticated;

-- ---------------------------------------------------------------------------
-- RLS — enabled now, with ZERO policies, on every table above. This is a
-- deliberate, safe default-deny state: `authenticated`/`anon` have no
-- access to any of these tables until Phase 2 adds the real policies
-- (member self-read via linked_profile_id once that prerequisite linking
-- flow exists, coach/branch_manager scoping, reviewer-not-author
-- enforcement, etc.). No table here is reachable by anyone except a
-- service-role/superuser context in the meantime.
-- ---------------------------------------------------------------------------

alter table challenge_seasons enable row level security;
alter table challenge_settings enable row level security;
alter table challenges enable row level security;
alter table challenge_eligibility_rules enable row level security;
alter table challenge_participants enable row level security;
alter table challenge_results enable row level security;
alter table challenge_result_reviews enable row level security;
alter table challenge_points_ledger enable row level security;
