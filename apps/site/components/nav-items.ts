import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { PROGRAMS } from "@/content/programs";

export interface NavLink {
  label: string;
  href: string;
}

/**
 * Program dropdown — generated from the programs themselves, so adding a
 * program to `content/programs.ts` puts it in the nav, the footer, the
 * sitemap and the trial form without a second edit.
 */
export function programLinks(lang: Lang): NavLink[] {
  return PROGRAMS.map((p) => ({ label: p.name[lang], href: href(lang, `/programs/${p.slug}`) }));
}

export function primaryNav(lang: Lang): NavLink[] {
  const t = dict(lang).nav;
  return [
    { label: t.programs, href: href(lang, "/programs") },
    { label: t.schedule, href: href(lang, "/schedule") },
    { label: t.about, href: href(lang, "/about") },
    { label: t.coaches, href: href(lang, "/coaches") },
    { label: t.memberships, href: href(lang, "/memberships") },
    { label: t.location, href: href(lang, "/location") },
  ];
}

/** Grouped footer navigation. */
export function footerNav(lang: Lang): Array<{ heading: string; links: NavLink[] }> {
  const t = dict(lang).nav;
  return [
    { heading: t.programs, links: programLinks(lang) },
    {
      heading: t.about,
      links: [
        { label: t.about, href: href(lang, "/about") },
        { label: t.coaches, href: href(lang, "/coaches") },
        { label: t.memberships, href: href(lang, "/memberships") },
        { label: t.events, href: href(lang, "/events") },
      ],
    },
    {
      heading: t.contact,
      links: [
        { label: t.schedule, href: href(lang, "/schedule") },
        { label: t.location, href: href(lang, "/location") },
        { label: t.gallery, href: href(lang, "/gallery") },
        { label: t.faq, href: href(lang, "/faq") },
        { label: t.contact, href: href(lang, "/contact") },
      ],
    },
  ];
}
