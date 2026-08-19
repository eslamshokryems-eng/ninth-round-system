# 20. Mobile-Responsive App Shell

The Reception app's shell (`(reception)/layout.tsx` + `ReceptionSidebar`)
now adapts to phone-width screens instead of always rendering the
256px-wide desktop sidebar.

## What changed

- `ReceptionSidebar` takes a `variant: "desktop" | "drawer"` prop (default
  `"desktop"`). One component, one nav list, one role-filter
  (`navItemsForRole`) — no duplicated authorization logic between the two
  render modes.
  - `"desktop"`: `hidden lg:flex` — the original permanent sidebar,
    unchanged on screens ≥1024px.
  - `"drawer"`: fills its container, used as the mobile slide-out panel's
    content; takes an `onNavigate` callback so tapping a link closes the
    drawer.
- `(reception)/layout.tsx` adds, only below `lg:`:
  - A top bar with the 9th Round mark and a hamburger button
    (`aria-label="Open menu"`).
  - A slide-out drawer (`role="dialog" aria-modal="true"`) containing
    `<ReceptionSidebar variant="drawer" />`, closable via the backdrop
    (`aria-label="Dismiss navigation"` — deliberately distinct from the
    panel's own `"Close menu"` button so the two are never ambiguous to
    an accessibility tree or a test locator), a dedicated X button, or
    Escape. Also closes automatically on route change.
- `(reception)/hr/page.tsx`'s tab row (`Attendance`/`Schedule`/`Leave
  Requests`/`Payroll`/`Employees`) gets `overflow-x-auto` +
  `flex-shrink-0` on each tab, so five tabs on a narrow phone scroll
  within their own row instead of forcing the whole page wider.

## What didn't need changing

Every data table in the app (`members`, `expiring`, `staff`,
`audit-log`, `permissions`, HR's tabs, `receipts`) was already wrapped in
its own `overflow-x-auto` container, and the Dashboard/Add Member/other
forms already used responsive grid classes (`grid-cols-2 lg:grid-cols-4`,
`sm:grid-cols-2`, etc.). The only real gap was the shell itself always
rendering the desktop sidebar at full width with no mobile alternative,
plus the one un-wrapped tab row above.

## Verification

Checked with Playwright at 375×667 across all 13 top-level pages (no
horizontal overflow on any of them) and manually confirmed the drawer's
open/close/Escape/backdrop/nav-link behavior and role-based nav
visibility. No production Supabase project is reachable from this
environment, so verification ran against a throwaway local build with
fake auth state — not a substitute for checking on a real phone before
relying on it in the club.
