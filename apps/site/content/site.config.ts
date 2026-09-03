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
 *
 * BILINGUAL: any value a visitor reads is a `Localized` pair
 * (`{ en, ar }`). Anything that is not language-dependent — a phone
 * number, a price string, an image path, a URL — stays a plain value.
 */

import type { Lang, Localized } from "./i18n/config";

export type ConfirmedString = string | null;

export const site = {
  name: "9th Round",
  legalName: { en: "9th Round Egypt", ar: "9th Round إيجيبت" } as Localized,
  /**
   * Canonical origin, WITH `www`. The apex (`9throundegypt.com`) 308s to
   * the `www` host on Vercel, so canonical/hreflang/sitemap URLs must name
   * `www` directly — pointing them at a redirecting host is a self-inflicted
   * SEO defect. If the apex is ever made primary in Vercel instead, change
   * this and `NEXT_PUBLIC_SITE_URL` together.
   */
  domain: "https://www.9throundegypt.com",
  /** Positioning line — from the 9th Round brand system. */
  tagline: {
    en: "No classes. No waiting. Just action.",
    ar: "لا كلاسات. لا انتظار. أكشن بس.",
  } as Localized,
  shortDescription: {
    en: "A structured combat-fitness experience in Egypt — boxing, kickboxing and conditioning across 9 rounds in 30 minutes, with a coach on the floor every round.",
    ar: "تجربة لياقة قتالية منظّمة في مصر — بوكس وكيك بوكسينج ولياقة في تسع راوندات خلال تلاتين دقيقة، وكابتن معاك على الأرض كل راوند.",
  } as Localized,

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
    /** Full street address, one line, in both languages. */
    addressLine: null as Localized | null,
    city: null as Localized | null,
    /** Google Maps place URL (share link). */
    mapsUrl: null as ConfirmedString,
    /** For LocalBusiness structured data — only emitted when BOTH are set. */
    geo: { lat: null as number | null, lng: null as number | null },
    /**
     * Opening hours. `day` is localized; `hours` is a clock range
     * ("10:00-22:00") or the string "closed". Empty array => hidden.
     */
    openingHours: [] as Array<{ day: Localized; hours: string }>,
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
    contactCta: {
      en: "Contact us for current membership options",
      ar: "كلمنا تعرف خيارات الاشتراك الحالية",
    } as Localized,
    /** Plan NAMES mirror the internal system's membership_types table. */
    plans: [
      {
        name: { en: "One Month", ar: "شهر" } as Localized,
        note: { en: "Full access to the 9-round circuit", ar: "دخول كامل لدايرة التسع راوندات" } as Localized,
        price: null as ConfirmedString,
      },
      {
        name: { en: "Three Months", ar: "تلات شهور" } as Localized,
        note: { en: "Best for building a real training habit", ar: "الأنسب عشان تبني عادة تمرين حقيقية" } as Localized,
        price: null as ConfirmedString,
      },
      {
        name: { en: "Six Months", ar: "ست شهور" } as Localized,
        note: { en: "Commit to a full training phase", ar: "التزام بمرحلة تدريب كاملة" } as Localized,
        price: null as ConfirmedString,
      },
      {
        name: { en: "Annual", ar: "سنة" } as Localized,
        note: { en: "The full year-long progression", ar: "التدرّج الكامل على مدار سنة" } as Localized,
        price: null as ConfirmedString,
      },
      {
        name: { en: "Personal Training", ar: "تدريب شخصي" } as Localized,
        note: { en: "1-to-1 coaching, goal-based programming", ar: "تدريب واحد لواحد ببرنامج على هدفك" } as Localized,
        price: null as ConfirmedString,
      },
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
      name: { en: "Captain Eslam Shokry", ar: "كابتن إسلام شكري" } as Localized,
      role: { en: "Founder & Head Coach", ar: "المؤسس والمدرب الرئيسي" } as Localized,
      // Verified: investor deck / operational guide.
      credentials: [
        { en: "Master's in Physical Education", ar: "ماجستير تربية رياضية" } as Localized,
        { en: "ISSA Certified Trainer", ar: "مدرب معتمد ISSA" } as Localized,
      ],
      photo: null as ConfirmedString, // TODO: professional photo
      bio: {
        en: "Founder of 9th Round and the coach behind its 9-round system. Builds training that stays serious for experienced athletes while keeping the door open for complete beginners.",
        ar: "مؤسس 9th Round والكابتن اللي وراء نظام التسع راوندات. بيبني تدريب يفضل جدّي للاعبين المحترفين وفي نفس الوقت الباب مفتوح للمبتدئين تماماً.",
      } as Localized,
    },
  ],

  /**
   * TESTIMONIALS — never fabricated. Empty => the section is not rendered.
   * Add { quote, name } only with the member's real words and consent.
   * `quote` is stored in the language the member actually said it in.
   */
  testimonials: [] as Array<{ quote: Localized; name: string; context?: Localized }>,

  /**
   * GALLERY — real 9th Round facility media only. Each item points at a
   * file in /public/gallery. Empty => the gallery shows a labelled
   * "photography coming soon" placeholder, never stock imagery.
   */
  gallery: [] as Array<{ src: string; alt: Localized }>,

  /** Analytics event names — keep in sync with lib/analytics.ts. */
  analyticsEvents: {
    pageView: "page_view",
    clickWhatsapp: "click_whatsapp",
    clickCall: "click_call",
    bookTrial: "book_trial",
    leadCreated: "lead_created",
    membershipInquiry: "membership_inquiry",
  },
};

/** True when we have enough to render the LocalBusiness schema honestly. */
export function hasLocalBusinessData(): boolean {
  const c = site.contact;
  return Boolean(c.addressLine && c.city && (c.phone || process.env.NEXT_PUBLIC_PHONE_NUMBER));
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

/**
 * WhatsApp opening lines, in the visitor's language. A lead who clicks
 * from the Arabic site should arrive in the club's inbox writing Arabic —
 * that alone tells the sales team which language to answer in.
 */
export function whatsappMessages(lang: Lang): Record<"trial" | "memberships" | "kids" | "events" | "general", string> {
  if (lang === "ar") {
    return {
      trial: "السلام عليكم 9th Round — حابب أحجز سيشن تجربة.",
      memberships: "السلام عليكم 9th Round — حابب أعرف خيارات الاشتراك.",
      kids: "السلام عليكم 9th Round — بسأل عن برنامج الأطفال والناشئين.",
      events: "السلام عليكم 9th Round — حابب أعرف تفاصيل الفعالية الجاية.",
      general: "السلام عليكم 9th Round — عندي سؤال.",
    };
  }
  return {
    trial: `Hi ${site.name} — I'd like to book a free trial session.`,
    memberships: `Hi ${site.name} — I'd like to know the membership options.`,
    kids: `Hi ${site.name} — I'm asking about the kids / junior program.`,
    events: `Hi ${site.name} — I'd like details about the next event.`,
    general: `Hi ${site.name} — I have a question.`,
  };
}
