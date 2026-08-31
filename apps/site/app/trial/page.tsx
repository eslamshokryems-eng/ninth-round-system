import type { Metadata } from "next";
import { Container } from "../../src/components/container";
import { TrialForm } from "../../src/components/trial-form";

export const metadata: Metadata = {
  title: "Book a Free Trial",
  description: "Book your free trial session at 9th Round Egypt.",
};

export default function TrialPage() {
  return (
    <Container className="max-w-2xl py-16">
      <h1 className="text-center text-3xl font-bold sm:text-4xl">Try Your First Session Free</h1>
      <p className="mt-4 text-center text-muted">
        Come as you are. Learn the fundamentals, feel the energy, and see what a real
        round feels like — no commitment required.
      </p>

      <div className="mt-10">
        <TrialForm />
      </div>
    </Container>
  );
}
