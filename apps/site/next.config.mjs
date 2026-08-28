// Public marketing site — deliberately self-contained. It imports NOTHING
// from `packages/*` or `apps/web`, so there is no `transpilePackages` list
// and no shared code path with the internal Web App.

// Node build-config file. The root ESLint preset only declares Node globals
// for *.config.js / *.config.cjs, so `process` needs an explicit exemption
// here rather than a change to the shared root config.
// eslint-disable-next-line no-undef
const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy.
 *
 * `script-src` includes 'unsafe-inline' deliberately: Next.js App Router
 * emits inline bootstrap/flight scripts, and the strict alternative
 * (per-request nonces) requires middleware, which would make every page
 * dynamic and forfeit static generation on a site that is 100% static
 * marketing content. The XSS surface here is effectively nil — no
 * user-generated content is ever rendered, and the only inline scripts are
 * server-authored JSON-LD and the PostHog loader. The remaining directives
 * (frame-ancestors, object-src, base-uri, form-action) still block
 * clickjacking, plugin injection, base-tag hijacking and form exfiltration.
 *
 * 'unsafe-eval' is added in development only (React Refresh needs it); the
 * production bundle does not.
 *
 * Allowed third parties are exactly the two optional integrations:
 * PostHog (analytics) and Cloudflare Turnstile (bot check on the trial form).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://*.posthog.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.posthog.com https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Real 9th Round facility media will be added under /public or a
    // configured remote host. Kept empty until then — no stock/third-party
    // image domains are allowed.
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
