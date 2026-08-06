# 12. Roles & Permissions

> **Superseded role list, kept for historical/rationale context.** As of the Reception & Membership System slice, the platform is a private club-management product and the role model is **Member, Coach, Reception, Branch Manager, Super Admin** — see [`docs/phase-1/14-reception-membership.md §14.1`](phase-1/14-reception-membership.md#141-role-model-v2) for the authoritative current mapping and rationale (`client`→`member`, `trainer`+`nutritionist`→`coach`, `admin`→`branch_manager`). The *shared-staff-model rationale* (§12.2) and the *two-tier-admin-split rationale* (§12.3) below still apply exactly as written, just under the new names — that reasoning didn't change, only the labels did.

9th Round is multi-role from day one: **Client, Trainer, Nutritionist, Reception, Admin, Super Admin**. This document is the authoritative permission matrix; RLS policies (`supabase/migrations/`) and the `Role` domain value object (`packages/identity/domain/role.ts`) are both implementations of what's specified here — neither is the source of truth on its own.

## 12.1 The Six Roles

| Role | Who | Primary surface |
|---|---|---|
| **Client** | End user — the paying/free member | Mobile app |
| **Trainer** | Coaches training programs | Trainer portal (web) + mobile (view-only, Phase 2+) |
| **Nutritionist** | Coaches nutrition plans | Trainer-portal-equivalent nutrition screens (web) |
| **Reception** | Front-desk / gym check-in staff | Admin web, narrow surface (member lookup, check-in) |
| **Admin** | Day-to-day platform operator | Admin web |
| **Super Admin** | Full system control, including managing other admins | Admin web (elevated) |

## 12.2 Why One Shared "Staff" Model Instead of Three Parallel Ones

Trainer, Nutritionist, and Reception share one `staff_profiles` extension table and one `staff_client_assignments` table (`supabase/migrations/20260801000002_profiles_and_trainers.sql`) rather than a `trainer_profiles`/`nutritionist_profiles`/`reception_profiles` trio. A future staff type (e.g. a physiotherapist role) is then an enum value, not a new table + a new set of near-duplicate RLS policies. Each bounded context (Training, Nutrition) still owns its own domain behavior — `packages/training` doesn't know what a nutritionist is, and vice versa — the shared table is infrastructure the Identity context owns, not a shared domain concept. See [`docs/13-ddd-architecture.md`](13-ddd-architecture.md).

## 12.3 Admin vs. Super Admin — the Actual Distinction

This is the one rule the whole 6-role model hinges on, and it is enforced identically in two places (defense in depth, per [`docs/07-security-plan.md`](07-security-plan.md)):

- **Domain logic**: `Role.canAssignRole(targetRole)` in `packages/identity/domain/role.ts` — a `super_admin` can assign *any* role, including `admin`/`super_admin`; a plain `admin` can assign operational roles (`client`/`trainer`/`nutritionist`/`reception`) but is explicitly forbidden from creating or promoting another `admin` or `super_admin`. Tested in `packages/identity/domain/role.test.ts`.
- **Database**: the `is_admin()`/`is_super_admin()` SQL helper functions (`supabase/migrations/20260801000001_extensions_and_enums.sql`) give both roles equal **row visibility** (an admin and a super_admin see the same data), while privilege-escalation-sensitive **actions** — granting admin/super_admin roles, and (per [`docs/07-security-plan.md §7.3`](07-security-plan.md)) issuing refunds — are gated to `super_admin` specifically at the application layer, not by hiding rows.

The reasoning: if a compromised or malicious `admin` account could grant itself `super_admin`, the two-tier split would be theater. The rule exists so that privilege escalation requires a super_admin's deliberate action, not just admin-level access to a database row.

## 12.4 Full Permission Matrix (Phase 1 scope)

| Capability | Client | Trainer | Nutritionist | Reception | Admin | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Own profile, tracking, logs | RW | — | — | — | — | — |
| View assigned clients' training data | — | R (assigned only) | — | — | — | — |
| View assigned clients' nutrition data | — | — | R (assigned only) | — | — | — |
| Manage exercises/programs | — | RW (own-created) | — | — | RW | RW |
| Manage nutrition plans/food items | — | — | RW (own-created) | — | RW | RW |
| Front-desk member lookup (`reception_member_lookup`) | — | — | — | R (narrow) | R | R |
| View active subscriptions (for check-in) | — | — | — | R | RW | RW |
| Manage users/profiles | — | — | — | — | RW | RW |
| Manage subscription plans, coupons | — | — | — | — | RW | RW |
| Approve staff accounts | — | — | — | — | RW (non-admin roles only) | RW (any role) |
| Grant/revoke `admin` or `super_admin` | — | — | — | — | ✕ | RW |
| Issue refunds | — | — | — | — | ✕ | RW |
| Read admin audit log | — | — | — | — | R | R |

`RW` = read/write, `R` = read-only, `✕` = explicitly forbidden (not just "not built yet").

## 12.5 Reception's Narrow Surface, By Design

Reception's job (front-desk check-in) needs almost none of what a `profiles` row contains — not goal, not date of birth, not referral history. Rather than grant `SELECT` on the full `profiles` table and rely on the app layer to hide columns, reception's read access is a `SECURITY DEFINER` Postgres function, `reception_member_lookup(search_term)`, that returns only `id`, `full_name`, `avatar_url`, and a computed `has_active_subscription` boolean (`supabase/migrations/20260801000003_billing.sql`). This is a deliberate use of RLS-adjacent tooling correctly (requirement 6): row-level security answers "which rows," not "which columns" — a narrow function is the right primitive when the real requirement is column-level restriction. It also happens to be a plain PostgREST RPC call, so it's exercised identically from mobile and web without a bespoke Edge Function (requirement 3, API-first).

## 12.6 Role Assignment Flow

Front-line staff (trainer/nutritionist/reception) accounts are provisioned by an `admin` approving an application (`staff_profiles.is_approved`). Promoting someone to `admin` or `super_admin` requires an existing `super_admin` — there is no self-service path to either tier, by design (see §12.3). The concrete use case implementing this is `AssignStaffRoleUseCase` (`packages/identity/application/assign-staff-role.ts`), tested against exactly the rules in §12.3 (`packages/identity/application/assign-staff-role.test.ts`).

Next: [DDD Architecture →](13-ddd-architecture.md)
