# 8. State Management (Phase 1)

## 8.1 The Rule: Server State vs. Client State Are Never Mixed

- **Server state** (anything that lives in Postgres) is owned exclusively by **TanStack Query**, accessed only through `packages/api-client` hooks. A feature never copies a query result into a Zustand store "to make it easier to access" — that's how server and client state drift out of sync.
- **Client/UI state** (things with no row in the database: current onboarding step, timer running/paused, active bottom-sheet, draft form values before submit) lives in **Zustand**, scoped per feature.

This mirrors the split already made in [`docs/02-technical-roadmap.md`](../02-technical-roadmap.md) and is the single biggest source of bugs in apps that get it wrong (stale copies of server data disagreeing with the real source).

## 8.2 Zustand Stores Needed for Phase 1

| Store | Location | Holds | Persisted? |
|---|---|---|---|
| `useAuthStore` | `apps/mobile/src/features/auth/store.ts` | current session, decoded role claim, `isHydrating` | yes — via SecureStore, see [Authentication Flow §9.4](09-authentication-flow.md#94-session-persistence) |
| `useOnboardingStore` | `apps/mobile/src/features/onboarding/store.ts` | in-progress goal/experience/equipment/metrics answers before they're persisted as a single onboarding-complete write | no — cleared on submit or app restart |
| `useWorkoutSessionStore` | `apps/mobile/src/features/workouts/store.ts` | current round, timer running/paused, elapsed seconds, logged sets accumulated during the active session | no — an in-progress workout is ephemeral UI state; only the finished `workout_logs`/`exercise_set_logs` rows persist, written once on completion |
| `useUiStore` | `apps/mobile/src/lib/store.ts` (shared) | active toast/sheet, network-offline banner | no |

Each store is a small, feature-scoped Zustand slice (`create<...>()`), not one monolithic global store — a feature can be deleted without touching an unrelated store, matching the vertical-slice folder structure in [`docs/03-folder-structure.md`](../03-folder-structure.md).

## 8.3 TanStack Query Key Conventions

A single typed key factory (`packages/api-client/queryKeys.ts`, planned) prevents ad-hoc string keys from drifting:

```ts
export const queryKeys = {
  profile: {
    detail: (id: string) => ["profile", id] as const,
  },
  workouts: {
    today: (profileId: string) => ["workouts", "today", profileId] as const,
    detail: (workoutId: string) => ["workouts", "detail", workoutId] as const,
    history: (profileId: string) => ["workouts", "history", profileId] as const,
  },
  nutrition: {
    plan: (profileId: string) => ["nutrition", "plan", profileId] as const,
  },
  progress: {
    weight: (profileId: string) => ["progress", "weight", profileId] as const,
    bodyComposition: (profileId: string) => ["progress", "body-comp", profileId] as const,
  },
  subscription: {
    mine: (profileId: string) => ["subscription", profileId] as const,
  },
} as const;
```

Rules:
- Every key starts with the domain noun, then gets more specific — never the reverse — so `queryClient.invalidateQueries({ queryKey: ["workouts"] })` can blanket-invalidate everything workout-related after a mutation.
- Mutations invalidate the narrowest key that's actually stale, not the whole domain, to avoid refetch storms (e.g. completing a workout invalidates `workouts.history` and `workouts.today`, not all of `["workouts"]`).

## 8.4 Optimistic Updates — Where They're Worth It

| Action | Optimistic? | Why |
|---|---|---|
| Logging a habit checkbox | Yes | Instant feedback expected; failure is rare and low-stakes (retry silently, toast on repeated failure) |
| Logging a water amount | Yes | Same |
| Completing a workout set | Yes, within the active session store (not a server round-trip per set) | Sets accumulate in `useWorkoutSessionStore` and are written to `exercise_set_logs` in one batch on workout completion, not one request per rep |
| Subscribing to a plan | No | Goes through Stripe Checkout — inherently not instant, has its own loading state |
| Uploading a progress photo | No (shows upload progress) | Large payload, user expects to see it "in flight" |

## 8.5 Persistence & Offline Behavior

- `useAuthStore` persists the Supabase session via Expo SecureStore so app relaunch doesn't force a re-login (see [Authentication Flow §9.4](09-authentication-flow.md#94-session-persistence)).
- TanStack Query's cache is configured with a `gcTime` long enough that recently viewed screens (today's workout, nutrition plan) render instantly from cache on flaky gym wifi while a background refetch runs — a fitness app used mid-workout cannot block on network round-trips for read-only data the user already saw seconds ago.
- Mutations made while offline are **not** queued for retry in Phase 1 (no offline mutation queue) — the UI surfaces a clear "You're offline" state instead. An offline mutation queue is a candidate Phase 5 hardening item if usage data shows it's needed, not a day-one requirement.

Next: [Authentication Flow →](09-authentication-flow.md)
