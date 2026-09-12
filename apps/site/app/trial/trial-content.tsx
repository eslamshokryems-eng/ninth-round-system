"use client";

import { Container } from "../../src/components/container";
import { TrialForm } from "../../src/components/trial-form";
import { useLanguage } from "../../src/i18n/language-provider";

export function TrialContent() {
  const { dict } = useLanguage();

  return (
    <Container className="max-w-2xl py-16">
      <h1 className="text-center font-display text-4xl uppercase text-bone sm:text-5xl">{dict.trialCta.heading}</h1>
      <p className="mt-4 text-center text-grey">{dict.trialCta.body}</p>

      <div className="mt-10">
        <TrialForm />
      </div>
    </Container>
  );
}
