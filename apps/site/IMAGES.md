# Images — what's used, what's still missing

## Already in place

- `public/brand/logo-lockup-dark.png` — full logo lockup (icon + "9TH ROUND" + "Kenpo & Fitness"), bone/red colors, transparent background. Used in the site header and footer. Composited from two of the provided logo files (colors from the black-canvas version, alpha mask from the transparent version) since no ready-made transparent dark-mode lockup was supplied.
- `public/brand/logo-lockup-light.png` — same lockup, black/red colors, transparent background. Not currently used anywhere (no light-background section needs it yet); kept in case one is added later.
- `public/brand/logo-mark-red.png` — icon-only mark, red/bone, transparent background. Used as the site favicon.
- `public/brand/logo-mark-black.png` — icon-only mark, black, transparent background. Not currently used; kept alongside the red mark in case a light-background spot needs it.
- `public/gym/gym-floor-wide.jpg` — hero background (homepage).
- `public/gym/gym-floor-angle.jpg` — available, not yet placed on a page.
- `public/gym/gym-ring.jpg` — used as the "Your First Session Is Free" trial-CTA background.
- `public/gym/gym-ring-corner.jpg` — available, not yet placed on a page.
- `public/gym/gym-ring-detail.jpg` — available, not yet placed on a page.

## Still needed

- **Coach photos (3, one per coach)** — currently `photoUrl: null` in `src/data/coaches.ts` for:
  - Coach Amr Habish (Boxing)
  - Coach Mohamed Abdelhamid (MMA & Kickboxing)
  - Coach Karim El-Badry (Strength & Conditioning)

  Every coach card (homepage preview + `/coaches` page) currently renders an empty grey circle placeholder instead of a photo. Needs explicit confirmation that we have permission to publish each coach's photo, per the brand brief's rule against publishing photos of real people without confirmed permission.

  Suggested format once ready: square or portrait crop, at least 800×800px, JPG or WebP.

## Open question, not an image gap

- FIT PRO package pricing (1/3/6 months) is `null` in `src/data/packages.ts` and renders as "TBC" — this was left blank in the original brief, not an image issue, just flagging it alongside the coach photos since both are the two known content gaps in this batch.
