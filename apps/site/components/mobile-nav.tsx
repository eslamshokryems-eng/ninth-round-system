"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ButtonLink } from "@/components/button";
import { PRIMARY_NAV, PROGRAM_LINKS } from "@/components/nav-items";

export function MobileNav() {
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
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-bone hover:bg-white/5"
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M3 6h16M3 11h16M3 16h16" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-ink-950" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
            <span className="font-display text-lg font-bold uppercase tracking-wide">Menu</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-bone hover:bg-white/5"
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <path d="M5 5l12 12M17 5 5 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-5 py-6">
            <Link href="/programs" className="block py-3 text-2xl font-display font-semibold uppercase">
              Programs
            </Link>
            <ul className="mb-4 space-y-1 border-l border-white/10 pl-4">
              {PROGRAM_LINKS.map((p) => (
                <li key={p.href}>
                  <Link href={p.href} className="block py-2 text-base text-ash hover:text-bone">
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
            {PRIMARY_NAV.filter((i) => i.href !== "/programs").map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block py-3 text-2xl font-display font-semibold uppercase text-bone"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-white/10 p-5">
            <ButtonLink href="/trial" size="lg" className="w-full">
              Book a trial
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
