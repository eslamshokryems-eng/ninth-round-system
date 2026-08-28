import Link from "next/link";
import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";
import { FOOTER_NAV } from "@/components/nav-items";
import { site } from "@/content/site.config";

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export function SiteFooter() {
  const socials = Object.entries(site.social).filter(([, url]) => Boolean(url)) as Array<[string, string]>;
  const hasHours = site.contact.openingHours.length > 0;

  return (
    <footer className="border-t border-white/10 bg-ink-900 pb-24 pt-16 lg:pb-16">
      <Container>
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <p className="font-display text-2xl font-bold uppercase tracking-wide text-bone">9th Round</p>
            <p className="mt-3 text-sm text-ash">{site.shortDescription}</p>
            <div className="mt-5">
              <ButtonLink href="/trial" size="md">
                Book a trial
              </ButtonLink>
            </div>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 sm:grid-cols-3">
            {FOOTER_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="py-1 text-sm text-ash transition-colors hover:text-bone">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-6 border-t border-white/10 pt-8 text-sm text-ash sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            {site.contact.addressLine ? <p>{site.contact.addressLine}</p> : null}
            {site.contact.city ? <p>{site.contact.city}</p> : null}
            {process.env.NEXT_PUBLIC_PHONE_NUMBER ? (
              <p>
                <a className="hover:text-bone" href={`tel:+${process.env.NEXT_PUBLIC_PHONE_NUMBER}`}>
                  +{process.env.NEXT_PUBLIC_PHONE_NUMBER}
                </a>
              </p>
            ) : null}
            {site.contact.email ? (
              <p>
                <a className="hover:text-bone" href={`mailto:${site.contact.email}`}>
                  {site.contact.email}
                </a>
              </p>
            ) : null}
            {hasHours ? (
              <ul className="pt-2">
                {site.contact.openingHours.map((o) => (
                  <li key={o.day}>
                    <span className="text-bone">{o.day}</span> {o.hours}
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
            © {new Date().getFullYear()} {site.legalName}. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-bone">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-bone">
              Terms
            </Link>
          </div>
        </div>
      </Container>
    </footer>
  );
}
