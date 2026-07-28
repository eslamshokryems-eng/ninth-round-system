# 11. Internationalization (Arabic + English, RTL/LTR)

9th Round ships bilingual from day one — this is not a "translate later" retrofit. Every screen, every piece of stored content, and every notification is designed against two locales from the first commit.

## 11.1 Scope

| Locale | Direction | Status |
|---|---|---|
| English (`en`) | LTR | Launch |
| Arabic (`ar`) | RTL | Launch |

`packages/i18n` is the single source of translation strings and locale utilities, consumed identically by `apps/mobile` and `apps/web` — one i18next resource bundle, not two separate translation systems (see [`docs/13-ddd-architecture.md`](13-ddd-architecture.md)).

## 11.2 Library Choice: i18next + react-i18next (both apps)

| Option considered | Verdict |
|---|---|
| **i18next + react-i18next (chosen)** | One library across mobile and web; resource files are plain JSON shared via `packages/i18n`; works client-side in both Expo and Next.js without needing server-only primitives |
| next-intl (web-only) | Would mean two different i18n systems for the two apps, and translation keys living in two places — rejected for exactly the reason `packages/i18n` exists |
| expo-localization alone | Only detects device locale/RTL; still need a translation library on top — used *alongside* i18next on mobile, not instead of it |

## 11.3 Translatable Content: Database Strategy

User-facing library content (exercise names/descriptions, program names/descriptions, food item names) is stored as a `translated_text` Postgres domain — `jsonb` shaped `{"en": "...", "ar": "..."}`, with a check constraint requiring the `en` key (English is the mandatory fallback):

```sql
create domain translated_text as jsonb
  constraint translated_text_has_en check (value ? 'en');
```

See `supabase/migrations/20260801000004_training_content.sql`. This was chosen over parallel `name_en`/`name_ar` columns because:
- Adding a third language later is a **data** migration (fill in a new key), not a **schema** migration (add two more columns to every translatable table).
- `packages/shared-kernel`'s `translate(text, locale)` helper reads any locale with an English fallback in one place, rather than every query site branching on locale.

**Not translated at the DB level:** user-generated content (nutrition plan names a nutritionist types for one client, habit names a user creates) — that content exists in whichever language its author wrote it, like any real-world user input. Subscription plan tier names (Free/Plus/Elite) are treated as brand terms and kept in Latin script in both locales, consistent with how many bilingual apps handle product-tier naming — this is a deliberate call, not an oversight.

## 11.4 Search Across Locales

`pg_trgm` fuzzy-search indexes (`exercises`, `food_items`) are built on the English (`en`) key specifically (`(name ->> 'en')`), since trigram matching doesn't transfer across scripts. The client always sends its search term in the *current UI locale*; for Arabic-locale search, the mobile/web search feature additionally matches against the Arabic value directly (exact/prefix match) since a full Arabic-aware trigram index is a can-add-later scale item ([`docs/10-scalability-plan.md`](10-scalability-plan.md)), not a Phase 1 requirement given the size of the exercise/food libraries.

## 11.5 RTL Layout

- **Value object**: `isRtl(locale)` / `textDirection(locale)` in `packages/shared-kernel` — the one place "is this locale mirrored" is decided.
- **Mobile**: React Native's `I18nManager.forceRTL()` is set at app boot from the user's chosen locale (persisted before first render, so there's no layout flash); NativeWind/Flexbox's logical properties (`start`/`end` instead of `left`/`right`) are used throughout `packages/ui/native` so components mirror automatically instead of needing an RTL-specific variant per component. Icons that encode direction (back arrows, chevrons) are flipped via a single `mirrorInRtl` prop on the shared icon component, not per-screen conditionals.
- **Web**: the `<html dir="...">` attribute is set from the resolved locale (via Next.js middleware reading a locale cookie), and Tailwind's logical-property utilities (`ps-*`/`pe-*`, `text-start`/`text-end`) are used the same way as the mobile logical properties, so both apps follow one mental model for direction-aware layout.
- **Typography**: Arabic requires a font with proper Arabic glyph coverage and correct line-height for Arabic script (taller than Latin at the same point size) — the type scale in `packages/ui/tokens` reserves a locale-aware line-height multiplier rather than a single fixed value.

## 11.6 Locale Selection & Persistence

- Shown as the **first screen**, before sign-up (`docs/phase-1/06-navigation-flow.md`), since RTL must be set before any other UI renders — changing it after the fact requires a full app reload on mobile (`I18nManager.forceRTL` only takes effect after restart), so getting it right at first launch avoids a jarring mid-session reload.
- Stored on `profiles.preferred_locale` (see `supabase/migrations/20260801000002_profiles_and_trainers.sql`) so a signed-in user's locale follows them across devices, not just a local device setting.
- Changeable later from Profile/Settings; mobile shows a one-time "restart to apply" notice when switching between LTR and RTL locales.

## 11.7 Notifications & Transactional Content

Push notifications and emails are generated server-side (Edge Functions) in the recipient's `preferred_locale` — the `notifications-send` function (`supabase/functions/notifications-send/README.md`) reads the target profile's locale before composing `title`/`body`, using the same `packages/i18n` resource bundle Node-side (i18next runs server-side identically to client-side).

## 11.8 Testing

`packages/i18n/src/config.test.ts` enforces that the English and Arabic resource trees have **identical key sets** — a missing Arabic translation for a new English string fails CI immediately rather than shipping a screen that silently falls back to English for one label. This is a permanent gate, not a one-time check: every new UI string added to `en.json` must land with its `ar.json` counterpart in the same PR.

Next: [Roles & Permissions →](12-roles-and-permissions.md)
