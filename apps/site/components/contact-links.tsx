"use client";

import type { ReactNode } from "react";
import { track, events } from "@/lib/analytics";
import { whatsappMessages } from "@/content/site.config";
import type { Lang } from "@/content/i18n/config";

export type MsgKey = "trial" | "memberships" | "kids" | "events" | "general";

function waHref(message: string): string | null {
  const num = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

function telHref(): string | null {
  const num = process.env.NEXT_PUBLIC_PHONE_NUMBER;
  return num ? `tel:+${num}` : null;
}

/**
 * Renders a WhatsApp link, or nothing if no number is configured yet.
 * Never fakes a number.
 *
 * The opening message is written in the visitor's language, so a lead who
 * clicked from the Arabic site lands in the club's inbox speaking Arabic.
 */
export function WhatsAppLink({
  lang,
  message = "general",
  children,
  className = "",
  context = "unknown",
}: {
  lang: Lang;
  message?: MsgKey;
  children: ReactNode;
  className?: string;
  context?: string;
}) {
  const href = waHref(whatsappMessages(lang)[message]);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track(events.clickWhatsapp, { context, topic: message, lang })}
    >
      {children}
    </a>
  );
}

/** Renders a click-to-call link, or nothing if no number is configured. */
export function CallLink({
  lang,
  children,
  className = "",
  context = "unknown",
}: {
  lang: Lang;
  children: ReactNode;
  className?: string;
  context?: string;
}) {
  const href = telHref();
  if (!href) return null;
  return (
    <a href={href} className={className} onClick={() => track(events.clickCall, { context, lang })}>
      {children}
    </a>
  );
}

export function hasWhatsApp(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
}
export function hasPhone(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PHONE_NUMBER);
}
