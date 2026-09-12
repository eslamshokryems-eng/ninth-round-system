"use client";

import { Container } from "../../src/components/container";
import { COACHES } from "../../src/data/coaches";
import { useLanguage } from "../../src/i18n/language-provider";

export function CoachesContent() {
  const { dict, locale } = useLanguage();

  return (
    <Container className="py-16">
      <h1 className="font-display text-4xl uppercase text-bone sm:text-5xl">{dict.coaches.pageTitle}</h1>
      <p className="mt-4 max-w-2xl text-grey">{dict.coaches.pageDescription}</p>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {COACHES.map((coach) => (
          <div key={coach.id} className="rounded-card border border-bone/15 p-6 text-center">
            <div className="mx-auto h-24 w-24 rounded-full border border-bone/20 bg-bone/5" />
            <h2 className="mt-4 font-condensed text-lg font-bold uppercase text-bone">{coach.name[locale]}</h2>
            <p className="text-sm text-red">{coach.role[locale]}</p>
            <p className="mt-3 text-sm text-grey">{coach.achievement[locale]}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
