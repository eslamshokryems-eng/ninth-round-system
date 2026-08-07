# 12. Implementation Status

Maintained continuously as code lands, per the requirement to generate technical documentation *while* coding, not after. Update this table in the same PR as any code change it describes — a stale status here is treated the same as a stale README (see [Coding Standards §11.7](11-coding-standards.md#117-documentation)).

## What's Implemented and Tested Right Now

| Package / App | Status | Tests |
|---|---|---|
| `packages/shared-kernel` | ✅ Implemented | 6 passing |
| `packages/i18n` | ✅ Implemented — full en/ar coverage for every shipped screen | 3 passing (key-parity + locale resolution) |
| `packages/database-types` | ✅ Implemented (hand-authored placeholder — see file header for the `pnpm db:types` replacement note) | — |
| `packages/supabase-client` | ✅ Implemented | — |
| `packages/ui` — `tokens/` | ✅ Implemented | — |
| `packages/ui` — `native/` | ✅ Implemented — `Text`, `Button`, `TextField`, `Card`, `ScreenContainer`, `ProgressDots`, `OptionCard`, `Divider`, `IconButton`/`BackButton` | — (presentational; exercised via the mobile app's bundle-level smoke test, see below) |
| `packages/ui` — `web/` | 📋 Not started | — |
| `packages/config` | ✅ Implemented | — |
| **`packages/identity`** | ✅ Implemented — the reference bounded context, now covering registration, login, forgot-password, onboarding (name/goal/experience/body-metrics), and role assignment against the 5-role model (member/coach/reception/branch_manager/super_admin) | **39 passing** (domain, application, and infrastructure-mapping tests, all using in-memory fakes — zero database) |
| **`packages/reception`** | ✅ Dashboard + Membership Registration (with photo + QR identity) + Renewal + member detail/edit + Attendance Check-in + Expenses + Other Sales + Receipts done — see [§14](14-reception-membership.md) | 42 passing |
| **`packages/training`** | 🟡 Partially prepared — see [§12.2](#122-9th-round-timer-architecture-prep) | 5 passing (`RoundPlan` value object) |
| `packages/nutrition`, `packages/tracking`, `packages/billing`, `packages/notifications` | 📋 Skeleton only | — |
| `packages/ai` | 📋 Skeleton only (Phase 3) | — |
| **`apps/mobile`** | ✅ 16 member-facing screens + the Reception Dashboard — see [§12.1](#121-mobile-screens-shipped) and [§14](14-reception-membership.md) | Typechecks + lints clean; verified with a real `expo export` bundle (see below) |
| `apps/web` | 📋 Not started — zero `.tsx` files | — |
| `supabase/functions/*` | 📋 Contract documented in each function's README; zero `index.ts` implementations | — |

**Total: 95 automated tests, all passing** (`pnpm test` via Turborepo). **10 typecheck targets, all passing** (`pnpm typecheck`). **Lint clean across the entire repository** (`pnpm lint`), including type-aware rules (`@typescript-eslint/no-floating-promises`) via typescript-eslint's Project Service.

## 12.1 Mobile Screens Shipped

| Screen | Route |
|---|---|
| Language selection (en/ar) | `app/(auth)/language.tsx` |
| Welcome carousel (3 animated slides) | `app/(auth)/welcome.tsx` |
| Sign up | `app/(auth)/sign-up.tsx` |
| Log in | `app/(auth)/log-in.tsx` |
| Forgot password | `app/(auth)/forgot-password.tsx` |
| Onboarding — Profile setup (name) | `app/(auth)/onboarding/profile.tsx` |
| Onboarding — Fitness goal | `app/(auth)/onboarding/goal.tsx` |
| Onboarding — Training experience | `app/(auth)/onboarding/experience.tsx` |
| Onboarding — Body metrics (gender/age/height/weight) | `app/(auth)/onboarding/body-metrics.tsx` |
| Dashboard Home | `app/(tabs)/index.tsx` |
| Train / Nutrition / Progress (honest "coming soon" placeholders) | `app/(tabs)/{train,nutrition,progress}.tsx` |
| Profile (working sign-out; settings not built yet) | `app/(tabs)/profile.tsx` |

Root routing gate (`app/index.tsx`) redirects based on locale/session/onboarding state; `app/_layout.tsx` bootstraps providers and holds the splash screen until auth state resolves.

## 12.2 9th Round Timer — Architecture Prep

Per explicit instruction, the timer itself is **not implemented** — only prepared:

- `packages/training/domain/round-plan.ts` — a validated value object for a round-based workout's shape (rounds/work-seconds/rest-seconds), tested (5 tests). Not a timer: no notion of "currently running."
- `packages/training/domain/timer-phase.ts` — the discriminated union (`idle`/`work`/`rest`/`complete`) the future timer's state will take. Type declaration only, no reducer/countdown logic.
- **Not yet built**: the `TimerSession` aggregate, `StartWorkoutSessionUseCase`/`CompleteWorkoutSessionUseCase`, the Supabase-backed `WorkoutLogRepository`, the mobile `useWorkoutSessionStore`, and the `TimerRing` design-system primitive. See `packages/training/README.md` for the full planned shape.

## 12.3 Known Gaps / Honest Caveats

- **No live (cloud) Supabase project exists yet — this environment cannot create one.** This sandbox's network policy blocks `api.supabase.com` (and, separately, Expo's and ngrok's tunnel-relay domains) at the proxy layer; Docker's daemon isn't running here either, so a local Supabase stack (`supabase start`) isn't possible from within this session. Creating the actual cloud project is a step only you can do, from your own browser — see [Local Setup](13-local-setup.md).
- **The migrations themselves have been verified against a real Postgres engine, though.** See §12.5 below — this is new since the last update and materially reduces the "untested SQL" risk that previously existed.
- **Expo Go compatibility went through two rounds of fixes.** The app originally targeted Expo SDK 51 (mid-2024) and was first upgraded to SDK 57, the newest version published to npm at the time. Once running on a real device, though, the installed Expo Go client from the App Store turned out to be capped at SDK 54 — Expo publishes new SDK packages to npm well before the corresponding Expo Go app store build finishes rollout, so "latest on npm" and "latest installable via the App Store" are different things and only the second one matters for Expo Go. The toolchain was downgraded to match SDK 54 exactly (React 19.1, React Native 0.81.5, Reanimated ~4.1.1 + `react-native-worklets` 0.5.1, Expo Router 6.0, NativeWind 4.2), using the exact version matrix from SDK 54's own published `bundledNativeModules.json`.
- **Now verified on a real physical iPhone**, not just via bundle export — the app was reached over an Expo tunnel connection (the device's Wi-Fi router isolates clients from each other, so a plain LAN connection didn't work; `expo start --tunnel` routes around that). This is the strongest verification tier and supersedes the earlier bundle-export-only checks.
- **RTL manual QA needed**: the welcome carousel's horizontal `ScrollView` + `scrollTo` is a known rough edge for RTL on Android (horizontal scroll direction doesn't always mirror automatically); the language-picker's "restart to apply" flow for `I18nManager.forceRTL` has never been exercised on a device. Both need hands-on verification in Arabic.
- **SecureStore session size**: the Supabase auth session storage adapter (`apps/mobile/src/lib/secure-store-adapter.ts`) doesn't chunk large values; flagged as a follow-up if a JWT with several custom claims ever approaches SecureStore's per-key limit.
- **Google/Apple sign-in**: `expo-apple-authentication` is a declared dependency but no OAuth screen/flow has been built yet — email/password only, so far.
- **Real brand assets, as of this update**: `apps/mobile/assets/{icon,splash,adaptive-icon,favicon}.png` are generated from the actual 9th Round Kenpo & Fitness logo (`apps/mobile/assets/brand/` holds the original source files) — no longer solid-color placeholders. `icon.png`/`favicon.png` are the emblem flattened onto the brand's near-black background (App Store icons can't have transparency); `adaptive-icon.png` keeps the emblem on a transparent layer with extra padding for Android's mask safe-zone; `splash.png` is the full wordmark. The source emblem is modest resolution (255×261) upscaled to 1024×1024 — sharp enough for icon use, but a higher-resolution source would sharpen it further if one becomes available.
- **The native app icon and splash screen cannot be seen in Expo Go**, and this is a property of Expo Go itself, not a bug: Expo Go is a single prebuilt container app shared across all projects, so it shows *its* icon on the home screen and *its* loading screen — a project's custom native config only takes effect in a standalone or dev-client build (EAS Build). The brand mark is therefore also rendered in JS via `packages/ui/native/logo.tsx` (`<Logo variant="wordmark" | "emblem" />`), used on the language picker, the welcome carousel, and the Reception Dashboard header, which *is* visible in Expo Go.
- **Member photo URLs are long-lived signed URLs (10 years), not permanent public links**: `member-photos` is a private Supabase Storage bucket, and `SupabaseMemberPhotoRepository` generates the signed URL once at upload time and stores it directly. This is a pragmatic stand-in for "effectively permanent" rather than building a resigning mechanism (which would need `profile_image_url` to store a bare storage path instead, with the client fetching a fresh signed URL on every read) — flagged as a follow-up if photo links ever need to be revocable or the 10-year horizon becomes a real concern.
- **Check-In is a manual tap today, not a QR scan**: the member QR identity (`members.qr_code`) and the `check_in_member()` RPC it will feed both exist and are tested, but no camera-based scanning screen has been built yet — see item 5 in §12.6.

## 12.5 Database Verification (embedded Postgres, no Docker/cloud required)

Since neither a cloud Supabase project nor a local Docker-based one is reachable from this sandbox, the 7 migrations + seed data were instead run against `@electric-sql/pglite` — a real Postgres engine compiled to WASM, run in-process via Node, with a minimal stand-in for Supabase's `auth` schema (a `users` table and the real, publicly-documented `auth.uid()`/`auth.jwt()` function bodies). Findings:

- All 7 migrations and `seed.sql` applied with **zero errors**, in order, against a real Postgres parser/executor — the first time any of this SQL had ever actually run.
- `handle_new_user()` was confirmed to auto-create a `profiles` row the instant a row is inserted into (the stand-in) `auth.users`, with no manual insert needed.
- RLS was confirmed to actually scope a query correctly: a session with `auth.uid()` set to one user's ID and a `FORCE ROW LEVEL SECURITY` table correctly returned 0 rows for another user's data.
- One real bug was found and fixed in the test harness's own `auth.uid()` stub (a missing `::uuid` cast) — zero bugs were found in the actual migration files themselves.

This does not replace running against a real Supabase project (Supabase's actual Postgres has extensions/roles/behaviors beyond this minimal stand-in), but it is strong, real evidence the schema is structurally sound before you ever point it at your own project.

## 12.6 Next Slice (proposed)

The product has pivoted from a public consumer app to a private club-management platform — see [Reception & Membership System](14-reception-membership.md) for the full picture. The Dashboard, Membership Registration (with profile photo + QR identity), Membership Renewal, Member Detail/Edit, and Attendance Check-in are done and tested — the core Reception + front-desk workflow is now complete end to end (search → register (photo + QR) → renew → view/edit a member → check them in). Remaining:

1. Push the eight new migrations (`20260806000001_role_model_v2.sql` through `20260806000008_member_photo_and_qr.sql`) to the real Supabase project via `supabase db push`. `20260806000004_fix_auth_role.sql` in particular fixes a real bug blocking Save Membership on a live session — see its migration comment for the root cause (RLS self-recursion through `auth_role()`).
2. Wire up `generate_membership_alerts()` to a daily schedule (pg_cron or an Edge Function cron) — written to be idempotent, not yet scheduled.
3. Replace the plain-text Date of Birth field with a native date picker.
4. Run `pnpm db:types` against the real project and replace the hand-authored `packages/database-types` placeholder with genuinely generated types (now includes the Reception & Membership tables too).
5. A real QR-scanning Check-In flow (device camera → decode → `check_in_member()`) — today's Check-In is a manual tap; the QR identity and `check_in_member()` RPC it will call already exist.
6. Move on to the next area of the product roadmap: a Payments screen/report (the `membership_payments` ledger and `payment_method` capture already exist; no dedicated UI yet — e.g. a daily/monthly transaction list), or the Coach Dashboard.
7. Once Reception's remaining polish items are done, revisit the consumer-app RTL caveats above and the `training` context (Program/Workout/Exercise entities, the `TimerSession` aggregate, the 9-Round Timer UI) as later phases.
