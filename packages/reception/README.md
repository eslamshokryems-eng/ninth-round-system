# @9thround/reception

The Reception & Membership System bounded context — see
[`docs/phase-1/14-reception-membership.md`](../../docs/phase-1/14-reception-membership.md)
for the full design (role model v2, the `members`/`memberships`/
`membership_payments`/`membership_alerts`/`membership_types` schema, and the
members-vs-profiles split).

## What's implemented

- **Reception Dashboard** (`GetDashboardStatsUseCase`) — the seven headline
  numbers (active members, new today, expiring today/this week, expired,
  daily/monthly revenue), backed by the `reception_dashboard_stats` SQL view.
- **Membership Registration** (`RegisterMembershipUseCase`) — creates a
  member, their first membership, and its payment record together via the
  `register_membership()` RPC (atomic, RLS-enforced as the calling user, not
  a privilege escalation). Field-level rules (unique phone, unique receipt
  number, price ≥ 0) are enforced by the database and surfaced back through
  the repository's `Result`.
- **Membership Types** (`ListMembershipTypesUseCase`) — reads the
  configurable `membership_types` catalog (name/duration/price), not a
  fixed enum, so pricing/duration can change without a migration.
- **Member Search** (`SearchMembersUseCase`) — live lookup by name, phone,
  or member code (no mock data — a query under 2 characters returns empty
  rather than an unscoped scan).
- **Membership Renewal** (`RenewMembershipUseCase`) — one-click renewal via
  the `renew_membership()` RPC: closes out the member's current `active`
  row, inserts the new period (extending from the current end date if it
  hasn't lapsed yet, or from today otherwise), and records the payment,
  atomically. Reached from a member's search result.
- **Member Detail / Edit** (`GetMemberDetailUseCase`, `UpdateMemberUseCase`)
  — a member's full profile plus their complete membership history (every
  period, not just the current one search surfaces), and an edit form for
  the profile fields. Reached by tapping a member's search result.

## What's planned next

- A `Member`/`Membership` domain entity once there's real behavior to model
  beyond what the database already enforces via constraints — the current
  use cases are thin validate-then-delegate layers, matching
  `packages/identity/application/sign-up.ts`'s pattern, not because an
  entity was avoided but because nothing here yet needs one.
