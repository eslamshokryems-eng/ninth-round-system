import type { MetadataRoute } from "next";
import { site } from "@/content/site.config";

const base = process.env.NEXT_PUBLIC_SITE_URL || site.domain;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/thank-you", "/api/"] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
