"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/programs", label: "Programs" },
  { href: "/coaches", label: "Coaches" },
  { href: "/classes", label: "Classes" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
          <Image src="/emblem-red.png" alt="9th Round Egypt" width={28} height={28} />
          <span className="text-sm font-bold tracking-wide text-ink">9TH ROUND EGYPT</span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-ink ${
                pathname === link.href ? "text-ink" : "text-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/trial"
            className="rounded-pill bg-gold px-5 py-2 text-sm font-bold text-bg transition-colors hover:bg-gold-soft"
          >
            Book a Free Trial
          </Link>
        </nav>

        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink lg:hidden"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
            {isMenuOpen ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      {isMenuOpen ? (
        <nav className="flex flex-col gap-1 border-t border-white/5 px-4 py-3 lg:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className={`rounded-lg px-2 py-2 text-sm font-medium ${
                pathname === link.href ? "text-ink" : "text-muted"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/trial"
            onClick={() => setIsMenuOpen(false)}
            className="mt-2 rounded-pill bg-gold px-5 py-2.5 text-center text-sm font-bold text-bg"
          >
            Book a Free Trial
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
