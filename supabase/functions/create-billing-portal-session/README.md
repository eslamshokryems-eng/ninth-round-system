# Edge Function: `create-billing-portal-session`

**Phase:** 1 · **Auth:** authenticated client · **Method:** POST

Returns a Stripe Customer Portal URL so a subscribed user can update payment method, change plan, or cancel — self-serve, no custom UI needed.

## Request
`{}` (caller identified via JWT).

## Response
```json
{ "data": { "portalUrl": "https://billing.stripe.com/session/..." }, "error": null }
```

## Errors
| Code | Meaning |
|---|---|
| `NO_STRIPE_CUSTOMER` | Caller has never checked out; nothing to manage |

Not yet implemented — this file documents the contract only.
