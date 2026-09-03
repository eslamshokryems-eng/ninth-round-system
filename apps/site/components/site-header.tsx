import Link from "next/link";
import { Container } from "@/components/primitives";
import { Logo } from "@/components/logo";
import { ButtonLink } from "@/components/button";
import { MobileNav } from "@/components/mobile-nav";
import { LangSwitcher } from "@/components/lang-switcher";
import { primaryNav, programLinks } from "@/components/nav-items";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";

export function SiteHeader({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const nav = primaryNav(lang);
  const programs = programLinks(lang);
  const programsHref = href(lang, "/programs");

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-ink-950/85 backdrop-blur supports-[backdrop-filter]:bg-ink-950/70">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Logo lang={lang} />

        <nav aria-label={t.nav.primaryLabel} className="hidden items-center gap-1 lg:flex">
          {nav.map((item) =>
            item.href === programsHref ? (
              <div key={item.href} className="group relative">
                <Link
                  href={programsHref}
                  className="flex items-center gap-1 rounded-pill px-3 py-2 text-sm font-medium text-ash transition-colors hover:text-bone focus-visible:text-bone"
                >
                  {item.label}
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </Link>
                <div className="invisible absolute top-full w-60 pt-2 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 start-0">
                  <ul className="overflow-hidden rounded-card border border-white/10 bg-ink-850 py-2 shadow-2xl">
                    {programs.map((p) => (
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
          <LangSwitcher lang={lang} label={t.switcher.label} aria={t.switcher.aria} />
          <ButtonLink href={href(lang, "/trial")} size="md">
            {t.cta.trial}
          </ButtonLink>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LangSwitcher lang={lang} label={t.switcher.label} aria={t.switcher.aria} />
          <MobileNav
            lang={lang}
            nav={nav}
            programs={programs}
            programsHref={programsHref}
            labels={{
              menu: t.nav.menu,
              open: t.nav.openMenu,
              close: t.nav.closeMenu,
              mobile: t.nav.mobileLabel,
              programs: t.nav.programs,
              trial: t.cta.trial,
            }}
          />
        </div>
      </Container>
    </header>
  );
}
