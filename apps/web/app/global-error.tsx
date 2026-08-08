"use client";

/**
 * A custom global error boundary (App Router's special file for this) —
 * same rationale as not-found.tsx: avoids Next's own built-in default,
 * which is broken under this monorepo's install (see next.config.mjs).
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex h-screen items-center justify-center bg-black text-center text-white">
        <div>
          <p className="text-2xl font-semibold">Something went wrong</p>
          <button type="button" onClick={reset} className="mt-2 text-sm text-yellow-500 hover:underline">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
