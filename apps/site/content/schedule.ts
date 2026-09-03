/**
 * ============================================================
 * Schedule — coached sessions and training groups
 * ============================================================
 * The 9-round circuit itself has NO timetable (that is the format), so
 * this file only describes the things that DO run at a set time.
 *
 * Same rule as the rest of the site: nothing here is invented. Both
 * arrays ship EMPTY, and `/schedule` renders an honest "message us for
 * this week's times" state until 9th Round confirms the current
 * timetable. Session times drift with holidays and events, and a stale
 * time on a public page costs a lead a wasted trip.
 *
 * TO PUBLISH: add entries below. Everything renders automatically —
 * no page edits needed. Example (delete the comment, keep the shape):
 *
 *   {
 *     name:   { en: "Kenpo", ar: "كينبو" },
 *     day:    { en: "Sunday", ar: "الأحد" },
 *     time:   "20:00",
 *     coach:  { en: "C. Eslam Shokry", ar: "كابتن إسلام شكري" },
 *     note:   { en: "All levels", ar: "كل المستويات" },
 *     badge:  "free-first",
 *     programSlug: "kickboxing",
 *   }
 */

import type { Lang, Localized } from "./i18n/config";

/** Optional highlight chip on a session card. */
export type SessionBadge = "free-first" | "all-ages" | "women" | "juniors";

export interface Session {
  name: Localized;
  day: Localized;
  /** 24-hour clock, "HH:MM". Rendered in the visitor's locale. */
  time: string;
  coach?: Localized;
  note?: Localized;
  badge?: SessionBadge;
  /** Links the card to a program page, when one matches. */
  programSlug?: string;
}

export interface TrainingGroup {
  label: Localized;
  /** 24-hour clock, "HH:MM". */
  time: string;
  note: Localized;
}

/** Fixed-time coached sessions. EMPTY until the club confirms current times. */
export const SESSIONS: Session[] = [];

/** Recurring training groups people can ask to join. */
export const GROUPS: TrainingGroup[] = [
  {
    label: { en: "Morning group", ar: "جروب الصبح" },
    time: "10:00",
    note: {
      en: "Forms when enough members want the morning slot. Tell us and we add you to the list.",
      ar: "بيتكوّن لما يبقى فيه عدد كفاية عايز ميعاد الصبح. قولنا ونضيفك على اللستة.",
    },
  },
  {
    label: { en: "Evening group", ar: "جروب المسا" },
    time: "19:00",
    note: {
      en: "The busiest slot — say the word and we will confirm your place in the next group.",
      ar: "أزحم ميعاد — قولنا وهنأكدلك مكانك في الجروب الجاي.",
    },
  },
];

export const SESSION_BADGE_LABELS: Record<SessionBadge, Localized> = {
  "free-first": { en: "First session free", ar: "أول سيشن مجاناً" },
  "all-ages": { en: "All ages", ar: "كل الأعمار" },
  women: { en: "Women", ar: "للستات" },
  juniors: { en: "Juniors", ar: "ناشئين" },
};

/**
 * Formats "20:00" for display. Arabic pages read a 12-hour clock with
 * Arabic period words; English keeps the familiar 8:00 PM.
 */
export function formatTime(time: string, lang: Lang): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = mStr ?? "00";
  if (Number.isNaN(h)) return time;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  if (lang === "ar") {
    const period = h < 12 ? "صباحاً" : h < 17 ? "بعد الضهر" : "مساءً";
    return `${h12}:${m} ${period}`;
  }
  return `${h12}:${m} ${h < 12 ? "AM" : "PM"}`;
}
