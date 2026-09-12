"use client";

import { usePathname } from "next/navigation";
import { useLanguage } from "../i18n/language-provider";
import { CONTACT } from "../data/contact";
import { trackWhatsAppClick } from "../lib/analytics";

/** Sticky WhatsApp CTA, mobile only — the primary conversion action per brand instruction, always reachable while scrolling. */
export function WhatsAppSticky() {
  const { dict } = useLanguage();
  const pathname = usePathname();

  return (
    <a
      href={CONTACT.whatsappHref}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsAppClick(pathname, "sticky")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 bg-red py-3 text-sm font-bold uppercase tracking-wide text-bone sm:hidden"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.85 9.85 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm0 18.02h-.01a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.12.82.83-3.04-.19-.31a8.08 8.08 0 0 1-1.24-4.31c0-4.48 3.65-8.13 8.14-8.13 2.17 0 4.21.85 5.75 2.39a8.07 8.07 0 0 1 2.38 5.75c0 4.48-3.65 8.14-8.11 8.14Zm4.45-6.1c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.29.18-.53.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.11-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.31-.02-.43-.06-.12-.55-1.32-.75-1.81-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.86.84-.86 2.04 0 1.2.88 2.36 1 2.52.12.16 1.73 2.64 4.2 3.7.59.25 1.05.4 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.44-.59 1.65-1.16.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
      </svg>
      {dict.whatsappSticky}
    </a>
  );
}
