# packages/ui

**Phase:** 1 — `tokens/` and `native/` implemented; `web/` not yet

Shared design tokens (color, spacing, type scale) plus NativeWind (mobile) and shadcn/ui-based (web) primitives, so both apps render the same black/white/gold system from one source. See docs/phase-1/07-component-architecture.md.

- `tokens/` — real color/spacing/radius/type-scale values, the single source of truth `apps/mobile/tailwind.config.js` mirrors (Tailwind configs must be statically requireable, so they can't import this module directly — kept in sync by hand, flagged in code comments on both sides).
- `native/` — `Text`, `Button`, `TextField`, `Card`, `ScreenContainer`, `ProgressDots`, `OptionCard`, `Divider`, `IconButton`/`BackButton`. RTL-aware via logical spacing utilities (`ms-`/`me-`/`ps-`/`pe-`) and an explicit `mirrorInRtl` prop on directional icons — see docs/11-internationalization.md §11.5.
- `web/` — not started; the admin/trainer web app has no screens yet.
