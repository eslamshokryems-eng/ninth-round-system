import { Section, SectionHead } from "@/components/primitives";
import { Reveal } from "@/components/reveal";

const PILLARS = [
  {
    title: "Structured rounds",
    body: "Nine stations, three minutes each. Every session has a shape — warm-up, strength, striking, core, conditioning — so the work always progresses.",
  },
  {
    title: "Real combat coaching",
    body: "A coach is on the floor every round to teach the movement and fix your form. Boxing and kickboxing technique, not just a follow-along video.",
  },
  {
    title: "Thirty minutes that count",
    body: "The circuit is roughly thirty minutes of actual work. Efficient enough for a real schedule, hard enough to change your conditioning.",
  },
  {
    title: "Progress you can measure",
    body: "Simple monthly checkpoints — push-ups, plank hold, a 30-second jab count — plus a year-long progression through four training phases.",
  },
];

export function Pillars() {
  return (
    <Section tone="raised">
      <SectionHead
        eyebrow="Why 9th Round"
        title="Not another gym class"
        intro="9th Round is a structured combat-fitness experience — built for beginners and serious athletes training in the same room."
      />
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {PILLARS.map((p, i) => (
          <Reveal key={p.title} delay={i * 60}>
            <div className="h-full rounded-card border border-white/10 bg-ink-850 p-6">
              <h3 className="font-display text-lg uppercase tracking-wide text-bone">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
