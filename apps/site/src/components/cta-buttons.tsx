import Link from "next/link";
import type { ReactNode } from "react";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill px-6 py-3 text-sm font-bold transition-colors";

export function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${BASE} w-full bg-gold text-bg hover:bg-gold-soft sm:w-auto`}>
      {children}
    </Link>
  );
}

export function SecondaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`${BASE} w-full border border-white/20 text-ink hover:bg-white/[0.06] sm:w-auto`}
    >
      {children}
    </Link>
  );
}

/** External hrefs (WhatsApp/tel:) use a plain <a>, not next/link, since they never resolve to an internal route. */
export function ExternalCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className={`${BASE} w-full border border-white/20 text-ink hover:bg-white/[0.06] sm:w-auto`}>
      {children}
    </a>
  );
}
