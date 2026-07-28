# Edge Function: `create-checkout-session`

**Phase:** 1 · **Auth:** authenticated client (any role) · **Method:** POST

Creates a Stripe Checkout Session for the caller to purchase/upgrade a subscription plan.

## Request
```json
{ "planId": "uuid — subscription_plans.id" }
```
Validated against `packages/schemas/subscription.ts::createCheckoutSessionInput`.

## Behavior
1. Load `subscription_plans` row by `planId`; 404 (`PLAN_NOT_FOUND`) if missing/inactive.
2. Look up or create a Stripe Customer for `profiles.id` (store `stripe_customer_id` on first creation).
3. Create a Stripe Checkout Session (`mode: subscription`, `price: plan.stripe_price_id`), success/cancel URLs point back into the app.
4. Return the checkout URL — do **not** write to `subscriptions` here; that happens only from the `stripe-webhook` function once Stripe confirms payment.

## Response
```json
{ "data": { "checkoutUrl": "https://checkout.stripe.com/c/pay/..." }, "error": null }
```

## Errors
| Code | Meaning |
|---|---|
| `PLAN_NOT_FOUND` | `planId` doesn't exist or is inactive |
| `ALREADY_SUBSCRIBED` | Caller already has an active subscription (should upgrade via `create-billing-portal-session` instead) |

Not yet implemented — this file documents the contract only.
