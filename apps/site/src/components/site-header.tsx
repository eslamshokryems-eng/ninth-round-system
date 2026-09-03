"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "../i18n/language-provider";
import { LanguageToggle } from "./language-toggle";

export function SiteHeader() {
  const pathname = usePathname();
  const { dict } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navLinks = [
    { href: "/about", label: dict.nav.about },
    { href: "/programs", label: dict.nav.programs },
    { href: "/coaches", label: dict.nav.coaches },
    { href: "/classes", label: dict.nav.classes },
    { href: "/contact", label: dict.nav.contact },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-bone/10 bg-black/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2" onClick={() => setIsMenuOpen(false)}>
          <Image src="/emblem-red.png" alt="9th Round" width={28} height={28} />
          <span className="font-display text-sm uppercase tracking-wide text-bone">
            9th Round <span className="text-grey">Kenpo &amp; Fitness</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium transition-colors hover:text-bone ${
                pathname === link.href ? "text-bone" : "text-grey"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <LanguageToggle />
          <Link
            href="/trial"
            className="rounded-pill bg-red px-5 py-2 text-sm font-bold uppercase tracking-wide text-bone transition-colors hover:bg-red/90"
          >
            {dict.nav.bookTrial}
          </Link>
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageToggle />
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-bone"
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
      </div>

      {isMenuOpen ? (
        <nav className="flex flex-col gap-1 border-t border-bone/10 px-4 py-3 lg:hidden">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className={`rounded-lg px-2 py-2 text-sm font-medium ${pathname === link.href ? "text-bone" : "text-grey"}`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/trial"
            onClick={() => setIsMenuOpen(false)}
            className="mt-2 rounded-pill bg-red px-5 py-2.5 text-center text-sm font-bold uppercase tracking-wide text-bone"
          >
            {dict.nav.bookTrial}
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
