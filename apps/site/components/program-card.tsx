import Link from "next/link";
import type { Program } from "@/content/programs";

export function ProgramCard({ program }: { program: Program }) {
  return (
    <Link
      href={`/programs/${program.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-white/10 bg-ink-850 transition-colors hover:border-white/30"
    >
      {/* Visual placeholder — swapped for real program photography. */}
      <div
        aria-hidden="true"
        className="aspect-[16/10] w-full"
        style={{
          background:
            "linear-gradient(135deg, #1D1D20 0%, #141416 55%), radial-gradient(400px 200px at 80% 0%, rgba(228,20,27,0.25), transparent 70%)",
        }}
      />
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-display text-xl uppercase tracking-wide text-bone">{program.name}</h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-ash">{program.short}</p>
        <p className="mt-4 text-xs uppercase tracking-wider text-ash/70">Who it&apos;s for</p>
        <p className="mt-1 text-sm text-ash">{program.who}</p>
        <span className="mt-5 inline-flex items-center gap-1.5 font-display text-sm font-semibold uppercase tracking-wide text-blood-bright">
          Learn more
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
