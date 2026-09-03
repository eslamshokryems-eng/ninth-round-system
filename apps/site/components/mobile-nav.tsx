"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/button";
import type { NavLink } from "@/components/nav-items";
import { href, type Lang } from "@/content/i18n/config";

/**
 * Mobile menu. Every string arrives as a prop from the server header, so
 * neither dictionary is pulled into the client bundle.
 */
export function MobileNav({
  lang,
  nav,
  programs,
  programsHref,
  labels,
}: {
  lang: Lang;
  nav: NavLink[];
  programs: NavLink[];
  programsHref: string;
  labels: { menu: string; open: string; close: string; mobile: string; programs: string; trial: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-label={labels.open}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-bone hover:bg-white/5"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-ink-950"
          role="dialog"
          aria-modal="true"
          aria-label={labels.menu}
        >
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
            <span className="font-display text-lg font-bold uppercase tracking-wide">{labels.menu}</span>
            <button
              type="button"
              aria-label={labels.close}
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-bone hover:bg-white/5"
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <path d="M5 5l12 12M17 5 5 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav aria-label={labels.mobile} className="flex-1 overflow-y-auto px-5 py-6">
            <Link href={programsHref} className="block py-3 font-display text-2xl font-semibold uppercase">
              {labels.programs}
            </Link>
            <ul className="mb-4 space-y-1 border-white/10 ps-4 border-s">
              {programs.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className="block py-2 text-base text-ash hover:text-bone">
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
            {nav
              .filter((i) => i.href !== programsHref)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block py-3 font-display text-2xl font-semibold uppercase text-bone"
                >
                  {item.label}
                </Link>
              ))}
          </nav>

          <div className="border-t border-white/10 p-5">
            <ButtonLink href={href(lang, "/trial")} size="lg" className="w-full">
              {labels.trial}
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
