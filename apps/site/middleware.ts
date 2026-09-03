import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { LANGS, DEFAULT_LANG, stripLang, type Lang } from "@/content/i18n/config";

/**
 * Locale routing. Every page lives under `/ar/...` or `/en/...`; this
 * redirects any un-prefixed path to a locale so there is exactly one
 * canonical URL per page per language.
 *
 * It only ever issues a 307 redirect — it never rewrites, never reads a
 * cookie, and never touches the response body, so every page stays
 * statically generated. `/api/*` and all static/metadata files are
 * excluded by the matcher below and never reach this function.
 */

const PREFIXED = new RegExp(`^/(${LANGS.join("|")})(/|$)`);

/**
 * URLs from the previous version of this site that no longer exist.
 * `/classes` was its schedule page; `/schedule` is the successor, so the
 * link equity and any bookmark follow it instead of hitting a 404.
 * These are permanent (308) — the page genuinely moved, which is a
 * different thing from the locale redirect below.
 */
const LEGACY_PATHS: Record<string, string> = {
  "/classes": "/schedule",
};

/** Picks a locale from Accept-Language, defaulting to Arabic. */
function preferredLang(header: string | null): Lang {
  if (!header) return DEFAULT_LANG;
  // Highest-quality tag wins; we only care whether English outranks Arabic.
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: (tag || "").toLowerCase(), q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (tag.startsWith("ar")) return "ar";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LANG;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const prefix = PREFIXED.exec(pathname);
  const lang: Lang = prefix ? (prefix[1] as Lang) : preferredLang(request.headers.get("accept-language"));
  // The path with any locale prefix removed, so a legacy URL is caught
  // whether it arrives bare (/classes) or prefixed (/en/classes).
  const bare = stripLang(pathname);

  const moved = LEGACY_PATHS[bare];
  if (moved) {
    const url = request.nextUrl.clone();
    url.pathname = `/${lang}${moved}`;
    url.search = search;
    return NextResponse.redirect(url, 308);
  }

  if (prefix) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  url.search = search;

  const response = NextResponse.redirect(url, 307);
  // The destination depends on the request's language header — say so, or
  // a CDN will serve one visitor's redirect to everyone.
  response.headers.set("Vary", "Accept-Language");
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   - /api/* (the trial endpoint)
     *   - Next internals
     *   - the generated OG card, which is extensionless and locale-neutral
     *   - any path with a file extension: favicon.svg, robots.txt,
     *     sitemap.xml, /gallery/*.jpg
     */
    "/((?!api|_next/static|_next/image|opengraph-image|.*\\.[^/]+$).*)",
  ],
};
