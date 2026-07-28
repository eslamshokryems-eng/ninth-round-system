# 8. Deployment Plan

## 8.1 Environments

| Environment | Supabase project | Purpose |
|---|---|---|
| `development` | dedicated dev project | Local/dev builds, seeded fake data, feature branches |
| `staging` | dedicated staging project | Pre-production QA, mirrors prod config, used for App Store/Play internal testing tracks |
| `production` | production project | Live users |

Each environment has its own Stripe account mode (test vs live keys), Cloudflare Stream namespace, and Firebase project — no shared secrets between staging and production, ever.

## 8.2 CI/CD Pipelines (GitHub Actions)

| Workflow | Trigger | Steps |
|---|---|---|
| `ci.yml` | Every PR | Install (pnpm, cached) → lint → typecheck → unit tests (Vitest) → build all packages (Turborepo, cached/incremental) |
| `db-migrate.yml` | Merge to `main` (path filter: `supabase/migrations/**`) | Runs `supabase db push` against staging automatically; production migration is a manual-approval gated job |
| `web-deploy.yml` | Merge to `main` (path filter: `apps/web/**`) | Vercel deploy (Vercel's own Git integration typically handles this natively; workflow exists for any custom pre-deploy checks) |
| `mobile-release.yml` | Manual dispatch / tag push (`mobile-v*`) | `eas build --platform all --profile production` → `eas submit` to App Store Connect & Play Console |
| `functions-deploy.yml` | Merge to `main` (path filter: `supabase/functions/**`) | `supabase functions deploy <changed-function>` per function, staging first, then a manual-approval promote to production |

Every deploy-to-production job requires a manual approval gate (GitHub Environments protection rule) — nothing reaches real users without a human confirming.

## 8.3 Mobile Release Process

1. **Development builds**: Expo Dev Client, installed on physical test devices, connects to `staging` Supabase project.
2. **Internal testing**: EAS Build production profile → TestFlight (iOS) / Play Internal Testing track (Android), pointed at `staging`.
3. **Production release**: promote the tested build (or a fresh build pointed at `production`) → App Store review / Play review → phased rollout (Play supports staged rollout percentages natively; iOS uses phased release).
4. **OTA updates** (`eas update`): for JS-only changes (bug fixes, copy changes, non-native-module features) pushed instantly to installed apps without app-store review — reserved for low-risk fixes; anything touching native modules or store-review-sensitive behavior (e.g. payment flow) goes through a full store release.

### Mobile Store Billing Compliance

Per Apple/Google policy, digital subscription purchases initiated **inside** the app binary must use StoreKit/Play Billing, not an external payment link. Plan: mobile purchases route through native IAP; web purchases (e.g. from a marketing site or the Trainer/Admin portal) route through Stripe Checkout. A reconciliation Edge Function maps both purchase rails into the single `subscriptions` table so entitlement checks are rail-agnostic (see [Security Plan §7.4](07-security-plan.md#74-payment-security)).

### App Store / Google Play Readiness Checklist

Prepared ahead of the first submission, not discovered during it:

- [ ] **Bundle identifiers reserved**: `com.ninthround.app` on both App Store Connect and Google Play Console (already set in `apps/mobile/app.config.ts`).
- [ ] **Apple Sign-In** implemented and tested — required the moment Google Sign-In exists (Guideline 4.8), already declared in `app.config.ts` (`usesAppleSignIn: true`, `expo-apple-authentication` plugin).
- [ ] **Privacy manifest (iOS)**: declare data collection categories (account info, health/fitness data, usage data) and any "required reason" API usage (e.g. UserDefaults) via Expo's privacy manifest support.
- [ ] **Play Data Safety form**: mirrors the iOS privacy manifest — what's collected (health/fitness metrics, photos, payment info via Stripe/IAP), whether it's shared, whether it's encrypted in transit/at rest.
- [ ] **Permission usage strings**: camera (progress photos, QR check-in), photo library (progress photos, avatar), notifications — each with a clear, localized (en + ar) purpose string, not a generic default.
- [ ] **Age rating / content rating questionnaire** completed for both stores (fitness/health category, no mature content).
- [ ] **Localized store listings**: screenshots, description, and metadata in both English and Arabic — matching the app's actual bilingual support (a store listing in only one language for a bilingual app undersells it and can read as inconsistent to reviewers).
- [ ] **Export compliance (iOS)**: standard encryption-only declaration (HTTPS/TLS use, no custom cryptography).
- [ ] **Account deletion**: a self-service "delete my account" path reachable from within the app (Apple Guideline 5.1.1(v) requirement since the app supports account creation) — implements the deletion flow from [Security Plan §7.3](07-security-plan.md#73-data-protection).
- [ ] **Subscription terms surfaced pre-purchase**: price, billing interval, auto-renewal terms shown before the native purchase sheet, per both stores' subscription guidelines.
- [ ] **Crash-free and cold-start performance** validated on a low-end device profile before submission, not just a development machine.
- [ ] **TestFlight / Play Internal Testing sign-off** from at least one reviewer per platform before requesting production review.

## 8.4 Web Deployment (Admin + Trainer Portal)

- Hosted on **Vercel**: automatic preview deployment per PR (reviewers see a live URL before merge), production deploy on merge to `main`.
- Environment variables (Supabase URL/anon key, Stripe publishable key, etc.) configured per-environment in Vercel project settings, never in the repo.
- Role-gated routing (`(admin)` vs `(trainer)` route groups) enforced both in Next.js middleware (fast reject) and re-validated server-side per request (defense in depth, matching the RLS philosophy used elsewhere).

## 8.5 Database Migrations

- All schema changes are plain SQL files in `supabase/migrations/`, generated via `supabase migration new <name>` and reviewed in PR like any other code change — no manual production schema edits through the Supabase Studio UI.
- Migrations are additive/backwards-compatible by default (add nullable column → backfill → make non-null in a later migration) so a migration can run ahead of a client release without breaking the currently-live app version.
- `packages/database-types/src/index.ts` is regenerated (`supabase gen types typescript`) and committed as part of the same PR as the migration, so type errors surface immediately if a client used a column that changed shape — see [DDD Architecture §13.2](13-ddd-architecture.md#132-the-layering-inside-every-bounded-context-package) for why only each context's `infrastructure/` layer is allowed to import it.

## 8.6 Observability

| Signal | Tool | Alerting |
|---|---|---|
| Application errors (mobile, web, edge functions) | Sentry | Slack alert on new error type or spike |
| Uptime / API latency | Supabase built-in dashboard + Vercel Analytics | Alert on p95 latency regression |
| Product analytics | PostHog | Weekly funnel/retention review, not paged |
| Payment failures | Stripe Dashboard + webhook-driven internal alert | Immediate Slack alert on elevated `invoice.payment_failed` rate |
| Infra cost | Supabase/Vercel/Cloudflare/Stripe billing dashboards | Monthly review; budget alert thresholds set per provider |

## 8.7 Rollback Strategy

- **Web**: Vercel keeps every deployment; rollback is a one-click "promote previous deployment."
- **Mobile**: OTA updates can be rolled back instantly (`eas update:republish` to a prior update group); native builds cannot be "rolled back" post store-approval, so risky native changes ship behind a PostHog feature flag that can be killed server-side without a new build.
- **Database**: forward-only migration philosophy — a bad migration is fixed by a new corrective migration, not by reverting, to avoid divergent schema history across environments; this is why migrations are kept small and additive.

## 8.8 Rough Cost Envelope (directional, re-check against current pricing at build time)

| Stage | Approx. monthly infra cost | Notes |
|---|---|---|
| Pre-launch / MVP (<1k users) | Low hundreds USD | Supabase Pro, Vercel Pro, Cloudflare Stream pay-as-you-go, Claude API usage-based |
| Early growth (1k–20k users) | Low-to-mid thousands USD | Scales mostly with video bandwidth + AI token usage; Postgres tier upgrade |
| 100k users | Higher, but revenue-proportional | Dominant costs at this scale: video delivery (mitigated by R2's zero egress + CDN caching), AI inference (mitigated by model tiering, see [Technical Roadmap §2.2](02-technical-roadmap.md)), and Postgres compute/read-replicas (see [Scalability Plan](10-scalability-plan.md)) |

Next: [Development Phases →](09-development-phases.md)
