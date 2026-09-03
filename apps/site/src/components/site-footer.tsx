"use client";

import Link from "next/link";
import { useLanguage } from "../i18n/language-provider";
import { CONTACT } from "../data/contact";

export function SiteFooter() {
  const { dict } = useLanguage();

  const navLinks = [
    { href: "/about", label: dict.nav.about },
    { href: "/programs", label: dict.nav.programs },
    { href: "/coaches", label: dict.nav.coaches },
    { href: "/classes", label: dict.nav.classes },
    { href: "/trial", label: dict.nav.bookTrial },
    { href: "/contact", label: dict.nav.contact },
  ];

  return (
    <footer className="border-t border-bone/10">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6 lg:px-8">
        <div>
          <p className="font-display text-sm uppercase tracking-wide text-bone">9th Round</p>
          <p className="mt-2 text-sm text-grey">{dict.footer.tagline}</p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-grey">{dict.footer.navigate}</p>
          <ul className="mt-3 space-y-2">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-grey hover:text-bone">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-grey">{dict.footer.contact}</p>
          <ul className="mt-3 space-y-2 text-sm text-grey">
            <li>
              <a href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer" className="hover:text-bone">
                WhatsApp — {CONTACT.whatsappDisplay}
              </a>
            </li>
            <li>
              <a href={CONTACT.callHref} className="hover:text-bone">
                {CONTACT.phoneDisplay}
              </a>
            </li>
            <li>
              <a href={CONTACT.instagramHref} target="_blank" rel="noopener noreferrer" className="hover:text-bone">
                Instagram — {CONTACT.instagramHandle}
              </a>
            </li>
            <li>
              <a href={CONTACT.facebookHref} target="_blank" rel="noopener noreferrer" className="hover:text-bone">
                Facebook
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-bone/10 px-4 py-6 text-center text-xs text-grey sm:px-6 lg:px-8">
        &copy; {new Date().getFullYear()} 9th Round — Kenpo &amp; Fitness. {dict.footer.rights}
      </div>
    </footer>
  );
}
