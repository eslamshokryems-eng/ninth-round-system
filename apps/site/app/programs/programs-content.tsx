"use client";

import { Container } from "../../src/components/container";
import { PrimaryCta } from "../../src/components/cta-buttons";
import { PROGRAMS } from "../../src/data/programs";
import { useLanguage } from "../../src/i18n/language-provider";

export function ProgramsContent() {
  const { dict, locale } = useLanguage();

  return (
    <Container className="py-16">
      <h1 className="font-display text-4xl uppercase text-bone sm:text-5xl">{dict.programs.pageTitle}</h1>
      <p className="mt-4 max-w-2xl text-grey">{dict.programs.pageDescription}</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PROGRAMS.map((program) => (
          <div key={program.slug} className="rounded-card border border-bone/15 p-6">
            <h2 className="font-condensed text-xl font-bold uppercase text-bone">{program.name[locale]}</h2>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-red">{program.tagline[locale]}</p>
            <p className="mt-3 text-sm text-grey">{program.description[locale]}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <PrimaryCta href="/trial">{dict.trialCta.cta}</PrimaryCta>
      </div>
    </Container>
  );
}
