/**
 * A custom not-found page, so Next doesn't fall back to its own built-in
 * default (which pulls in `styled-jsx` — broken under this monorepo's
 * pnpm-hoisted install once more than one Next app shares the workspace;
 * see scripts/fix-next-react-dedup.mjs, which only dedups apps/web's copy
 * of React. Rather than extend that script to also cover apps/site, this
 * app simply never renders Next's built-in error pages that trigger it).
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg text-center text-ink">
      <div>
        <p className="text-2xl font-semibold">Page not found</p>
        <a href="/" className="mt-2 inline-block text-sm text-gold hover:text-gold-soft">
          Back to 9th Round Egypt
        </a>
      </div>
    </div>
  );
}
