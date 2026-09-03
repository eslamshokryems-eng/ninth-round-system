"use client";

import { track, events } from "@/lib/analytics";
import { whatsappMessages } from "@/content/site.config";
import { href as localeHref, type Lang } from "@/content/i18n/config";

const btn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5";

/**
 * "Ask about memberships" — links to WhatsApp when a number is set,
 * otherwise falls back to the contact page. Fires membership_inquiry.
 */
export function MembershipInquiryButton({ lang, label }: { lang: Lang; label: string }) {
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const href = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(whatsappMessages(lang).memberships)}`
    : localeHref(lang, "/contact");
  const external = Boolean(wa);

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={() => track(events.membershipInquiry, { channel: external ? "whatsapp" : "contact_page", lang })}
      className={btn}
    >
      {label}
    </a>
  );
}
