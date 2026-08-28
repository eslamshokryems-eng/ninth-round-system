import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { RoundSystem } from "@/components/round-system";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Why 9th Round",
  description:
    "9th Round is a structured combat-fitness experience in Egypt — a coached, round-based circuit built for beginners and serious athletes alike.",
  path: "/about",
});

const PHASES = [
  { name: "Build", months: "Months 1–3", detail: "Fundamentals, breathing, learning the movements." },
  { name: "Ignite", months: "Months 4–6", detail: "Strength and endurance; kickboxing layered onto strength tools." },
  { name: "Challenge", months: "Months 7–9", detail: "Advanced combat work, HIIT, reaction drills." },
  { name: "Master", months: "Months 10–12", detail: "Full control, sharper output, intelligent ongoing training." },
];

export default function AboutPage() {
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Home", path: "/" }, { name: "Why 9th Round", path: "/about" }]} />
      <PageHero
        eyebrow="Why 9th Round"
        title="No classes. No waiting. Just action."
        intro="9th Round is a structured combat-fitness concept — boxing, kickboxing and conditioning built into a coached, round-based circuit. Serious enough for athletes, open to complete beginners."
        breadcrumb={[
          { name: "Home", path: "/" },
          { name: "Why 9th Round", path: "/about" },
        ]}
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="u-prose">
            <SectionHead eyebrow="The idea" title="A workout with a shape" />
            <p className="mt-4 text-ash">
              Most gym sessions are whatever you make them. 9th Round has a structure: nine stations, three minutes each,
              roughly thirty minutes of work. Warm-up, strength, boxing, kickboxing, core and conditioning — in order,
              every time.
            </p>
            <p className="mt-4 text-ash">
              There are no booked class slots. You walk in, start at any open station, and complete all nine. A coach is
              on the floor the whole time to teach the movement and correct your form. The last round is always core.
            </p>
          </div>
          <div className="u-prose">
            <SectionHead eyebrow="Who it's for" title="Come as you are" />
            <p className="mt-4 text-ash">
              You do not need boxing experience. The circuit is built so a first-timer and an experienced athlete can
              train the same session, each working at their own level, with the coach adjusting rounds on the spot.
            </p>
            <p className="mt-4 text-ash">
              It suits people who want to lose weight, get fit, relieve stress, learn to box, or simply train somewhere
              that isn&apos;t another treadmill. Men and women train together in the same format.
            </p>
          </div>
        </div>
      </Section>

      <RoundSystem />

      <Section tone="raised">
        <SectionHead
          eyebrow="Progression"
          title="A year with four phases"
          intro="The programming isn't the same session on repeat. Across a year it moves through four phases so the work keeps building."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map((p, i) => (
            <div key={p.name} className="rounded-card border border-white/10 bg-ink-850 p-6">
              <span className="font-display text-3xl font-bold text-blood">{String(i + 1).padStart(2, "0")}</span>
              <p className="mt-2 font-display text-lg uppercase tracking-wide text-bone">{p.name}</p>
              <p className="text-xs uppercase tracking-wider text-ash/70">{p.months}</p>
              <p className="mt-2 text-sm text-ash">{p.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-ash">
          Progress is checked with simple monthly markers — max push-ups, plank hold, a 30-second jab count — so you can
          see what&apos;s changing.
        </p>
      </Section>

      <CtaBand />
    </>
  );
}
