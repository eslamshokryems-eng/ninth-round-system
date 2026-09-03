import Link from "next/link";
import type { ReactNode } from "react";

const BASE = "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-sm font-bold uppercase tracking-wide transition-colors";

/** Red is the one accent per brand rule — used once, deliberately, for the primary action. */
export function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${BASE} w-full bg-red text-bone hover:bg-red/90 sm:w-auto`}>
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

/** External hrefs (WhatsApp/tel:) use a plain <a>, not next/link, since they never resolve to an internal route. */
export function ExternalCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${BASE} w-full border border-bone/30 text-bone hover:border-bone sm:w-auto`}>
      {children}
    </a>
  );
}
