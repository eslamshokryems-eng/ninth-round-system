# THE NINTH — Phase 4: Athlete + Registration + Race Number (report)

**Status:** complete and verified. Not built yet (Phase 5+): check-in, queue/slot binding, the race engine, judge/station apps, results.

## What was delivered

| Layer | Contents |
|---|---|
| Database (`20260929000002_race_registration.sql`) | Public + staff registration RPCs, category/age/gender/push-up rules, waiver + emergency contact, gapless race numbers, hashed athlete token, manual payments (state machine, idempotency), cancel/refund/waive, reception search, athlete self-service, public event page, planned heat-start projection |
| Package `@9thround/race` | Domain (race numbers, phone + eligibility rules mirrored from SQL), 10 use cases, Supabase repository, RPC typing |
| Web `/race/*` | Public: event page, registration form, athlete confirmation page (race number plate, heat, times, QR, push-up choice). Staff: sign-in, registrations console (search, confirm payment, waive, refund, cancel, register on behalf) |
| Theme | Scoped black · red · white race theme (`.race-root`); the gym app is untouched (asserted in the browser test) |

## Verification

| Check | Result |
|---|---|
| DB harness (`supabase/tests/race/run.sh`) | ✅ **443 assertions** + concurrency + rollback + gym-regression fingerprint |
| Package tests | ✅ 107 (incl. 38 shared TS↔SQL parity cases) |
| Whole repo | ✅ lint · typecheck 15/15 · all existing tests · `next build` |
| Browser test (`apps/web/scripts/race-e2e.mjs`) | ✅ 20/20 — real Chromium against the built app, Supabase mocked |
| Existing gym system | ✅ 1,611 objects unchanged; the only existing objects touched are the Phase 3 additions and the approved security fix |

### Race-condition tests (real parallel sessions, barrier-synchronised)
- 40 simultaneous submissions (person #1 submitted 11× at the same instant) → exactly 30 registrations, numbers **N001–N030, unique and gapless**, one athlete row for the duplicated person, the 10 losers get `RACE_ALREADY_REGISTERED`.
- 12 simultaneous "confirm payment" with one idempotency key → 12 identical answers, **1 PAID payment**. Without a key → exactly one succeeds, 11 get `RACE_ALREADY_PAID`.
- Pay-vs-cancel race → never a cancelled registration holding a paid payment.
- **Negative controls:** removing the per-person advisory lock makes the duplicate test fail (40 registrations, 10 duplicates). My first version of that test passed *without* the lock because process start-up staggered the sessions; the barrier fixed the test, and the test found a real bug in my first draft of the function.

## Rules implemented (source: the approved decisions + brief)
- Race number `N001…N9999`, per event, never reused (a cancelled registration keeps its number).
- Push-up style: the category default, or Knee (Men: Standard/Knee; Women & Masters: Knee). Locked once Station 02 starts.
- Masters 40+: age is computed on the **event date**, birthday-exact (exactly 40 on race day is eligible; the day before is not).
- Payments: PENDING / PAID / REFUNDED / CANCELLED, manual methods only (cash, InstaPay, Vodafone Cash, card POS, bank transfer). A registration is CONFIRMED only when paid, waived (Event Manager, reason required) or free. Paymob later = a provider value + webhook RPC; the `race_payment_events` ledger already exists.
- The athlete's link token is 256-bit, stored only as SHA-256, shown once, delivered in the URL **fragment** (never in server logs), never written to the audit log, page is `noindex` + `no-referrer`.
- Phone numbers are normalized (`+20`, `0020`, missing leading 0, Arabic-Indic and Persian digits) identically in SQL and TypeScript.

## Decisions I made that you did not specify (please confirm or change)
1. **Gender ↔ category:** Men requires male, Women requires female; Masters accepts any. Date of birth is required only for Masters.
2. **Push-up:** Women/Masters cannot choose Standard (the brief says "any athlete may choose Knee" but not the reverse).
3. **Emergency contact and waiver are mandatory.** The waiver text in the form is a **placeholder** — replace with legally approved wording before launch.
4. **One athlete = same normalized phone + same name (case-insensitive).** Two people sharing a phone (siblings) are allowed.
5. **A cancelled registration cannot be reactivated,** and the same person cannot re-register for the same event (they must ask the organizers).
6. **Refund/cancel are blocked once an athlete is checked in** (race-control withdrawal workflow instead, Phase 5+).
7. **Staff registration is blocked after heats are locked** (new athletes then need an authorized change).
8. **Only Event Managers waive/refund/cancel;** Reception confirms payments and registers athletes.

## Not done / needs your input
- **Heat assignment UI and rule.** Nothing says *how* athletes are placed into heats (registration order? by category? manager decides?). The database supports assignment and the audited move RPC; there is no heat screen yet. **Decision needed for Phase 5:** heat composition rule.
- **Unpaid athletes at heat lock:** do they keep their heat seat? Today they do (a manager can cancel to free it).
- **Abuse protection on the public form.** The form calls the database directly with the public key; there is **no rate limiting or CAPTCHA**. Before public launch add Turnstile/Upstash (env vars already exist in `.env.example`) at an edge route.
- **Display font:** the condensed brand face is not loaded (system condensed stack only; it renders as bold sans in screenshots). `apps/site` already loads Barlow Condensed; adding it here is a one-line change but needs network at build, so it was not done blind.
- **English only.** The race pages are not yet bilingual/RTL like the mobile app. Arabic *input* (digits) works.
- **No confirmation email/SMS.** The link is shown on screen (and printable); Resend is available for email later.
- **Browser test is manual** (mocked Supabase); the database harness runs in CI (`database` job — not yet run on GitHub, first PR run will confirm).
- Minimum athlete age is **not enforced** (only a 110-year sanity cap) — a legal/insurance question for the organizers.
