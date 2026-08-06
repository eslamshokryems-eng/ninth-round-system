# 14. Reception & Membership System

As of this slice, 9th Round is repositioned from a public consumer fitness app to a **private club management platform** — used only by 9th Round staff and members. This document covers the Reception & Membership module: its role model, schema, and what's built vs. pending.

## 14.1 Role Model v2

The original 6-role model is replaced with 5 roles:

| Old | New | Notes |
|---|---|---|
| `client` | `member` | A club member. |
| `trainer` + `nutritionist` | `coach` | Merged — a coach's specialisation (strength, nutrition, etc.) is now a value in `staff_profiles.specialties`, not a separate role. |
| `reception` | `reception` | Unchanged. |
| `admin` | `branch_manager` | Unchanged in meaning (day-to-day ops for a branch), renamed to match the club-management framing. |
| `super_admin` | `super_admin` | Unchanged — can manage other branch_managers, cross-branch settings. Mirrors the old admin/super_admin split (docs/12-roles-and-permissions.md §12.3): a branch_manager can assign coach/reception/member but never branch_manager/super_admin; only super_admin can do that. |

Migration: `supabase/migrations/20260806000001_role_model_v2.sql`. Existing rows are migrated, then enum labels are renamed in place (`alter type ... rename value`) so every already-applied foreign key, index, and policy elsewhere in the schema keeps working without a full type rebuild. Every RLS policy across migrations 3/4/6 that hardcoded the old labels (`trainer`, `nutritionist`, `admin`) is redefined in the same migration to match.

`packages/identity`'s `Role` value object (`domain/role.ts`) and `packages/database-types`'s `UserRole`/`StaffRole` types are updated to match — see git history for the exact diff. `is_admin()` (the RLS helper — kept under its original name so no other migration's policies need touching) now checks `branch_manager`/`super_admin` instead of `admin`/`super_admin`.

## 14.2 Members vs. Profiles — a deliberate split

A **member** (the new `members` table) is a business record Reception creates directly at the front desk — full name, phone, DOB, emergency contact, etc. It does **not** require a Supabase Auth account. A **profile** (`profiles`, extending `auth.users`) is the identity for anyone who actually logs into a 9th Round app — every staff role, always, and a member only if/when they're issued app access.

`members.linked_profile_id` is a nullable FK to `profiles.id` for exactly that case. This keeps "is a customer" and "can log in" as two separate, independently-true facts, matching how real gyms operate (most members never touch an app) rather than forcing every walk-in sign-up through an auth flow just to exist in the system.

## 14.3 Schema

Migration: `supabase/migrations/20260806000002_reception_membership.sql`.

- **`branches`** — minimal on purpose (id/name/address/phone). Seeded with one "Main Branch" row. Branch-management UI is out of scope for this slice; the table exists because `branch_manager`/`reception`/`members` all need to be scoped to *something*.
- **`profiles.branch_id`** — every staff member's home branch (added here, not on `staff_profiles`, since `staff_profiles` is specifically for client-facing coaching staff — bio/specialties/certifications — and a branch_manager/super_admin has neither).
- **`members`** — the CRM record described above. `member_code` (an 8-char code derived from the row's own UUID) is what a barcode/QR encodes and what search matches against — no separate barcode/QR column, avoiding duplicate data for the same identifier.
- **`memberships`** — one row per membership period (monthly/quarterly/semi_annual/annual/custom). Renewing inserts a **new** row rather than mutating the old one, so history is permanent and queryable. `final_price` is a generated column (`price - discount`), not a value the client computes and stores, so it can never drift. A partial unique index enforces at most one `active` membership per member at a time.
- **`membership_payments`** — append-only. RLS grants `select`/`insert` only, never `update`/`delete`, anywhere — "every payment must create a permanent transaction record" is enforced at the database level, not just by convention. Corrections happen via a new (e.g. negative-amount) row, never by editing history.
- **`membership_alerts`** + `generate_membership_alerts()` — populates 7-day/3-day/expiration-day/expired alerts and flips `memberships.status` to `expired` once `end_date` has passed. The function is written to be idempotent (safe to call repeatedly) and is meant to run on a daily schedule; **wiring up that schedule (pg_cron or an Edge Function cron) is a follow-up ops step, not included in this migration.**
- **`reception_dashboard_stats`** (view) — the seven Reception Dashboard numbers (active members, new today, expiring today/this week, expired, daily/monthly revenue) as one query, so the client never has to keep multiple ad hoc counts consistent with each other.

All five new tables have RLS enabled. Access is branch-scoped via `is_branch_staff(branch_id)` (true for `super_admin`, or for `branch_manager`/`reception`/`coach` whose `profiles.branch_id` matches); write access (insert/update on members & memberships, insert on payments) is further restricted to `reception`/`branch_manager`/`super_admin`. A member can read their own `members`/`memberships` rows via `linked_profile_id`, for when member-facing app access exists.

**Verified** against a real Postgres engine (pglite, same methodology as docs/phase-1/12-implementation-status.md §12.5) — all 9 migrations + seed apply cleanly, and a dedicated functional test confirmed, under a genuinely non-superuser Postgres role (matching Supabase's real `authenticated` role, not the session default which silently bypasses RLS): cross-branch member reads are blocked, the one-active-membership constraint is enforced, payment rows cannot be edited after creation (0 rows affected, not an error — RLS makes the row invisible to `UPDATE` rather than raising), the dashboard view computes correctly, and `generate_membership_alerts()` both raises the right alerts and auto-expires overdue memberships.

## 14.5 Membership Registration

Migration: `supabase/migrations/20260806000003_membership_registration.sql`. Refines the schema above once the real reception-desk workflow was specified in more detail:

- **`membership_types`** — a real table (`id`, `name`, `duration_days`, `price`, `is_active`), replacing the fixed `membership_type` enum, so a branch_manager can add/reprice a type without a code deploy. Seeded with the 6 named types (One Month/Three Months/Six Months/Annual/Personal Training/VIP) and their durations — **price is left at 0, deliberately**: a fabricated real-looking price would be exactly the "mock data" the product rules out, so Reception always confirms the real price per registration (the type's price is only a pre-fill convenience).
- **`memberships.membership_number`** — a formatted sequential ID (`9R-000001`, `9R-000002`, ...), generated via a Postgres sequence in the column default, not app code (guarantees no gaps/races). **Real bug caught in testing**: the `authenticated` role needs an explicit `grant usage on sequence ...` — sequences aren't covered by table-level grants, so without it every real insert would fail with "permission denied for sequence."
- **`memberships.receipt_number`** — required, unique (`uq_memberships_receipt_number`). **`members.phone`** — now unique (`uq_members_phone`). Both business rules ("cannot be duplicated") are enforced at the database level, not just in application code.
- **`members.national_id`** — added, optional.
- **`memberships.payment_method`** — captured directly on the row (the common case: one payment at registration) as a convenience alongside the permanent `membership_payments` ledger from §14.3, which remains the source of truth for revenue reporting.
- **`register_membership()`** — the "+ New Membership" form's single write: creates the member, membership, and payment rows together in one function body (`security invoker`, so every RLS insert policy still applies exactly as if the client had inserted each row itself — this is atomicity, not a privilege escalation). Computes `end_date` from the selected type's `duration_days` server-side.

**Verified** the same way as §14.3 (pglite, non-superuser `authenticated` role): `membership_number` generates correctly and sequentially, `register_membership()` creates all three rows atomically with the right computed values, duplicate phone/receipt are both rejected at the DB level, and the dashboard view reflects new registrations correctly.

**App layer**: `packages/reception` gained `RegisterMembershipUseCase`, `ListMembershipTypesUseCase`, `SearchMembersUseCase` (12 tests total). Mobile UI: `app/(reception)/membership.tsx` (live search by name/phone/member code — no mock data) and `app/(reception)/new-membership.tsx` (the full registration form — receipt number, member details, membership type picker, live-computed final price and end date, payment method, notes; on success shows the generated membership number before returning to the Dashboard). Date-of-birth is a plain `YYYY-MM-DD` text field for now — a native date picker is a small follow-up, not blocking.

## 14.6 What's Built vs. Pending

| Item | Status |
|---|---|
| Role model v2 (migration + `packages/identity` + `packages/database-types`) | ✅ Done, tested |
| `branches` / `members` / `memberships` / `membership_payments` / `membership_alerts` tables + RLS | ✅ Done, tested |
| `membership_types` table + `register_membership()` RPC | ✅ Done, tested |
| `reception_dashboard_stats` view | ✅ Done, tested |
| `generate_membership_alerts()` | ✅ Done, tested — **not yet scheduled** (needs pg_cron or an Edge Function cron, a later ops step) |
| `packages/reception` bounded context (Clean Architecture — domain/application/infrastructure) | ✅ Done — Dashboard, Registration, Membership Types, Member Search — 12 tests |
| Reception Dashboard screen (app) | ✅ Done — `app/(reception)/index.tsx` |
| Membership Registration screen (search) + New Membership form (app) | ✅ Done — `app/(reception)/membership.tsx`, `app/(reception)/new-membership.tsx` |
| One-click renewal use case | 📋 Not started — next slice |
| Member detail/edit screen | 📋 Not started |
| Native date picker for Date of Birth | 📋 Not started — plain text field for now |
| `generate_membership_alerts()` scheduling | 📋 Not started — ops step (pg_cron / Edge Function cron) |

Per the project's phased-delivery instruction, this slice (Membership Registration) is done and ready for you to run/test before the next slice.
