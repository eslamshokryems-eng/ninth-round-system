/** Visibly marks unverified content (address, phone, prices, coach names, schedule) rather than inventing it. Remove only once the real value is supplied. */
export function PlaceholderTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
      Placeholder — {label}
    </span>
  );
}
