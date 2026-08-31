import type { Metadata } from "next";
import { Container } from "../../src/components/container";
import { PlaceholderTag } from "../../src/components/placeholder-tag";
import { COACHES } from "../../src/data/coaches";

export const metadata: Metadata = {
  title: "Coaches",
  description: "Meet the coaching team at 9th Round Egypt.",
};

export default function CoachesPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Coaches</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Real coaching, real technique. This page is ready for real coach profiles — none
        have been supplied yet.
      </p>
      <div className="mt-3">
        <PlaceholderTag label="real coach names, bios, and photos needed" />
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {COACHES.map((coach) => (
          <div key={coach.id} className="rounded-card border border-white/10 bg-surface p-6">
            <div className="h-20 w-20 rounded-full border border-white/10 bg-bg" />
            <h2 className="mt-4 text-lg font-semibold text-ink">{coach.name}</h2>
            <p className="text-sm text-muted">{coach.role}</p>
            <p className="mt-3 text-sm text-muted">{coach.bio}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
