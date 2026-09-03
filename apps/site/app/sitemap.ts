import type { MetadataRoute } from "next";
import { site } from "@/content/site.config";
import { PROGRAM_SLUGS } from "@/content/programs";
import { LANGS, DEFAULT_LANG, href } from "@/content/i18n/config";

const base = process.env.NEXT_PUBLIC_SITE_URL || site.domain;

const url = (path: string) => `${base}${path}`;

/**
 * Every indexable page, in every language, with `alternates.languages` so
 * search engines read the two versions as one page in two locales rather
 * than as duplicates competing with each other.
 *
 * Excluded on purpose: `/thank-you` (post-conversion) and `/go/*` (ad
 * landing pages) — both are `noindex`, and listing a noindex URL in a
 * sitemap is a contradiction that only wastes crawl budget.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const paths = [
    "/",
    "/programs",
    ...PROGRAM_SLUGS.map((s) => `/programs/${s}`),
    "/schedule",
    "/about",
    "/coaches",
    "/memberships",
    "/location",
    "/gallery",
    "/faq",
    "/events",
    "/trial",
    "/contact",
    "/privacy",
    "/terms",
  ];

  const priority = (path: string): number => {
    if (path === "/") return 1;
    if (path === "/trial") return 0.9;
    if (path === "/programs" || path.startsWith("/programs/") || path === "/schedule") return 0.8;
    if (path === "/privacy" || path === "/terms") return 0.3;
    return 0.7;
  };

  return paths.flatMap((path) =>
    LANGS.map((lang) => ({
      url: url(href(lang, path)),
      lastModified: now,
      changeFrequency: (path === "/" ? "weekly" : "monthly") as "weekly" | "monthly",
      priority: priority(path),
      alternates: {
        languages: {
          ar: url(href("ar", path)),
          en: url(href("en", path)),
          "x-default": url(href(DEFAULT_LANG, path)),
        },
      },
    })),
  );
}
