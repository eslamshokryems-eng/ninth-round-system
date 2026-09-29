/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // THE NINTH's own site. Workspace packages imported from source must be listed for SWC.
  transpilePackages: ["@9thround/race", "@9thround/shared-kernel"],
  async redirects() {
    return [{ source: "/", destination: "/race", permanent: false }];
  },
};

export default nextConfig;
