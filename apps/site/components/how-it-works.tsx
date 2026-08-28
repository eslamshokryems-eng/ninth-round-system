import { Section, SectionHead } from "@/components/primitives";

const STEPS = [
  { title: "Book your trial", body: "Fill the form or message us. The team confirms a time that works for you." },
  { title: "Visit 9th Round", body: "Come in, get shown around, and get set up for your first circuit." },
  { title: "Meet your coach", body: "A coach walks you through the movements and adjusts everything to your level." },
  { title: "Start training", body: "Train a full nine-round circuit — real intensity, real coaching, from day one." },
  { title: "Build your program", body: "Afterwards we talk goals and the membership or PT option that fits." },
];

export function HowItWorks() {
  return (
    <Section tone="raised">
      <SectionHead eyebrow="How it works" title="From first message to first round" />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-card border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 bg-ink-850 p-6">
            <span className="font-display text-4xl font-bold leading-none text-blood">{i + 1}</span>
            <p className="font-display uppercase tracking-wide text-bone">{s.title}</p>
            <p className="text-sm text-ash">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
