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
- **Attendance Check-in** (`CheckInMemberUseCase`) — one-tap check-in via
  the `check_in_member()` RPC, which enforces the one real business rule
  (a member must have an active, unexpired membership to check in) and
  writes to `check_ins`, an append-only attendance log (no update/delete
  RLS, same principle as `membership_payments`). Reached from a member's
  search result or their detail screen.
- **Member Photo** (`UploadMemberPhotoUseCase`) — uploads an already-read
  image (camera or gallery, cropped and compressed on the mobile side) to
  the private `member-photos` Supabase Storage bucket and returns a
  long-lived signed URL, which the registration form then passes to
  `register_membership()` to store on the member. RLS on
  `storage.objects` scopes uploads to `reception`/`branch_manager`/
  `super_admin`.
- **Member QR Identity** — every member gets a permanent, unique
  `qr_code` (a separate, revocable token, not their row `id`) the moment
  they're registered, returned by `register_membership()` and rendered
  client-side (no QR image is stored — just the value it encodes). This
  is what the future Check-In system will scan.

## What's planned next

- A `Member`/`Membership` domain entity once there's real behavior to model
  beyond what the database already enforces via constraints — the current
  use cases are thin validate-then-delegate layers, matching
  `packages/identity/application/sign-up.ts`'s pattern, not because an
  entity was avoided but because nothing here yet needs one.
