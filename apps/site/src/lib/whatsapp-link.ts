import { CONTACT } from "../data/contact";

type Locale = "en" | "ar";

/**
 * Pre-filled first message per button topic. Each says it came from the
 * website and what the visitor wants, so the conversation starts with context
 * and the team can tell the source without asking "how did you find us?".
 */
const MESSAGES = {
  general: {
    en: "Hi, I found you on your website and I'd like to know more about 9th Round.",
    ar: "أهلاً، شفت موقعكم وعايز أعرف تفاصيل أكتر عن 9th Round.",
  },
  trial: {
    en: "Hi, I'd like to book my free first session at 9th Round (from the website).",
    ar: "أهلاً، عايز أحجز أول حصة مجانية في 9th Round (من الموقع).",
  },
  packages: {
    en: "Hi, I'd like details on the 9th Round packages and prices (from the website).",
    ar: "أهلاً، عايز أعرف تفاصيل الباقات والأسعار في 9th Round (من الموقع).",
  },
  shop: {
    en: "Hi, I'd like to order from the 9th Round shop (from the website).",
    ar: "أهلاً، عايز أطلب من متجر 9th Round (من الموقع).",
  },
} as const;

export type WhatsAppTopic = keyof typeof MESSAGES;

export function whatsappHref(locale: Locale, topic: WhatsAppTopic = "general"): string {
  return `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(MESSAGES[topic][locale])}`;
}

/** For callers that already have their own message text (e.g. the trial form with the visitor's name). */
export function whatsappHrefWithText(text: string): string {
  return `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(text)}`;
}
