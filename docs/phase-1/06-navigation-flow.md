# 6. Navigation Flow (Phase 1)

## 6.1 Mobile — Expo Router Tree

File-based routing; groups in parentheses don't appear in the URL/segment. Matches the screen list in [05-screen-list.md](05-screen-list.md).

```
app/
├── index.tsx                       # splash — redirects based on session + onboarding_completed_at
├── (auth)/
│   ├── sign-up.tsx
│   ├── log-in.tsx
│   └── onboarding/
│       ├── goal.tsx → experience.tsx → equipment.tsx → metrics.tsx → plan.tsx
├── (tabs)/                          # bottom tab bar, only reachable once authenticated + onboarded
│   ├── index.tsx                    # Home
│   ├── train.tsx                    # Program/exercise browse
│   ├── nutrition.tsx
│   ├── progress.tsx
│   └── profile.tsx
├── program/[id].tsx                 # pushed from Train tab
├── workout/[id]/
│   ├── index.tsx                    # Workout Player
│   └── summary.tsx                  # pushed on completion, not back-navigable to player
├── nutrition/add-food.tsx           # modal, pushed from Nutrition tab
├── progress/add-photo.tsx           # modal, pushed from Progress tab
├── habits/index.tsx                 # pushed from Home's habit card
└── profile/
    ├── subscription.tsx
    └── notifications.tsx
```

**Guarding rule:** a single root layout (`app/_layout.tsx`, config only at this stage) checks session + `profiles.onboarding_completed_at` and redirects: no session → `(auth)`; session but onboarding incomplete → `(auth)/onboarding/*`; both present → `(tabs)`. No screen re-implements this check individually.

## 6.2 Admin Web — Next.js App Router Tree

```
app/
├── (auth)/log-in/page.tsx
├── (admin)/
│   ├── layout.tsx                   # role guard: redirects non-admins
│   ├── users/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   ├── programs/
│   │   ├── page.tsx
│   │   ├── [id]/page.tsx
│   │   └── exercises/
│   │       ├── page.tsx
│   │       └── [id]/page.tsx
│   ├── nutrition/page.tsx
│   └── subscriptions/page.tsx
└── middleware.ts                    # fast-path redirect before layout even renders
```

Role protection is layered (per [`docs/05-api-architecture.md §5.2`](../05-api-architecture.md#52-auth-flow)): `middleware.ts` redirects unauthenticated/wrong-role requests before any Server Component runs, and RLS enforces the same boundary at the database in case a request ever reaches a query directly.

## 6.3 Key Journey — Onboarding → First Workout

```mermaid
flowchart LR
    A[Splash] --> B{Session?}
    B -->|no| C[Sign up / Log in]
    B -->|yes, onboarded| H[Home]
    B -->|yes, not onboarded| D
    C --> D[Onboarding: Goal]
    D --> E[Experience]
    E --> F[Equipment]
    F --> G[Body metrics]
    G --> P[Plan match]
    P -->|Free| H
    P -->|Plus/Elite| CO[create-checkout-session → Stripe Checkout]
    CO --> H
    H --> TR[Train tab]
    TR --> PD[Program detail]
    PD --> WP[Workout Player]
    WP --> WS[Workout Summary — set logging]
    WS --> H
```

## 6.4 Key Journey — Daily Tracking Loop

```mermaid
flowchart LR
    H[Home] --> HB[Habits screen]
    H -->|quick-log water chip| H
    H --> PR[Progress tab]
    PR --> AP[Add progress photo]
    PR --> WL[Log weight / body-fat]
    H --> NU[Nutrition tab]
    NU --> AF[Add food to meal]
```

## 6.5 Key Journey — Subscription Management

```mermaid
flowchart LR
    PF[Profile tab] --> MS[Manage subscription]
    MS --> BP[create-billing-portal-session]
    BP --> SP[Stripe Customer Portal — external]
    SP -->|webhook| SW[stripe-webhook updates subscriptions]
    SW -.->|Realtime/refetch| PF
```

## 6.6 Key Journey — Admin Operates Content (Phase 1 scope)

```mermaid
flowchart LR
    L[Admin log-in] --> U[Users]
    L --> PG[Programs list]
    PG --> PE[Program editor]
    PE --> EX[Exercise library]
    EX --> EE[Exercise editor]
    EE --> VU[video-upload-url → Cloudflare Stream]
    VU -->|webhook| CW[cloudflare-stream-webhook marks video ready]
```

Next: [Component Architecture →](07-component-architecture.md)
