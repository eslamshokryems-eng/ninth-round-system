# @9thround/reception

The Reception & Membership System bounded context — see
[`docs/phase-1/14-reception-membership.md`](../../docs/phase-1/14-reception-membership.md)
for the full design (role model v2, the `members`/`memberships`/
`membership_payments`/`membership_alerts` schema, and the members-vs-profiles
split).

## What's implemented

- **Reception Dashboard** (`GetDashboardStatsUseCase`) — the seven headline
  numbers (active members, new today, expiring today/this week, expired,
  daily/monthly revenue), backed by the `reception_dashboard_stats` SQL view.

## What's planned next

- Member CRUD: `CreateMemberUseCase`, `UpdateMemberUseCase`,
  `SearchMembersUseCase` (by name/phone/member code).
- Membership + payment use cases: `CreateMembershipUseCase`,
  `RecordPaymentUseCase`, `RenewMembershipUseCase` (one-click renewal —
  computes the new period from the membership type, closes out the old
  `active` row, inserts the new one, and records the payment atomically).
- A `Member` domain entity once there's real behavior to model (validation
  rules, renewal calculations) — the Dashboard slice has none, so it isn't
  invented speculatively; see `domain/dashboard-stats.ts`'s comment for why
  that one stays a plain read-model type instead.
