import Link from "next/link";
import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";
import { footerNav } from "@/components/nav-items";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function SiteFooter({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const socials = Object.entries(site.social).filter(([, url]) => Boolean(url)) as Array<[string, string]>;
  const hours = site.contact.openingHours;
  const groups = footerNav(lang);

  return (
    <footer className="border-t border-white/10 bg-ink-900 pb-24 pt-16 lg:pb-16">
      <Container>
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <p className="font-display text-2xl font-bold uppercase tracking-wide text-bone">9th Round</p>
            <p className="mt-3 text-sm text-ash">{site.shortDescription[lang]}</p>
            <div className="mt-5">
              <ButtonLink href={href(lang, "/trial")} size="md">
                {t.cta.trial}
              </ButtonLink>
            </div>
          </div>

          <nav aria-label={t.nav.footerLabel} className="grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3">
            {groups.map((g) => (
              <div key={g.heading}>
                <p className="font-mono text-xs uppercase tracking-widest text-ash/60">{g.heading}</p>
                <ul className="mt-3 space-y-1">
                  {g.links.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="block py-0.5 text-sm text-ash transition-colors hover:text-bone">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-6 border-t border-white/10 pt-8 text-sm text-ash sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {site.contact.addressLine ? <p>{site.contact.addressLine[lang]}</p> : null}
            {site.contact.city ? <p>{site.contact.city[lang]}</p> : null}
            {process.env.NEXT_PUBLIC_PHONE_NUMBER ? (
              <p dir="ltr" className="text-start">
                <a className="hover:text-bone" href={`tel:+${process.env.NEXT_PUBLIC_PHONE_NUMBER}`}>
                  +{process.env.NEXT_PUBLIC_PHONE_NUMBER}
                </a>
              </p>
            ) : null}
            {site.contact.email ? (
              <p dir="ltr" className="text-start">
                <a className="hover:text-bone" href={`mailto:${site.contact.email}`}>
                  {site.contact.email}
                </a>
              </p>
            ) : null}
            {hours.length > 0 ? (
              <ul className="pt-2">
                {hours.map((o) => (
                  <li key={o.day.en}>
                    <span className="text-bone">{o.day[lang]}</span>{" "}
                    <span dir="ltr">{o.hours}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {socials.length > 0 ? (
            <ul className="flex flex-wrap gap-4">
              {socials.map(([k, url]) => (
                <li key={k}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-bone">
                    {SOCIAL_LABELS[k] ?? k}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mt-8 flex flex-col gap-2 text-xs text-ash/70 sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {site.legalName[lang]}.
          </p>
          <div className="flex gap-4">
            <Link href={href(lang, "/privacy")} className="hover:text-bone">
              {t.nav.privacy}
            </Link>
            <Link href={href(lang, "/terms")} className="hover:text-bone">
              {t.nav.terms}
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
