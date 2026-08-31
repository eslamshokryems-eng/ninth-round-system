import type { Metadata } from "next";
import { Container } from "../../src/components/container";
import { PrimaryCta } from "../../src/components/cta-buttons";
import { PlaceholderTag } from "../../src/components/placeholder-tag";
import { PROGRAMS } from "../../src/data/programs";

export const metadata: Metadata = {
  title: "Programs",
  description: "Boxing, kickboxing, fitness, and junior programs at 9th Round Egypt.",
};

export default function ProgramsPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Programs</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Every program runs through the same 9-station circuit philosophy — structured,
        efficient, and built for real results.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {PROGRAMS.map((program) => (
          <div key={program.slug} className="rounded-card border border-white/10 bg-surface p-6">
            <h2 className="text-lg font-semibold text-ink">{program.name}</h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-red-500">{program.tagline}</p>
            <p className="mt-3 text-sm text-muted">{program.description}</p>
            {program.isPlaceholder ? (
              <div className="mt-3">
                <PlaceholderTag label="details not yet confirmed" />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <PrimaryCta href="/trial">Book a Free Trial</PrimaryCta>
      </div>
    </Container>
  );
}
