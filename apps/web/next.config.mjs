// Next.js 14.2 doesn't support a TypeScript config file (next.config.ts
// support was added in Next 15) — this was `next.config.ts` before, which
// silently never actually loaded since `next build` had never been run
// against it (apps/web had no real pages until now).
/* global process */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // LOCAL DEVELOPMENT ONLY. When LOCAL_GATEWAY_URL is set (see
  // tools/local-dev-stack), relay the two Supabase API prefixes the browser
  // uses to the local gateway, so a browser that can only reach this app's own
  // address (a remote preview) can still sign in and read data. Without the
  // variable — every deployed environment — no rewrite exists at all.
  async rewrites() {
    const gateway = process.env.LOCAL_GATEWAY_URL;
    if (!gateway) return [];
    const base = gateway.replace(/\/+$/, "");
    return [
      { source: "/auth/v1/:path*", destination: `${base}/auth/v1/:path*` },
      { source: "/rest/v1/:path*", destination: `${base}/rest/v1/:path*` },
    ];
  },
  // Every workspace package the app imports from source (not pre-built) needs to be
  // listed here, or Next.js's SWC compiler won't transpile its TypeScript.
  transpilePackages: [
    "@9thround/ui",
    "@9thround/reception",
    "@9thround/hr",
    "@9thround/audit",
    "@9thround/identity",
    "@9thround/supabase-client",
    "@9thround/database-types",
    "@9thround/shared-kernel",
    "@9thround/i18n",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.dev" },
      { protocol: "https", hostname: "imagedelivery.net" },
    ],
  },
};

export default nextConfig;
