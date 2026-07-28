# 1. Product Roadmap

## 1.1 Vision

> Help people transform their lives using scientific fitness, boxing-inspired interval training, nutrition coaching, AI support, and habit tracking.

9th Round is not a workout-video app and not a generic PT-booking app. It sits between three categories and takes the best of each:

| Category | Example | What we take from it |
|---|---|---|
| Streaming fitness content | Peloton, iFIT | Premium production, structured programs, leaderboards |
| Human coaching marketplaces | Future, Trainerize | Real trainer relationship, check-ins, chat, adaptive plans |
| Habit / quantified-self apps | Fitbod, MyFitnessPal, Whoop | Daily tracking (water, weight, habits), streaks, data-driven insight |

The differentiator is the **"9 Round" training format**: boxing-inspired interval structure (round-based work/rest, e.g. 3-minute rounds with 1-minute rest, mirroring a boxing match) applied to general fitness, fat loss, and athletic conditioning — paired with an **AI Coach** that adapts the plan continuously instead of a static PDF program.

## 1.2 Target Personas

| Persona | Primary goal | Key features they need |
|---|---|---|
| **Beginner** | Not get overwhelmed, build a habit | Guided onboarding, exercise library with video demos, habit tracker |
| **Weight loss / fat burning** | See measurable progress | Weight/body-fat/InBody tracking, progress photos, nutrition plans, challenges |
| **Athlete / football player** | Sport-specific conditioning | 9-Round interval timer, performance stats, adaptive training plans |
| **Women** | Approachable, non-intimidating programming | Female-specific program tracks, community feed, body-composition tracking |
| **Home workout user** | No-equipment or minimal-equipment routines | Equipment filters in exercise library, home program tracks |
| **Gym member** | Structured programming to pair with gym access | Programs, workout calendar, QR check-in at partner gyms |
| **Online coaching client** | 1:1 relationship with a real trainer | Trainer profiles, chat with coach, trainer-assigned programs & check-ins |

## 1.3 Core Value Proposition

1. **Real trainers + AI**, not one or the other — trainers set direction and review progress; AI fills the gaps between sessions (motivation, quick Q&A, adaptive adjustments).
2. **One app for the whole journey** — training, nutrition, habits, body metrics, community, and payments in a single premium experience instead of five disconnected apps.
3. **Boxing-inspired identity** — the "9 Round Timer" and round-based training structure is a brand signature, not a generic rest timer.

## 1.4 Monetization Model

| Plan | Price tier | Includes |
|---|---|---|
| **Free** | $0 | Exercise library, 9-Round timer, basic habit/water tracking, community feed (read-only), 1 starter program |
| **Plus** (self-guided) | Monthly/annual subscription | Full program library, nutrition plans, AI Coach, challenges/leaderboard, unlimited habit & body tracking |
| **Elite** (coached) | Higher monthly/annual tier | Everything in Plus + assigned human trainer, chat with coach, custom program creation, priority support |
| **Trainer add-on** (B2B2C, later phase) | Revenue share / seat fee | Independent trainers pay to run their client base through the platform (trainer dashboard, client billing pass-through) |

Payments are processed via **Stripe Billing** (subscriptions, proration, dunning/failed-payment retries, coupons). Apple/Google in-app purchase requirements for mobile subscription sales are addressed in the [Deployment Plan](08-deployment-plan.md#mobile-store-billing-compliance).

## 1.5 Competitive Positioning

- **vs. Peloton/iFIT**: no hardware lock-in, price point accessible without equipment, human coaching included.
- **vs. Future/Trainerize**: better self-serve product for users not ready to pay for 1:1 coaching yet (Free/Plus tiers), so the funnel doesn't require a trainer conversation on day one.
- **vs. MyFitnessPal/Fitbod**: a brand and community, not just a logging tool — habit/water/weight tracking is a *feature* of 9th Round, not the whole product.

## 1.6 Release Themes (Now / Next / Later)

| Theme | Scope | Maps to phase |
|---|---|---|
| **Now — Foundation & MVP** | Auth (email/Google/Apple), profiles, exercise library, programs, workout logging, 9-Round & rest timers, habit/water/weight/body-fat/InBody tracking, progress photos, nutrition plans, subscriptions & payments, push notifications | Phase 1 |
| **Next — Engagement** | Challenges, achievements/badges, leaderboard, community feed, chat with coach, workout calendar & stats, referral program, QR check-in | Phase 2 |
| **Later — AI & Coaching depth** | AI Coach (chat), AI workout generator, AI nutrition suggestions, AI progress analysis, adaptive training plans, trainer dashboard (assign clients, review check-ins), admin dashboard (full ops) | Phase 3–4 |
| **Scale** | Performance, cost optimization, internationalization, advanced analytics, trainer marketplace | Phase 5 |

Full breakdown with timelines and exit criteria: [Development Phases](09-development-phases.md).

## 1.7 Success Metrics (KPIs)

| Category | Metric | Why it matters |
|---|---|---|
| Acquisition | CAC, install → signup conversion | Funnel health |
| Activation | % completing onboarding + first workout in 7 days | Predicts retention |
| Engagement | DAU/MAU, workouts/week/user, streak length | Core habit-loop health |
| Retention | D1/D7/D30 retention, monthly logo/subscription churn | SaaS viability |
| Monetization | MRR, ARPU, LTV, free→paid conversion rate | Revenue health |
| Coaching quality | Trainer response time, client check-in completion rate | Elite tier retention driver |
| Platform health | Crash-free sessions, API p95 latency, support ticket volume | Operational quality |

## 1.8 Non-Goals (explicitly out of scope for v1)

- Live 1:1 video calls between trainer and client (chat + async check-ins only for v1).
- Wearable device integrations (Apple Health / Whoop / Garmin sync) — planned as a post-launch integration, not v1.
- Marketplace for third-party trainers to self-onboard without vetting — v1 trainers are onboarded by 9th Round directly.
