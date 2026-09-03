/**
 * ============================================================
 * Events — in-house competitions and community challenges
 * ============================================================
 * 9th Round events run on the club's own language: nine stations, a
 * clock, a scorecard, a leaderboard. This file holds the dated ones.
 *
 * Ships EMPTY on purpose. A public page announcing an event whose date
 * later moves is worse than no page — `/events` explains the format
 * (which never changes) and collects interest, and starts listing dates
 * the moment 9th Round confirms them.
 *
 * TO PUBLISH: add an entry. The page picks up dates, sorts them, and
 * moves anything in the past into "Past events" on its own.
 *
 *   {
 *     slug: "ramadan-challenge",
 *     name: { en: "Ramadan Challenge", ar: "تحدي رمضان" },
 *     date: "2026-03-20",
 *     summary: { en: "...", ar: "..." },
 *     format: { en: "9 stations, scored", ar: "٩ محطات بنقاط" },
 *     openTo: "members",
 *   }
 */

import type { Localized } from "./i18n/config";

export type EventAudience = "members" | "open" | "juniors";

export interface ClubEvent {
  slug: string;
  name: Localized;
  /** ISO date, "YYYY-MM-DD". */
  date: string;
  /** 24-hour "HH:MM", when confirmed. */
  time?: string;
  summary: Localized;
  format?: Localized;
  openTo: EventAudience;
  /** Real photo in /public/events, once one exists. */
  image?: string;
}

export const EVENTS: ClubEvent[] = [];

export const AUDIENCE_LABELS: Record<EventAudience, Localized> = {
  members: { en: "Members", ar: "للأعضاء" },
  open: { en: "Open to guests", ar: "مفتوح للضيوف" },
  juniors: { en: "Juniors", ar: "ناشئين" },
};

/** Upcoming first, soonest at the top. */
export function upcomingEvents(now = new Date()): ClubEvent[] {
  const today = now.toISOString().slice(0, 10);
  return EVENTS.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

/** Most recent first. */
export function pastEvents(now = new Date()): ClubEvent[] {
  const today = now.toISOString().slice(0, 10);
  return EVENTS.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
}

/** Locale-aware long date, e.g. "20 March 2026" / "٢٠ مارس ٢٠٢٦". */
export function formatEventDate(iso: string, lang: "ar" | "en"): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
