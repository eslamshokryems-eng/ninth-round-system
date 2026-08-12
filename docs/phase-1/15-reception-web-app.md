# 15. Reception Web App

A dedicated desktop web application for Reception staff (`apps/web`), so a front-desk Windows computer needs nothing but a browser — no phone, no Expo Go, no ngrok tunnel, no developer's laptop. It talks directly to the same production Supabase project the mobile app uses, through the same public anon key + RLS security model — there is no second backend, no service_role key in the browser, and no privileged bypass of any policy described in [§14](14-reception-membership.md).

```
Reception computer → Chrome/Edge → 9th Round Reception Web App → Supabase (existing project)
```

## 15.1 What it reuses vs. what's new

Everything in `packages/reception` and `packages/identity` is framework-agnostic TypeScript (domain/application/infrastructure layers never import React Native or the DOM) — this is what made a desktop web app buildable in one pass without rewriting a single use case. `apps/web` is a thin presentation layer on top of the exact same:

- `createReceptionModule(client)` / `createIdentityModule(client)` composition roots (mirrors `apps/mobile/src/lib/composition-root.ts`)
- `RegisterMembershipUseCase`, `UploadMemberPhotoUseCase`, `GetNextMembershipNumberUseCase`, `RenewMembershipUseCase`, `CheckInMemberUseCase`, `UpdateMemberUseCase`, `GetMemberDetailUseCase`, `SearchMembersUseCase`, `GetDashboardStatsUseCase`, `ListReceiptsUseCase`
- One new, equally thin addition: `ListExpiringMembershipsUseCase` (+ `SupabaseExpiringMembershipRepository`), matching `reception_dashboard_stats`' "expiring this week" window exactly, backing the Expiring page's member list (the Dashboard already had the *count*; this is the *list*).

What's new is presentation only: a Tailwind-styled component set built directly in `apps/web/src/components/ui/` (Button, Card, TextField, SelectField, OptionCard, StatCard, QrCodeImage) — **not** in `packages/ui/web`, despite that export path already existing. `packages/ui` pins `react@19.1.0` as an exact peer/dev dependency for the mobile app's sake; adding web components there would risk a duplicate-React resolution conflict with `apps/web`'s `react@18.2.0`. Building them app-local avoids that risk entirely. `packages/ui/tokens`' color values (`#0B0B0C` / `#C9A227` / etc.) are still the single source of truth — `apps/web/tailwind.config.ts` copies them, mirroring how `apps/mobile/tailwind.config.js` already does.

## 15.2 Auth

Reception has its own login screen (`app/(auth)/login/page.tsx`), backed by `SignInUseCase` — the identical Supabase Auth email/password flow the mobile app uses, not a second auth system. The Supabase client persists its session in `window.localStorage` (supabase-js's own default in a browser — no custom storage adapter needed, unlike mobile's SecureStore adapter). Role/branch authorization is enforced two places, deliberately unequal in trust level:

- **The database (real boundary):** every RLS policy from [§14](14-reception-membership.md) applies exactly as-is — a `member`/`coach` account, or no account at all, gets nothing beyond what those policies already allow, regardless of what this app's UI does.
- **`app/(reception)/layout.tsx` (UX nicety, not security):** redirects a signed-out visitor to `/login`, and shows a plain "not authorized" message instead of Reception screens for a signed-in `member`/`coach` account. This exists so a wrong-role sign-in produces a clear message instead of a wall of RLS-empty tables — it is not what makes the data safe.

## 15.3 Scope decisions made without asking (documented, not silent)

- **English-only for this pass.** `@9thround/i18n`'s en/ar locale files and the mobile app's bilingual UI are untouched; this app writes plain English strings directly rather than wiring up react-i18next. This is an internal, Windows-desktop-only staff tool — bilingual support is a real, valuable follow-up, not something quietly dropped.
- **No in-browser photo cropping.** Add Member's photo step is a plain `<input type="file">` (no crop UI, unlike the mobile app's native `expo-image-picker` crop step) — the upload architecture (`UploadMemberPhotoUseCase` → `member-photos` bucket → signed URL) is identical either way; only the client-side crop step is mobile-only for now.
- **QR rendering uses `qrcode`** (a small, dependency-light, framework-agnostic npm package that renders to a data URL client-side), not `react-native-qrcode-svg` (RN-only, can't run in a browser). No QR image is generated server-side or stored anywhere in either app — only the value it encodes (`members.qr_code`).
- **Memberships / Expiring / Reports scope:** "Memberships" is the configurable type catalog (`ListMembershipTypesUseCase`) plus a member search that jumps into that member's Renew action — not a separate renewal engine. "Expiring" is a real, live list (new `ListExpiringMembershipsUseCase`), not a placeholder. "Reports" *is* an honest placeholder — no reporting use case exists anywhere in `@9thround/reception` yet, and revenue trends/exports would be real new scope, not a UI-only exercise; the page says so plainly rather than inventing numbers.

## 15.4 A real bug found and fixed along the way

`next build` failed outright (`next.config.ts` isn't supported on the pinned Next.js 14 — TypeScript config support only landed in Next 15) — fixed by converting to `next.config.mjs`. This was a **pre-existing, latent bug**: the file existed before this slice, but `next build` had never actually been run against it, since `apps/web` had zero real pages until now.

A second, deeper one: even after that fix, `next build` crashed while pre-rendering Next's own built-in `/404` and `/500` fallback pages (`TypeError: Cannot read properties of null (reading 'useContext')`, inside `styled-jsx`) — every one of the 13 real Reception routes built and rendered correctly; only Next's two auto-generated fallback pages failed, but that failure makes `next build` exit non-zero and skip writing `prerender-manifest.json`, which `next start` requires — so the build genuinely wasn't deployable, not just noisy. Root cause: this repo needs two different React majors at once (`apps/mobile` pins React 19 exactly for RN 0.81; `apps/web` needs React 18 for Next 14), which forces pnpm to nest a private `react`/`react-dom` copy for `next` to satisfy its peer dependency — and pnpm doesn't reuse that already-correct nested copy for `styled-jsx`'s *own* peer requirement, so it nests a *third*, separate physical copy. Three physically distinct 18.2.0 `react` instances, each with independent internal dispatcher state, is what actually crashes — not a version mismatch (`pnpm.overrides` alone didn't fix it, confirmed by testing). Fixed by `scripts/fix-next-react-dedup.mjs`, wired as this repo's root `postinstall` script: it forces `next/node_modules/{react,react-dom}` and `styled-jsx/node_modules/react` to be the same physical directory as `apps/web/node_modules/{react,react-dom}` via a directory junction (no elevated privileges needed on Windows, a plain symlink on macOS/Linux) — a dedup, not a version change. Verified three ways: a clean `pnpm install` (confirming the postinstall hook self-heals automatically), a full `next build` (exit 0, all 13 routes + `/_not-found`), and a real `next start` serving `/login` and `/dashboard` with 200s and an unknown route with a correct 404.

## 15.5 Environment configuration

Two new variables in `.env` (already reserved as placeholders in `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Same values as `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the same Supabase project, just Next.js's own required env-var prefix for browser-exposed values (`NEXT_PUBLIC_*`) instead of Expo's (`EXPO_PUBLIC_*`). `SUPABASE_SERVICE_ROLE_KEY` is never read by any file under `apps/web` — grep confirms zero references.

## 15.6 Running it

```
pnpm install               # also runs the postinstall react-dedup fix automatically
pnpm --filter @9thround/web dev     # local development, http://localhost:3000
pnpm --filter @9thround/web build   # production build
pnpm --filter @9thround/web start   # run the production build
```

Deployment (Vercel, or any Node host) is a normal Next.js app deploy — no Expo/Metro/ngrok/tunnel of any kind is involved anywhere in this app's stack. See the session report for the exact next steps to take it live.

## 15.7 What's not built yet

- Bilingual (Arabic/RTL) UI — see §15.3.
- In-browser photo cropping — see §15.3.
- Reports (revenue trends, exports) — honest placeholder, see §15.3.
- A QR-camera-scanning Check-In flow for the web app (mirrors the same gap already documented for mobile in [§14.6](14-reception-membership.md)) — today's web Check-In, like mobile's, is a manual button tap.
- Expenses / Other Sales screens on the web (they exist on mobile — see §14.7's sibling section once ported; this app's Phase 5 sidebar spec didn't include them, so they were deliberately left out of this slice rather than half-built).

## 15.8 Manage Staff

`app/(reception)/staff/page.tsx` — visible only to `branch_manager`/`super_admin` (hidden from the sidebar for everyone else, and the page itself refuses to render for any other role even if reached directly by URL). Two things live here, both grounded in already-documented rules rather than new ones:

- **Change an existing account's role** — search by name (`SearchStaffCandidatesUseCase` + `ProfileRepository.search()`, new thin additions to `packages/identity`), then assign a role via the existing `AssignStaffRoleUseCase`. The role dropdown is filtered through `Role.canAssignRole` so the UI never offers a grant the backend (and the database — see §12.3) would reject.
- **Create a new account** — for someone who has never signed in before. `POST /api/staff/create-account` (`apps/web/app/api/staff/create-account/route.ts`) is this app's **first Route Handler and its only use of `SUPABASE_SERVICE_ROLE_KEY`**: a plain server env var (no `NEXT_PUBLIC_` prefix, never bundled to the browser — confirmed by the production build listing this route as `ƒ` server-rendered, `0 B` client bundle). It re-verifies the caller's own identity and role from their access token before doing anything (never trusts a client-supplied "I'm an admin" claim), re-checks `Role.canAssignRole` independently of the UI filter, then uses the Admin API to create the login and set its role/branch. The founder sets a temporary password directly rather than an emailed invite link — simpler, and doesn't depend on Supabase's transactional email being configured.

See [§14.1.1](14-reception-membership.md) for the `sales_employee` role this page can now also grant — same permissions as `reception` except check-in.

## 15.9 HR

A new bounded context, `packages/hr` (mirrors `packages/reception`'s domain/application/infrastructure/composition-root shape — see docs/13-ddd-architecture.md), backing `app/(reception)/hr/page.tsx` — one page, four tabs, visible to every staff role (unlike Manage Staff): Attendance, Schedule, Leave Requests, and Payroll (that last tab only rendered — and only reachable server-side — for `super_admin`; see below). Migration: `supabase/migrations/20260811000001_hr_system.sql`. All four tables verified against a real Postgres engine (pglite, same methodology as §14.3/§14.5) for every access rule described here, not just happy-path inserts.

- **Attendance (Clock In/Out).** Self-service — a staff member clocks themself in/out (`ClockInUseCase`/`ClockOutUseCase`); `branch_manager`/`super_admin` additionally see everyone's attendance for the branch, today. A partial unique index (`attendance_records` where `clock_out is null`) enforces "at most one open clock-in per person" at the database level, not just in application code — confirmed a double clock-in is rejected by Postgres itself, independent of the use case's own `ALREADY_CLOCKED_IN` check.
- **Schedule (Shifts).** Weekly-recurring (`day_of_week` + `start_time`/`end_time`), not specific-dated — a scope decision made without asking, matching how a small single-branch gym actually staffs; a full dated-shift calendar is a real, larger follow-up if ever needed. Set by `branch_manager`/`super_admin` only (`"branch_manager/super_admin manage shifts"` RLS policy) — an employee cannot create their own shift, confirmed by a blocked-insert test. Everyone at the branch can read the whole schedule.
- **Leave Requests.** A staff member creates their own (`RequestLeaveUseCase`); `branch_manager`/`super_admin` approve or reject (`ReviewLeaveRequestUseCase`) — confirmed an employee cannot approve their own request (RLS `UPDATE` policy is admin-only), and confirmed a `branch_manager` can.
- **Payroll — `super_admin` only, not `branch_manager`.** The one deliberate exception to "admin and super_admin see the same data" (contrast with §12.3's usual admin/super_admin row-visibility parity) — salary is treated as more sensitive than ordinary staff management, on the same footing as refunds and admin-role grants (docs/12-roles-and-permissions.md §12.3/§12.4). Enforced at the database (`"super_admin manages salaries"` RLS policy, `using (is_super_admin())`), not just by hiding the tab — confirmed a `branch_manager` is blocked from both reading and writing `staff_salaries`. A new salary is a new row (`effective_from` dated), history preserved, matching how memberships/payments never mutate old rows — "current" is whichever row's `effective_from` is the most recent one not in the future. Payroll is a flat monthly figure per employee; it does not (yet) compute deductions from unpaid leave or overtime from attendance — an honest v1 scope limit, not a hidden gap.

Reused, not rebuilt: shift/salary assignment both reuse Manage Staff's `SearchStaffCandidatesUseCase` search-by-name flow (`apps/web/src/components/staff-picker.tsx`, a small shared component) to pick which employee a shift or salary applies to, rather than a new lookup mechanism.
