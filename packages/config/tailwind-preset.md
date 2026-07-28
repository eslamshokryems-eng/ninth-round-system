# `tailwind-preset` (planned)

**Phase:** 1 (implementation task, not yet written)

Will export a shared Tailwind theme preset (colors, radii, type scale) consumed by:
- `apps/mobile` via NativeWind
- `apps/web` via Tailwind CSS + shadcn/ui

Source of truth for the values it will encode: `docs/06-ui-flow-and-wireframes.md §6.1` (design tokens: `--color-background #0B0B0C`, `--color-gold #C9A227`, etc.) and `packages/ui/tokens`.

Not implemented yet — no application/design code has been written, per the "no application code" constraint for this phase.
