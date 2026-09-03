"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { track, events } from "@/lib/analytics";
import { href, stripLang, type Lang } from "@/content/i18n/config";

/**
 * Mobile-only sticky bar: Book a Trial always shows; WhatsApp / Call only
 * appear when a real number is configured. Hidden on the trial page itself
 * and on ad landing pages, where a form is already the focus.
 *
 * Labels arrive as props from the server layout so no dictionary reaches
 * the client bundle.
 */
export function StickyActionBar({
  lang,
  labels,
}: {
  lang: Lang;
  labels: { trial: string; whatsapp: string; call: string };
}) {
  const pathname = usePathname() || "/";
  const bare = stripLang(pathname);
  if (bare === "/trial" || bare === "/thank-you" || bare.startsWith("/go/")) return null;

  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const tel = process.env.NEXT_PUBLIC_PHONE_NUMBER;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/95 backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-lg items-stretch gap-2 p-2.5">
        <Link
          href={href(lang, "/trial")}
          className="flex flex-1 items-center justify-center rounded-pill bg-blood px-4 py-3 font-display text-sm font-semibold uppercase tracking-wide text-white"
        >
          {labels.trial}
        </Link>
        {wa ? (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={labels.whatsapp}
            onClick={() => track(events.clickWhatsapp, { context: "sticky_bar", lang })}
            className="flex h-12 w-12 items-center justify-center rounded-pill border border-white/20 text-bone"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.8 4.9-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.5-.3.3c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.8-1c.2-.2.4-.2.6-.1l1.9.9c.3.1.5.2.6.3.1.2.1.7-.1 1.3Z" />
            </svg>
          </a>
        ) : null}
        {tel ? (
          <a
            href={`tel:+${tel}`}
            aria-label={labels.call}
            onClick={() => track(events.clickCall, { context: "sticky_bar", lang })}
            className="flex h-12 w-12 items-center justify-center rounded-pill border border-white/20 text-bone"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.6 10.8a15.5 15.5 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.5-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2Z" />
            </svg>
          </a>
        ) : null}
      </div>
    </div>
  );
}
