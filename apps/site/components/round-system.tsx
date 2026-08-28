import { Section, SectionHead } from "@/components/primitives";

/**
 * The 9-round circuit explainer. Station names are a faithful summary of
 * 9th Round's own documented circuit (warm-up through conditioning, with
 * round 9 always core). Not a schedule or a guarantee — a description.
 */
const ROUNDS = [
  { n: 1, label: "Warm-up", detail: "Jump rope, movement prep" },
  { n: 2, label: "Strength", detail: "Squat + press patterns" },
  { n: 3, label: "Boxing", detail: "Med-ball & combinations" },
  { n: 4, label: "Heavy bag", detail: "Power & output" },
  { n: 5, label: "Kickboxing", detail: "Kicks, knees, movement" },
  { n: 6, label: "Sandbag", detail: "Carries & rotational work" },
  { n: 7, label: "Speed", detail: "Speed ball, hand speed" },
  { n: 8, label: "Conditioning", detail: "High-intensity intervals" },
  { n: 9, label: "Core", detail: "The finish — always core" },
];

export function RoundSystem() {
  return (
    <Section>
      <SectionHead
        eyebrow="The format"
        title="Nine rounds. Thirty minutes."
        intro="You move to the next station every three minutes — three short exercises per round with brief rests. Start at any open station, complete all nine."
      />
      <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROUNDS.map((r) => (
          <li key={r.n} className="flex items-start gap-4 rounded-card border border-white/10 bg-ink-850 p-5">
            <span className="font-display text-3xl font-bold leading-none text-blood">
              {String(r.n).padStart(2, "0")}
            </span>
            <div>
              <p className="font-display uppercase tracking-wide text-bone">{r.label}</p>
              <p className="mt-0.5 text-sm text-ash">{r.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-prose text-sm text-ash">
        Station content varies day to day, and over a year the programming moves through four phases — Build, Ignite,
        Challenge and Master.
      </p>
    </Section>
  );
}
