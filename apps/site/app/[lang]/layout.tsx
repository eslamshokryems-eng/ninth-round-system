import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Oswald, IBM_Plex_Sans, IBM_Plex_Mono, Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";
import { site } from "@/content/site.config";
import { absoluteUrl } from "@/lib/seo";
import { dict } from "@/content/i18n";
import { LANGS, isLang, dir, htmlLang, href, type Lang } from "@/content/i18n/config";
import { Analytics } from "@/components/analytics";
import { OrganizationJsonLd } from "@/components/json-ld";
import "../globals.css";

/**
 * The site's ROOT layout. It sits under `[lang]` rather than at `app/`
 * because `<html lang>` and `<html dir>` have to change with the locale,
 * and only a layout inside the dynamic segment can read the param.
 * Un-prefixed requests never reach a page — `middleware.ts` redirects
 * them into a locale first.
 */

/* -------------------------------------------------------------------------
 * Typography. Latin and Arabic are separate families: Oswald and IBM Plex
 * have no Arabic glyphs, so an Arabic page set in them would silently fall
 * back to whatever the device happens to have. Cairo (display) and IBM
 * Plex Sans Arabic (text) are the Arabic counterparts, chosen because they
 * carry the same condensed, industrial weight as the Latin pair.
 * All five are self-hosted by next/font, so `font-src 'self'` holds.
 * ---------------------------------------------------------------------- */

const displayLatin = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display-latin",
  display: "swap",
});

const sansLatin = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-latin",
  display: "swap",
});

const monoLatin = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-latin",
  display: "swap",
});

const displayArabic = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["600", "700", "900"],
  variable: "--font-display-arabic",
  display: "swap",
});

const sansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans-arabic",
  display: "swap",
});

const fontVars = [displayLatin, sansLatin, monoLatin, displayArabic, sansArabic]
  .map((f) => f.variable)
  .join(" ");

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export function generateMetadata({ params }: { params: { lang: string } }): Metadata {
  const lang: Lang = isLang(params.lang) ? params.lang : "ar";
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || site.domain),
    title: {
      default: `${site.name} — ${site.tagline[lang]}`,
      template: `%s — ${site.name}`,
    },
    description: site.shortDescription[lang],
    applicationName: site.name,
    alternates: { canonical: absoluteUrl(href(lang, "/")) },
    icons: { icon: "/favicon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  colorScheme: "dark",
};

export default function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { lang: string };
}) {
  if (!isLang(params.lang)) notFound();
  const lang = params.lang;
  const t = dict(lang);

  return (
    <html lang={htmlLang(lang)} dir={dir(lang)} className={fontVars}>
      <body className="bg-ink-950 text-bone antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:z-[100] focus:rounded-pill focus:bg-blood focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:start-4"
        >
          {t.nav.skip}
        </a>
        <OrganizationJsonLd lang={lang} />
        {children}
        <Analytics lang={lang} />
      </body>
    </html>
  );
}
