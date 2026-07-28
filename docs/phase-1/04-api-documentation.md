# 4. API Documentation (Phase 1)

Two surfaces, per [`docs/05-api-architecture.md`](../05-api-architecture.md): direct PostgREST access (RLS-protected, via `packages/api-client`) for CRUD, and Edge Functions for anything touching Stripe/Cloudflare/FCM or requiring the service-role key. Phase 1 ships 6 Edge Functions; the AI and community/QR/referral functions remain contract-only stubs (see their `README.md` in `supabase/functions/`) until their phase.

## 4.1 PostgREST Surface — Table Access Summary

All access goes through `packages/api-client`, never a raw Supabase client call inside a feature — this is the one place that can change if the backend ever moves.

| Table | Client can | Trainer can (additional) | Notes |
|---|---|---|---|
| `profiles` | read/update own | read assigned clients' | role/onboarding fields |
| `trainer_profiles` | read approved | update own | admin approves via `is_approved` |
| `subscription_plans` | read active | — | catalog for the paywall screen |
| `subscriptions`, `payments` | read own | — | **read-only**; written by `stripe-webhook` |
| `exercise_categories`, `exercises` | read all | insert/update own-created | library browse + filters |
| `programs`, `program_weeks`, `workouts`, `workout_exercises` | read published | insert/update own-created | program detail + workout player data |
| `user_programs` | read/insert/update own | read assigned clients' | "my active program" |
| `workout_logs`, `exercise_set_logs` | full CRUD own | read assigned clients' | workout completion + set logging |
| `habits`, `habit_logs`, `water_logs`, `weight_logs`, `body_composition_logs`, `progress_photos` | full CRUD own | read assigned clients' (except habits) | daily tracking screens |
| `nutrition_plans`, `meals`, `meal_food_items` | read own | insert/update (trainer/admin) | nutrition tab |
| `food_items` | read all, insert (unverified) | — | quick-add food search |
| `notifications` | read own, mark read | — | in-app notification center |
| `push_tokens` | full CRUD own | — | registered on login/permission grant |

## 4.2 Edge Function Catalog — Phase 1

| Function | Method | Auth | One-line contract |
|---|---|---|---|
| `create-checkout-session` | POST | client JWT | `{ planId }` → `{ checkoutUrl }` |
| `create-billing-portal-session` | POST | client JWT | `{}` → `{ portalUrl }` |
| `stripe-webhook` | POST | Stripe signature | Syncs `subscriptions`/`payments` from Stripe events |
| `video-upload-url` | POST | trainer/admin JWT | `{ exerciseId? }` → `{ uploadUrl, streamVideoId }` |
| `cloudflare-stream-webhook` | POST | Cloudflare signature | Flips `exercises.video_status` to `ready`/`failed` |
| `notifications-send` | POST | service role (internal) | `{ profileIds[], type, title, body, data }` → fan-out push |

Full request/response schemas and error codes for each live next to the code: `supabase/functions/<name>/README.md`. That is the authoritative contract each function's future implementation must satisfy — the schemas there are drawn from [`docs/05-api-architecture.md §5.4–5.5`](../05-api-architecture.md#54-edge-function-catalog).

## 4.3 Response Envelope (unchanged from whole-product spec)

```ts
{ "data": { ... }, "error": null }
{ "data": null, "error": { "code": "PLAN_NOT_FOUND", "message": "..." } }
```

## 4.4 Example: `packages/api-client` Query Shape (planned interface, not yet implemented)

Documented here so mobile/web feature code and the Edge Function contracts agree on shape before either is written:

```ts
// packages/api-client/queries/workouts.ts (planned)
export function useTodaysWorkout(profileId: string) {
  return useQuery({
    queryKey: queryKeys.workouts.today(profileId),
    queryFn: () => supabase
      .from("user_programs")
      .select("*, programs(*, program_weeks(*, workouts(*, workout_exercises(*, exercises(*)))))")
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single(),
  });
}

// packages/api-client/mutations/checkout.ts (planned)
export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (input: CreateCheckoutSessionInput) =>
      supabase.functions.invoke("create-checkout-session", { body: input }),
  });
}
```

Query key conventions (`queryKeys.workouts.today(...)`) are specified in [State Management §8.3](08-state-management.md#83-tanstack-query-key-conventions).

## 4.5 Rate Limiting & Idempotency (Phase 1 endpoints)

| Function | Limit | Idempotency |
|---|---|---|
| `create-checkout-session` | 10/min/user | optional client `Idempotency-Key` header |
| `stripe-webhook` | n/a (Stripe-initiated) | `processed_stripe_events.stripe_event_id` |
| `video-upload-url` | 30/hour/trainer | n/a |
| `notifications-send` | internal only, no client-facing limit | batched, not per-user calls |

Full rationale: [`docs/05-api-architecture.md §5.8`](../05-api-architecture.md#58-rate-limiting--idempotency).

Next: [Screen List →](05-screen-list.md)
