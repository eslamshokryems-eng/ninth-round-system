/**
 * ============================================================
 * Ad landing pages — /[lang]/go/[campaign]
 * ============================================================
 * These are NOT site pages. They are paid-traffic destinations, and they
 * are deliberately built to a different structure than the rest of the
 * site (9th Round brand system §24: HOOK → OFFER → TIME/LOCATION → CTA):
 *
 *   - no header, no nav, no footer links — nothing to click away with
 *   - one message, one form, one action
 *   - `noindex` — an ad landing page must never compete with /programs
 *     for the same query, and its copy is written for a cold audience
 *
 * Each campaign records its own `leadTag`, which is appended to the
 * lead's interest note so the Sales app can tell "came from the Facebook
 * boxing ad" apart from "found the website" — the difference between
 * cost-per-lead you can read and a number you cannot.
 *
 * Adding a campaign = adding an entry here. The route is generated.
 */

import type { Localized } from "./i18n/config";

export interface Campaign {
  /** URL segment: /ar/go/<slug>. Keep it short and readable in an ad. */
  slug: string;
  /** Appended to the lead note so the CRM can attribute the lead. */
  leadTag: string;
  /** Big opening line. One idea. Short enough to read at a glance. */
  headline: Localized;
  /** One supporting sentence. */
  sub: Localized;
  /** The offer, stated plainly. Shown as the highlight chip. */
  offer: Localized;
  /** Three proof points, maximum. More than three reads as noise. */
  points: { en: string[]; ar: string[] };
  /** Pre-selects the trial form's program. Must match a Program.trialValue. */
  program?: string;
}

export const CAMPAIGNS: Campaign[] = [
  {
    slug: "free-session",
    leadTag: "ad:free-session",
    headline: { en: "Your first session is free", ar: "أول سيشن ببلاش" },
    sub: {
      en: "Nine rounds. Thirty minutes. A coach on the floor with you the whole way.",
      ar: "تسع راوندات. تلاتين دقيقة. وكابتن معاك على الأرض من أول لآخر راوند.",
    },
    offer: { en: "First session free", ar: "أول سيشن مجاناً" },
    points: {
      en: [
        "No experience needed — beginners start here every week",
        "Boxing, kickboxing and conditioning in one session",
        "No class times — you start when you arrive",
      ],
      ar: [
        "مش محتاج خبرة — مبتدئين بيبدأوا هنا كل أسبوع",
        "بوكس وكيك بوكسينج ولياقة في سيشن واحدة",
        "مفيش مواعيد كلاسات — بتبدأ أول ما توصل",
      ],
    },
  },
  {
    slug: "boxing",
    leadTag: "ad:boxing",
    headline: { en: "Learn to actually box", ar: "اتعلم بوكس بجد" },
    sub: {
      en: "Stance, guard, combinations and bag work — taught by a coach, not copied off a screen.",
      ar: "وقفة وحماية وكومبينيشن وشغل شكاير — بيتعلّم من كابتن، مش تقليد من شاشة.",
    },
    offer: { en: "First boxing session free", ar: "أول سيشن بوكس مجاناً" },
    points: {
      en: [
        "Start from zero — the coach builds the technique with you",
        "Real heavy-bag work, not shadow boxing in a corner",
        "Track your progress with a monthly 30-second jab count",
      ],
      ar: [
        "ابدأ من الصفر — الكابتن بيبني التكنيك معاك",
        "شغل شكارة تقيلة حقيقي، مش ضرب في الهوا في ركن",
        "تابع تقدّمك بعدد اللكمات في 30 ثانية كل شهر",
      ],
    },
    program: "Boxing",
  },
  {
    slug: "kids",
    leadTag: "ad:kids",
    headline: { en: "Discipline they take home", ar: "انضباط بيرجع معاهم البيت" },
    sub: {
      en: "Coached combat-fitness for juniors — movement, confidence and effort in a supervised room.",
      ar: "لياقة قتالية للناشئين بإشراف كابتن — حركة وثقة ومجهود في مكان تحت إشراف كامل.",
    },
    offer: { en: "Free trial session", ar: "سيشن تجربة مجاناً" },
    points: {
      en: [
        "A coach with them for the whole session",
        "Movement skills, basic striking, coordination games",
        "Ask us about the current age groups and times",
      ],
      ar: ["كابتن معاهم طول السيشن", "مهارات حركة وأساسيات ضرب وألعاب تناسق", "اسألنا عن الفئات العمرية والمواعيد الحالية"],
    },
    program: "Kids / Junior",
  },
];

export const CAMPAIGN_SLUGS = CAMPAIGNS.map((c) => c.slug);

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.slug === slug);
}
