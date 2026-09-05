"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { trackPhoneClick, trackTrialCtaClick, trackWhatsAppClick } from "../lib/analytics";

const BASE = "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors";

/**
 * Red is the one accent per brand rule — used once, deliberately, for the
 * primary action. Every real usage of this component links to /trial, so a
 * click is tracked as trial_cta_click; `placement` says where on the page.
 */
export function PrimaryCta({ href, placement, children }: { href: string; placement: string; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      onClick={() => {
        if (href === "/trial") trackTrialCtaClick(pathname, placement);
      }}
      className={`${BASE} w-full bg-red text-bone hover:bg-red/90 sm:w-auto`}
    >
      {children}
    </Link>
  );
}

export function SecondaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${BASE} w-full border border-bone/30 text-bone hover:border-bone sm:w-auto`}>
      {children}
    </Link>
  );
}

/**
 * External hrefs (WhatsApp/tel:) use a plain <a>, not next/link, since they
 * never resolve to an internal route. Auto-detects whatsapp_click vs
 * phone_click from the href itself so callers only need to say `placement`.
 */
export function ExternalCta({ href, placement, children }: { href: string; placement: string; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        if (href.startsWith("tel:")) trackPhoneClick(pathname, placement);
        else if (href.includes("wa.me") || href.includes("whatsapp")) trackWhatsAppClick(pathname, placement);
      }}
      className={`${BASE} w-full border border-bone/30 text-bone hover:border-bone sm:w-auto`}
    >
      {children}
    </a>
  );
}
