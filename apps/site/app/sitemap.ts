import type { MetadataRoute } from "next";
import { site } from "@/content/site.config";
import { PROGRAM_SLUGS } from "@/content/programs";

const base = process.env.NEXT_PUBLIC_SITE_URL || site.domain;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["/", "/about", "/programs", "/coaches", "/memberships", "/trial", "/contact", "/privacy", "/terms"];
  const programPaths = PROGRAM_SLUGS.map((s) => `/programs/${s}`);

  return [...staticPaths, ...programPaths].map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/trial" ? 0.9 : 0.7,
  }));
}
