"use client";

import { Container } from "../../src/components/container";
import { useLanguage } from "../../src/i18n/language-provider";

export function ClassesContent() {
  const { dict } = useLanguage();

  return (
    <Container className="py-16">
      <h1 className="font-display text-4xl uppercase text-bone sm:text-5xl">{dict.pages.classes.title}</h1>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-bone/15 p-6">
          <h2 className="font-condensed text-lg font-bold uppercase text-bone">{dict.pages.classes.openHours}</h2>
          <p className="mt-2 text-grey">{dict.pages.classes.openHoursValue}</p>
        </div>
        <div className="rounded-card border border-red/40 bg-red/5 p-6">
          <h2 className="font-condensed text-lg font-bold uppercase text-bone">{dict.pages.classes.classesHeading}</h2>
          <p className="mt-2 text-grey">{dict.pages.classes.classesValue}</p>
        </div>
      </div>
    </Container>
  );
}
