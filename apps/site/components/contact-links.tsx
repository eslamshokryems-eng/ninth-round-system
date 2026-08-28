"use client";

import type { ReactNode } from "react";
import { track, events } from "@/lib/analytics";
import { site } from "@/content/site.config";

function waHref(message: string): string | null {
  const num = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!num) return null;
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

function telHref(): string | null {
  const num = process.env.NEXT_PUBLIC_PHONE_NUMBER;
  return num ? `tel:+${num}` : null;
}

export const WHATSAPP_MESSAGES = {
  trial: `Hi ${site.name} — I'd like to book a free trial session.`,
  memberships: `Hi ${site.name} — I'd like to know the membership options.`,
  kids: `Hi ${site.name} — I'm asking about the kids / junior program.`,
  general: `Hi ${site.name} — I have a question.`,
} as const;

type MsgKey = keyof typeof WHATSAPP_MESSAGES;

/**
 * Renders a WhatsApp link, or nothing if no number is configured yet.
 * Never fakes a number.
 */
export function WhatsAppLink({
  message = "general",
  children,
  className = "",
  context = "unknown",
}: {
  message?: MsgKey;
  children: ReactNode;
  className?: string;
  context?: string;
}) {
  const href = waHref(WHATSAPP_MESSAGES[message]);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => track(events.clickWhatsapp, { context, topic: message })}
    >
      {children}
    </a>
  );
}

/** Renders a click-to-call link, or nothing if no number is configured. */
export function CallLink({
  children,
  className = "",
  context = "unknown",
}: {
  children: ReactNode;
  className?: string;
  context?: string;
}) {
  const href = telHref();
  if (!href) return null;
  return (
    <a href={href} className={className} onClick={() => track(events.clickCall, { context })}>
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
