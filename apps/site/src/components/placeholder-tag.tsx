/** Visibly marks unverified content (coach photos, TBC pricing, etc.) rather than inventing it. Remove only once the real value is supplied. */
export function PlaceholderTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill border border-red/50 bg-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red">
      Placeholder — {label}
    </span>
  );
}
