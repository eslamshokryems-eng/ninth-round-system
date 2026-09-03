import type { MetadataRoute } from "next";
import { site } from "@/content/site.config";

const base = process.env.NEXT_PUBLIC_SITE_URL || site.domain;

/**
 * `/go/*` (ad landing pages) and `/thank-you` are kept out of the index.
 * Both carry a `noindex` robots tag as well — the disallow keeps crawl
 * budget on the pages that can actually rank, the tag is what removes
 * them if they were ever linked from somewhere else.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/ar/thank-you", "/en/thank-you", "/ar/go/", "/en/go/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
