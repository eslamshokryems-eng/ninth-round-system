# 7. Security Plan

## 7.1 Authentication & Authorization

- **AuthN**: Supabase Auth issues short-lived JWTs (1hr) + refresh tokens. Providers: email/password (with email verification required before write access beyond onboarding), Google OAuth, Apple Sign-In (mandatory on iOS per App Store Guideline 4.8 since Google login exists).
- **Password policy**: minimum 10 characters, breached-password check against HaveIBeenPwned range API at signup, Supabase Auth rate-limits login attempts.
- **AuthZ**: role (`client`/`trainer`/`admin`) is a custom JWT claim, checked in both Postgres RLS policies and Edge Function entry guards — defense in depth, never trust the client's stated role.
- **Session handling**: refresh tokens stored in Expo SecureStore (mobile, Keychain/Keystore-backed) and httpOnly cookies (web), never in plain AsyncStorage/localStorage.
- **Optional 2FA (TOTP)** for `admin` and `trainer` roles at launch (higher blast radius per compromised account); rollout to clients considered post-launch.

## 7.2 Row Level Security Strategy

Every table has RLS **enabled by default** (`ENABLE ROW LEVEL SECURITY`), with explicit per-operation policies — no table is ever left with an implicit allow. Pattern used throughout:

```sql
-- Example: workout_logs
alter table workout_logs enable row level security;

create policy "clients read own workout logs"
  on workout_logs for select
  using (auth.uid() = profile_id);

create policy "trainers read assigned clients' logs"
  on workout_logs for select
  using (
    exists (
      select 1 from trainer_clients tc
      where tc.client_id = workout_logs.profile_id
        and tc.trainer_id = auth.uid()
        and tc.status = 'active'
    )
  );

create policy "admins full access"
  on workout_logs for all
  using ((auth.jwt() ->> 'role') = 'admin');
```

Financial tables (`subscriptions`, `payments`) are **read-only to clients** via RLS; all writes happen exclusively through Edge Functions using the Supabase service-role key after verifying a Stripe webhook signature — a compromised client JWT can never grant itself a subscription.

## 7.3 Data Protection

| Concern | Approach |
|---|---|
| Encryption in transit | TLS everywhere (Supabase, Cloudflare, Stripe, Vercel all enforce HTTPS by default); certificate pinning considered post-launch for mobile if threat model warrants it |
| Encryption at rest | Managed by Supabase (Postgres) and Cloudflare (R2) — both encrypt at rest by default |
| Sensitive content (progress photos, InBody scans) | Stored in **private** Storage/R2 buckets; served only via short-lived signed URLs generated per-request, never public buckets |
| PII minimization | Only collect what a feature needs (e.g. no full address unless a venue/shipping feature requires it) |
| Data export & deletion (GDPR/CCPA-style rights) | `admin`-triggerable Edge Function to export a user's full data as JSON, and a deletion flow that anonymizes rather than hard-deletes rows referenced by billing history (legal/financial retention), while hard-deleting personal content (photos, chat, posts) |
| Backups | Supabase automated daily backups + Point-in-Time Recovery (paid tier) once real user data exists |

## 7.4 Payment Security

- Stripe handles all card data — **no card numbers ever touch our servers** (PCI SAQ-A scope only).
- Stripe webhook endpoint verifies the `Stripe-Signature` header against the webhook signing secret before processing any event; unsigned/invalid requests are rejected with 400.
- Idempotency: every webhook event's `stripe_event_id` is recorded and checked before processing, since Stripe retries delivery.
- Mobile app-store billing compliance: subscriptions purchasable in-app on iOS/Android must go through Apple/Google IAP per store policy if we sell digital subscriptions from within the app binary; the plan is to route mobile purchases through StoreKit/Play Billing (via `react-native-iap` or Expo's in-app-purchase module) with Stripe used for the equivalent web checkout flow, and a server-side receipt-validation Edge Function reconciling both sources into the single `subscriptions` table so entitlement logic doesn't care which rail was used.

## 7.5 Video & Content Protection

- Exercise/program videos served via Cloudflare Stream with **signed playback URLs** scoped to a short TTL and (optionally) domain-restricted embedding, so video links can't be freely redistributed outside the app.
- Free-tier users get a restricted video catalog; entitlement is checked server-side (Edge Function issuing the signed URL checks the caller's active plan) — never gated purely by client-side UI, since that's trivially bypassed.

## 7.6 API & Application Security

- **Input validation**: every Edge Function validates its payload against the shared Zod schema before touching the database; malformed input never reaches business logic.
- **Rate limiting**: Upstash Redis token-bucket per-user (and per-IP for unauthenticated endpoints like signup) to blunt brute-force and API abuse, with tighter limits on AI endpoints (cost-sensitive).
- **CORS**: Edge Functions restrict allowed origins to the known web app domain(s); the mobile app calls via the Supabase SDK with its anon key + user JWT, not raw CORS browser requests.
- **SSRF/Injection**: all DB access goes through the Supabase client (parameterized) or PostgREST — no raw string-concatenated SQL anywhere in the codebase.
- **Dependency hygiene**: Dependabot (or Renovate) enabled on the repo; `pnpm audit` in CI fails the build on high/critical vulnerabilities.
- **Secrets**: all API keys (Stripe, Claude, Cloudflare, FCM) live in Vercel/EAS/Supabase encrypted secret stores, never committed; `.env.example` documents required keys with placeholder values only.

## 7.7 Admin & Trainer Accountability

- `admin_audit_log` records every admin mutation (user edits, trainer approval, coupon creation, refunds) with before/after state — required for dispute resolution and required by most SOC2-track compliance programs later.
- Trainer access to client data is scoped strictly to `trainer_clients` active assignments via RLS — a trainer cannot query another trainer's clients even via a crafted request, because the policy is enforced at the database, not the API layer.

## 7.8 Compliance Posture (v1 → future)

| Now (v1 launch) | Later (as the business scales) |
|---|---|
| GDPR/CCPA-style data export & deletion flows | Formal SOC 2 Type II audit once enterprise/gym-partner deals require it |
| Privacy Policy & Terms covering AI data usage (Claude processes user-provided fitness data) | Data Processing Agreements with each subprocessor (Supabase, Anthropic, Stripe, Cloudflare, Firebase) reviewed by counsel |
| Age gate (13+/16+ per region) at signup | Region-specific data residency if expanding to markets requiring it (e.g. EU hosting region in Supabase) |

## 7.9 Pre-Launch Security Checklist

- [ ] RLS enabled and policy-tested (positive **and** negative cases) on every table
- [ ] Stripe webhook signature verification + idempotency tested
- [ ] Signed URL TTLs verified for photos and video
- [ ] Rate limits configured on all public-facing Edge Functions
- [ ] Secrets rotated from any values used during development
- [ ] Dependabot/`pnpm audit` clean
- [ ] Third-party penetration test scheduled before/at public launch

Next: [Deployment Plan →](08-deployment-plan.md)
