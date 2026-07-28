# Edge Function: `stripe-webhook`

**Phase:** 1 · **Auth:** Stripe signature (`Stripe-Signature` header) · **Method:** POST

Single entry point for all Stripe billing events. Public endpoint, protected by signature verification — never trust payload contents before verifying.

## Handled events
| Event | Effect |
|---|---|
| `checkout.session.completed` | Insert/update `subscriptions` row (status `active`), insert `payments` row |
| `invoice.payment_failed` | Set `subscriptions.status = 'past_due'`, trigger a dunning notification |
| `customer.subscription.updated` | Sync `status`, `current_period_end`, `cancel_at_period_end` |
| `customer.subscription.deleted` | Set `subscriptions.status = 'canceled'` |

## Idempotency
Every event's `id` (the Stripe event ID) is recorded in a `processed_stripe_events` table before side effects run; a redelivered event with a known ID is acknowledged (200) without reprocessing. See `docs/07-security-plan.md §7.4`.

## Response
Always `200 { received: true }` on successful (or already-processed) handling, so Stripe stops retrying; `400` only on signature verification failure.

Not yet implemented — this file documents the contract only.
