/**
 * A custom not-found page, so Next doesn't fall back to its own built-in
 * default (which pulls in `styled-jsx` — broken under this monorepo's
 * pnpm-hoisted, multi-React-version install, since `apps/mobile` needs
 * React 19 and this app needs React 18; see next.config.mjs/package.json
 * for the related override).
 */
export default function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center bg-bg text-center">
      <div>
        <p className="text-2xl font-semibold text-ink">Page not found</p>
        <a href="/" className="mt-2 inline-block text-sm text-gold hover:text-gold-soft">
          Back to Reception
        </a>
      </div>
    </div>
  );
}
