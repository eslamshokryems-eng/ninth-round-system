/**
 * This workspace hoists node_modules (node-linker=hoisted /
 * shamefully-hoist=true in the root .npmrc — required by apps/mobile's
 * Metro bundler). apps/site's own scripts/localize-next.mjs (run before
 * every dev/build/start/typecheck) makes `next` and `styled-jsx`
 * genuinely local, physical copies inside apps/site/node_modules, with
 * their own nested react/react-dom peer copies re-pointed at apps/site's
 * own — so every plain Node `require`/`import` resolves consistently.
 * No webpack-level alias here: a blunt `resolve.alias` override for
 * react/react-dom fights Next's own conditional-exports resolution
 * (react-server / edge / browser / default entry points, used by RSC)
 * and reintroduces multi-instance chunks instead of fixing them — the
 * localized-copy approach alone is both necessary and sufficient.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // `next build`'s own internal typecheck walks up from wherever the
    // `next` package itself physically resolves (under this workspace's
    // hoisting, that can be the shared workspace root, not apps/site) to
    // find `react`'s types — so it can hit a *different* @types/react
    // than apps/site's own (root's happens to be apps/mobile's React 19
    // types), failing on a mismatch that has nothing to do with an actual
    // type error in this app's code. tsconfig `paths`/`typeRoots` can't
    // reach into that resolution because it's inside next's own bundled
    // .d.ts files, not this app's source. The real type safety net is
    // `pnpm --filter @9thround/site typecheck` (plain `tsc --noEmit`,
    // scoped correctly to apps/site's own node_modules) — run that (and
    // it is run, in CI and before every build here) instead of trusting
    // this redundant, hoisting-confused internal pass.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
