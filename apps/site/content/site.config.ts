/**
 * ============================================================
 * 9th Round Egypt — public site content configuration
 * ============================================================
 * The SINGLE place to edit business facts shown on the website.
 *
 * RULE: nothing in here is invented. Every value marked `null` or `TODO`
 * is a real fact 9th Round must confirm before it can be published. The
 * UI is built to hide or clearly flag any section whose data is missing —
 * it never shows a fake address, price, phone number, or testimonial.
 *
 * Verified values are drawn from 9th Round's own project documents
 * (operational guide, investor deck) and the internal system's data.
 */

export type ConfirmedString = string | null;

export const site = {
  name: "9th Round",
  legalName: "9th Round Egypt",
  domain: "https://9throundegypt.com",
  locale: "en",
  /** Positioning line — from the 9th Round brand system. */
  tagline: "No classes. No waiting. Just action.",
  shortDescription:
    "A structured combat-fitness experience in Egypt — boxing, kickboxing and conditioning across 9 rounds in 30 minutes, with a coach on the floor every round.",

  /**
   * CONTACT — every field here must be confirmed by 9th Round before launch.
   * Until a value is set, the related UI is hidden (not faked).
   */
  contact: {
    /** e.g. "20xxxxxxxxxx" (digits only, no "+"). Also set NEXT_PUBLIC_PHONE_NUMBER. */
    phone: null as ConfirmedString,
    /** e.g. "20xxxxxxxxxx". Also set NEXT_PUBLIC_WHATSAPP_NUMBER. */
    whatsapp: null as ConfirmedString,
    email: null as ConfirmedString,
    /** Full street address, one line. */
    addressLine: null as ConfirmedString,
    city: null as ConfirmedString,
    /** Google Maps place URL (share link). */
    mapsUrl: null as ConfirmedString,
    /** For LocalBusiness structured data — only emitted when BOTH are set. */
    geo: { lat: null as number | null, lng: null as number | null },
    /**
     * Opening hours. Each entry: [day, "HH:MM-HH:MM" | "closed"].
     * Empty array => the hours block is hidden.
     */
    openingHours: [] as Array<{ day: string; hours: string }>,
  },

  /**
   * SOCIAL — list ONLY profiles that actually exist. Empty => not shown,
   * and not emitted in Organization.sameAs.
   */
  social: {
    instagram: null as ConfirmedString,
    facebook: null as ConfirmedString,
    tiktok: null as ConfirmedString,
    youtube: null as ConfirmedString,
  },

  /**
   * MEMBERSHIPS — pricing is intentionally NOT published by default.
   * A membership price sheet exists in 9th Round's files but is unverified
   * and possibly outdated, so the site shows "contact us" until 9th Round
   * signs off on a current list. To publish prices later: set
   * `showPrices: true` and fill `plans[].price`.
   */
  memberships: {
    showPrices: false,
    contactCta: "Contact us for current membership options",
    /** Plan NAMES are from the internal system's membership_types table. */
    plans: [
      { name: "One Month", note: "Full access to the 9-round circuit", price: null as ConfirmedString },
      { name: "Three Months", note: "Best for building a real training habit", price: null as ConfirmedString },
      { name: "Six Months", note: "Commit to a full training phase", price: null as ConfirmedString },
      { name: "Annual", note: "The full year-long progression", price: null as ConfirmedString },
      { name: "Personal Training", note: "1-to-1 coaching, goal-based programming", price: null as ConfirmedString },
    ],
  },

  /**
   * COACHES — real people only. Add entries when 9th Round supplies a
   * name, photo, specialty and experience for each. Empty array => the
   * Coaches page shows an honest "profiles coming soon" state.
   *
   * Head coach is verified from project documents.
   */
  coaches: [
    {
      name: "Captain Eslam Shokry",
      role: "Founder & Head Coach",
      // Verified: investor deck / operational guide.
      credentials: ["Master's in Physical Education", "ISSA Certified Trainer"],
      specialties: ["Combat conditioning", "Boxing", "Programming"],
      photo: null as ConfirmedString, // TODO: professional photo
      bio:
        "Founder of 9th Round and the coach behind its 9-round system. Builds training that stays serious for experienced athletes while keeping the door open for complete beginners.",
    },
  ],

  /**
   * TESTIMONIALS — never fabricated. Empty => the section is not rendered.
   * Add { quote, name } only with the member's real words and consent.
   */
  testimonials: [] as Array<{ quote: string; name: string; context?: string }>,

  /**
   * GALLERY — real 9th Round facility media only. Each item points at a
   * file in /public/gallery. Empty => the gallery shows a labelled
   * "photography coming soon" placeholder, never stock imagery.
   */
  gallery: [] as Array<{ src: string; alt: string }>,

  /** Analytics event names — keep in sync with lib/analytics.ts. */
  analyticsEvents: {
    pageView: "page_view",
    clickWhatsapp: "click_whatsapp",
    clickCall: "click_call",
    bookTrial: "book_trial",
    leadCreated: "lead_created",
    membershipInquiry: "membership_inquiry",
  },
} as const;

/** True when we have enough to render the LocalBusiness schema honestly. */
export function hasLocalBusinessData(): boolean {
  const c = site.contact;
  return Boolean(c.addressLine && c.city && c.phone);
}

export function whatsappHref(message: string): string | null {
  const num = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || site.contact.whatsapp;
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

export function phoneHref(): string | null {
  const num = process.env.NEXT_PUBLIC_PHONE_NUMBER || site.contact.phone;
  if (!num) return null;
  return `tel:+${num}`;
}
