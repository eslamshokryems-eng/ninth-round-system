// Public marketing site — deliberately self-contained. It imports NOTHING
// from `packages/*` or `apps/web`, so there is no `transpilePackages` list
// and no shared code path with the internal Web App.
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
