import type { Metadata } from "next";
import { site } from "@/content/site.config";
import { LANGS, DEFAULT_LANG, ogLocale, href, type Lang } from "@/content/i18n/config";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || site.domain;

interface PageSeo {
  title: string;
  description: string;
  /** Locale-free path starting with "/", e.g. "/programs/boxing". */
  path: string;
  lang: Lang;
  /** Set true only for pages that must not be indexed (/thank-you, /go/*). */
  noindex?: boolean;
}

/**
 * Builds a canonical-correct, hreflang-complete Metadata object.
 *
 * Every page exists at the same path in both locales, so each one
 * declares its own canonical plus a `languages` map pointing at its
 * sibling. `x-default` points at the default locale, which is also where
 * middleware sends an un-prefixed request — the redirect target and the
 * declared default agree, which is what search engines check for.
 */
export function pageMetadata({ title, description, path, lang, noindex }: PageSeo): Metadata {
  const url = absoluteUrl(href(lang, path));
  const isHome = path === "/";
  const fullTitle = isHome ? `${site.name} — ${site.tagline[lang]}` : `${title} — ${site.name}`;

  const languages: Record<string, string> = {};
  for (const l of LANGS) languages[l === "ar" ? "ar-EG" : "en"] = absoluteUrl(href(l, path));
  languages["x-default"] = absoluteUrl(href(DEFAULT_LANG, path));

  return {
    // `absolute` bypasses the root layout's `title.template` — without it
    // the site name is appended twice ("Programs — 9th Round — 9th Round"),
    // because `fullTitle` already carries it.
    title: { absolute: fullTitle },
    description,
    alternates: noindex ? { canonical: url } : { canonical: url, languages },
    robots: noindex
      ? { index: false, follow: true }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: fullTitle,
      description,
      url,
      locale: ogLocale(lang),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
    },
  };
}

export function absoluteUrl(path: string): string {
  return new URL(path, BASE).toString();
}
