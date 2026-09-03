# Images — what's used, what's still missing

## Already in place

- `public/emblem-red.png` — logo/emblem used in the site header (existing asset, unchanged).
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
