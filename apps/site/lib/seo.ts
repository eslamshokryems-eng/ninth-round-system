import type { Metadata } from "next";
import { site } from "@/content/site.config";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || site.domain;

interface PageSeo {
  title: string;
  description: string;
  /** Path starting with "/". */
  path: string;
  /** Set true only for pages that must not be indexed (e.g. /thank-you). */
  noindex?: boolean;
}

/** Builds a full, canonical-correct Metadata object for a page. */
export function pageMetadata({ title, description, path, noindex }: PageSeo): Metadata {
  const url = new URL(path, BASE).toString();
  const fullTitle = path === "/" ? `${site.name} — ${site.tagline}` : `${title} — ${site.name}`;

  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    robots: noindex
      ? { index: false, follow: true }
      : { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
    openGraph: {
      type: "website",
      siteName: site.name,
      title: fullTitle,
      description,
      url,
      locale: "en_EG",
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
