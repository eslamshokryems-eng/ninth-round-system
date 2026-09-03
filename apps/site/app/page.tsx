"use client";

import Image from "next/image";
import Link from "next/link";
import { Container } from "../src/components/container";
import { PrimaryCta, SecondaryCta } from "../src/components/cta-buttons";
import { PackagesTable } from "../src/components/packages-table";
import { CONTACT } from "../src/data/contact";
import { PROGRAMS } from "../src/data/programs";
import { COACHES } from "../src/data/coaches";
import { useLanguage } from "../src/i18n/language-provider";

export default function HomePage() {
  const { dict, locale } = useLanguage();

  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden border-b border-bone/10">
        <div className="absolute inset-0">
          <Image
            src="/gym/gym-floor-wide.jpg"
            alt={dict.hero.imageAlt}
            fill
            priority
            className="object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
        </div>
        <Container className="relative py-24 text-center sm:py-32">
          <p className="font-condensed text-sm font-bold uppercase tracking-[0.3em] text-red">{dict.hero.kicker}</p>
          <h1 className="mx-auto mt-4 max-w-3xl font-display text-5xl uppercase leading-none tracking-tight text-bone sm:text-7xl">
            {dict.hero.headline}
          </h1>
          <p className="mx-auto mt-5 max-w-xl font-condensed text-lg text-bone/90 sm:text-xl">{dict.hero.sub}</p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta href="/trial">{dict.hero.ctaPrimary}</PrimaryCta>
            <SecondaryCta href="/programs">{dict.hero.ctaSecondary}</SecondaryCta>
          </div>
        </Container>
      </section>

      {/* 2. Why */}
      <section className="border-b border-bone/10 bg-bone py-16 text-black">
        <Container className="text-center">
          <h2 className="font-display text-3xl uppercase text-black sm:text-4xl">{dict.why.heading}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-black/70">{dict.why.body}</p>
        </Container>
      </section>

      {/* 3. How It Works — 9 stations */}
      <section className="border-b border-bone/10 py-16">
        <Container>
          <div className="text-center">
            <h2 className="font-display text-3xl uppercase text-bone sm:text-4xl">{dict.howItWorks.heading}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-grey">{dict.howItWorks.body}</p>
          </div>

          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-3 sm:grid-cols-9">
            {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                className="flex aspect-square items-center justify-center rounded-card border border-bone/15 bg-black"
              >
                <span className="font-display text-2xl text-red sm:text-3xl">{n}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center font-condensed text-xs uppercase tracking-[0.2em] text-grey">
            {dict.howItWorks.stations}
          </p>
        </Container>
      </section>

      {/* 4. Programs preview */}
      <section className="border-b border-bone/10 bg-bone py-16 text-black">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl uppercase text-black sm:text-4xl">{dict.programs.heading}</h2>
            <Link
              href="/programs"
              className="inline-flex items-center justify-center rounded-pill border border-black/30 px-6 py-3 text-sm font-bold uppercase tracking-wide text-black transition-colors hover:border-black"
            >
              {dict.programs.seeAll}
            </Link>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {PROGRAMS.map((program) => (
              <div key={program.slug} className="rounded-card border border-black/10 bg-black/5 p-4">
                <h3 className="font-condensed text-base font-bold uppercase text-black">{program.name[locale]}</h3>
                <p className="mt-1 text-xs text-black/60">{program.tagline[locale]}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 5. Packages */}
      <section className="border-b border-bone/10 py-16">
        <Container>
          <div className="text-center">
            <h2 className="font-display text-3xl uppercase text-bone sm:text-4xl">{dict.packages.heading}</h2>
            <p className="mx-auto mt-3 max-w-xl text-grey">{dict.packages.sub}</p>
          </div>
          <div className="mt-10">
            <PackagesTable />
          </div>
        </Container>
      </section>

      {/* 6. Coaches preview */}
      <section className="border-b border-bone/10 py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl uppercase text-bone sm:text-4xl">{dict.coaches.heading}</h2>
            <SecondaryCta href="/coaches">{dict.coaches.seeAll}</SecondaryCta>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {COACHES.map((coach) => (
              <div key={coach.id} className="rounded-card border border-bone/15 p-5 text-center">
                <div className="mx-auto h-20 w-20 rounded-full border border-bone/20 bg-bone/5" />
                <p className="mt-4 font-condensed text-base font-bold uppercase text-bone">{coach.name[locale]}</p>
                <p className="text-sm text-grey">{coach.role[locale]}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 7. Trial CTA */}
      <section className="relative overflow-hidden border-b border-bone/10 py-20 text-center">
        <div className="absolute inset-0">
          <Image src="/gym/gym-ring.jpg" alt="" fill className="object-cover opacity-30" />
          <div className="absolute inset-0 bg-black/70" />
        </div>
        <Container className="relative">
          <h2 className="font-display text-3xl uppercase text-bone sm:text-4xl">{dict.trialCta.heading}</h2>
          <p className="mx-auto mt-3 max-w-xl text-bone/80">{dict.trialCta.body}</p>
          <div className="mt-6 flex justify-center">
            <PrimaryCta href="/trial">{dict.trialCta.cta}</PrimaryCta>
          </div>
        </Container>
      </section>

      {/* 8. Location / Contact */}
      <section className="py-16">
        <Container>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="font-display text-lg uppercase text-bone">{dict.location.heading}</h2>
              <p className="mt-2 text-grey">{CONTACT.addressLine}</p>
              <a
                href={CONTACT.mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-bold text-red hover:text-red/80"
              >
                {dict.location.getDirections} →
              </a>
            </div>
            <div>
              <h2 className="font-display text-lg uppercase text-bone">{dict.location.contactHeading}</h2>
              <p className="mt-2 text-grey">
                {dict.location.whatsapp} — {CONTACT.whatsappDisplay}
              </p>
              <p className="text-grey">
                {dict.location.phone} — {CONTACT.phoneDisplay}
              </p>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
