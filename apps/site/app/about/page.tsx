import type { Metadata } from "next";
import { Container } from "../../src/components/container";
import { PlaceholderTag } from "../../src/components/placeholder-tag";

export const metadata: Metadata = {
  title: "About",
  description: "About 9th Round Egypt — a structured combat-fitness circuit, not another gym class.",
};

export default function AboutPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">About 9th Round</h1>
      <p className="mt-6 max-w-2xl text-muted">
        9th Round is a structured combat-fitness concept combining boxing, kickboxing,
        functional fitness, strength &amp; conditioning, and combat-inspired circuit
        training. No classes. No waiting. Just action.
      </p>
      <p className="mt-4 max-w-2xl text-muted">
        Every session runs through 9 stations, roughly three minutes each — warm-up,
        strength, boxing, kickboxing, functional movement, core, and conditioning —
        combining into one complete, ~30-minute round. Beginners are welcome; no prior
        boxing experience is required.
      </p>

      <div className="mt-10 rounded-card border border-white/10 bg-surface p-6">
        <h2 className="text-lg font-semibold">Our Story</h2>
        <p className="mt-2 text-muted">PLACEHOLDER — founding story, timeline, and facility history not yet supplied.</p>
        <div className="mt-3">
          <PlaceholderTag label="brand story content needed" />
        </div>
      </div>
    </Container>
  );
}
