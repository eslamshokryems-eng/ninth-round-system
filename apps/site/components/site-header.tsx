import Link from "next/link";
import { Container } from "@/components/primitives";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/button";
import { MobileNav } from "@/components/mobile-nav";
import { PRIMARY_NAV, PROGRAM_LINKS } from "@/components/nav-items";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-950/85 backdrop-blur supports-[backdrop-filter]:bg-ink-950/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {PRIMARY_NAV.map((item) =>
            item.href === "/programs" ? (
              <div key={item.href} className="group relative">
                <Link
                  href="/programs"
                  className="flex items-center gap-1 rounded-pill px-3 py-2 text-sm font-medium text-ash transition-colors hover:text-bone focus-visible:text-bone"
                >
                  {item.label}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </Link>
                <div className="invisible absolute left-0 top-full w-60 pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <ul className="overflow-hidden rounded-card border border-white/10 bg-ink-850 py-2 shadow-2xl">
                    {PROGRAM_LINKS.map((p) => (
                      <li key={p.href}>
                        <Link
                          href={p.href}
                          className="block px-4 py-2.5 text-sm text-ash transition-colors hover:bg-white/5 hover:text-bone"
                        >
                          {p.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-pill px-3 py-2 text-sm font-medium text-ash transition-colors hover:text-bone focus-visible:text-bone"
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ButtonLink href="/trial" size="md">
            Book a trial
          </ButtonLink>
        </div>

        <MobileNav />
      </Container>
    </header>
  );
}
