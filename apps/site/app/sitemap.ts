import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";

const ROUTES = ["", "/about", "/programs", "/coaches", "/classes", "/trial", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((route) => ({
    url: `${SITE_URL}${route}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: route === "" ? 1 : 0.7,
  }));
}
