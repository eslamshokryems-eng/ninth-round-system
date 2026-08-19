# 21. Scan Check-In

A camera-based QR scanner at `/scan` for Reception/Branch Manager/Super
Admin: point the phone or webcam at a member's QR code (shown on their
own phone, or a physical card) and they're checked in immediately,
without searching by name first. A manual code-entry field is always
available underneath, for a torn/unreadable code or a camera that
couldn't be accessed.

## Why no migration

`members.qr_code` and `check_in_member()` (with its existing RLS —
reception/branch_manager/super_admin only, matching this page's own
guard) already existed from the original schema; nothing new needed
storing. This is a pure read (resolve a scanned code to a member) +
reuse of the existing check-in write path.

## Layers

- `MemberSearchRepository.findByQrCode(qrCode)` (new method) — a
  `members` lookup by `qr_code`, `.maybeSingle()`. To-many embeds
  (`memberships`) stay array-typed as before; nothing here is a to-one
  embed, so none of docs/phase-1/17's cast pattern applies.
- `CheckInByQrCodeUseCase` (new, `packages/reception/application`) —
  trims the scanned text (a scanner can add stray whitespace/newlines),
  rejects empty input as `INVALID_QR_CODE`, resolves the code via
  `findByQrCode`, 404s as `MEMBER_NOT_FOUND`, then calls the existing
  `CheckInRepository.checkIn()` and returns `{ memberId, fullName,
  checkInId, checkedInAt }`. Any error from the check-in step itself
  (e.g. `NO_ACTIVE_MEMBERSHIP`) passes through unchanged.
- `QrScanner` component (`apps/web/src/components/qr-scanner.tsx`) —
  `getUserMedia({ video: { facingMode: "environment" } })` for the rear
  camera, decoding each frame with the native `BarcodeDetector` API
  where available (zero extra JS, hardware-accelerated on
  Chrome/Edge/Android/Safari 17+) and falling back to `jsqr` (pure JS)
  where it isn't — notably older iOS Safari. Camera-denied/unavailable
  degrades to a message and the manual-entry field still works.
- `/scan` page — role-guards to reception/branch_manager/super_admin
  (same list as `check_in_member()`'s RLS; this is a UX guard, the
  database is the real one), pauses the scanner while a check-in is in
  flight so the same code can't double-fire, shows the checked-in
  member's name or a translated error, and a running "checked in this
  session" count.
- Sidebar: a new `CHECK_IN_NAV_ITEMS` tier, shown to every staff role
  except `sales_employee` (matching `check_in_member()`'s RLS exactly),
  inserted right after Dashboard as a fast daily action rather than
  buried at the bottom.

## Verification

Playwright-checked at 390×844 (phone) and 1440×900 (desktop) with a
simulated camera (`--use-fake-device-for-media-stream`): scanner UI
renders, no horizontal overflow, manual entry works end-to-end against a
fake backend (including the graceful "member not found" state), the nav
link shows/hides correctly by role, and a denied-camera permission falls
back cleanly to manual entry. Real QR decoding (native `BarcodeDetector`
and the `jsqr` fallback) has not been tested against an actual printed
or on-screen QR code in this environment — worth a real-phone check
before relying on it at the front desk.
