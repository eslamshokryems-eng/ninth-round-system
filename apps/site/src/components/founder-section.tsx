"use client";

import Image from "next/image";
import { Container } from "./container";
import { useLanguage } from "../i18n/language-provider";
import { FOUNDER_CREDENTIALS } from "../data/founder";

export function FounderSection() {
  const { dict, locale } = useLanguage();
  const f = dict.founder;

  return (
    <section className="border-t border-bone/10 bg-black py-16 text-bone">
      <Container>
        <p className="text-xs font-bold uppercase tracking-wide text-red">{f.eyebrow}</p>
        <h2 className="mt-2 max-w-2xl font-display text-3xl uppercase leading-tight sm:text-4xl">{f.headline}</h2>

        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-16">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-card lg:mx-0">
            <Image src="/founder/islam-shokry.jpg" alt={f.imageAlt} fill sizes="(min-width: 1024px) 400px, 90vw" className="object-cover" />
          </div>

          <div>
            <h3 className="font-condensed text-2xl font-bold uppercase">{f.name}</h3>
            <p className="mt-1 text-sm font-bold uppercase tracking-wide text-red">{f.title}</p>

            <div className="mt-6 max-w-xl space-y-4 text-grey">
              {f.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <p className="mt-6 font-condensed text-lg font-bold uppercase text-bone">{f.experienceStat}</p>

            <div className="mt-8">
              <p className="text-xs font-bold uppercase tracking-wide text-grey">{f.credentialsHeading}</p>
              <ul className="mt-4 space-y-4 border-s border-bone/15 ps-4">
                {FOUNDER_CREDENTIALS.map((credential) => (
                  <li key={credential.year}>
                    <span className="font-condensed text-sm font-bold text-red">{credential.year}</span>
                    <p className="text-sm text-bone">{credential.title[locale]}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
