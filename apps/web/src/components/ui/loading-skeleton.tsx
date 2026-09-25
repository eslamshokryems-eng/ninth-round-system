/** Shared skeleton primitives (2026-09 UX redesign) — replaces plain "Loading…" text on data-heavy sections (KPI rows, tables) with a shape-matching placeholder, same `animate-pulse` technique already used by ui/qr-code.tsx and the Sales Performance tab. */

export function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-card border border-white/5 bg-surface p-5">
      <div className="h-3 w-20 rounded bg-white/10" />
      <div className="mt-3 h-7 w-16 rounded bg-white/10" />
      <div className="mt-2 h-2.5 w-24 rounded bg-white/5" />
    </div>
  );
}

export function SkeletonCardRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}

export function SkeletonRow({ columns = 4 }: { columns?: number }) {
  return (
    <tr className="animate-pulse border-t border-white/5">
      {Array.from({ length: columns }).map((_, index) => (
        <td key={index} className="px-4 py-3">
          <div className="h-3 w-full max-w-[8rem] rounded bg-white/10" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonRow key={index} columns={columns} />
      ))}
    </>
  );
}
