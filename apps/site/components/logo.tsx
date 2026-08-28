import Link from "next/link";

/**
 * Wordmark lockup. The emblem SVG is a clean placeholder built from the
 * 9th Round mark's idea (a bold "9" + "TH"); it is REPLACED by the real
 * vector logo once 9th Round supplies it (see README, "Content required").
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${className}`} aria-label="9th Round — home">
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true" className="shrink-0">
        <rect width="34" height="34" rx="7" fill="#E4141B" />
        <path
          d="M11.4 25.5c3 0 5.2-1.4 6.6-3.6 1.2-1.9 1.7-4.4 1.7-7.1 0-4.9-2.4-8-6.4-8-3.5 0-6 2.4-6 5.9 0 3.3 2.2 5.5 5.4 5.5 1.6 0 2.9-.6 3.7-1.7-.1 3.6-1.6 5.8-4.4 5.8-1 0-1.9-.3-2.6-.8l-1.3 3.5c1.1.6 2.4 1 3.8 1Zm1.7-11.6c-1.4 0-2.3-1-2.3-2.5s.9-2.5 2.3-2.5c1.5 0 2.4 1.1 2.4 2.5s-1 2.5-2.4 2.5Z"
          fill="#fff"
        />
        <text x="21.5" y="12" fontFamily="Oswald, sans-serif" fontSize="8" fontWeight="700" fill="#fff">
          TH
        </text>
      </svg>
      <span className="font-display text-lg font-bold uppercase tracking-wide text-bone">9th Round</span>
    </Link>
  );
}
