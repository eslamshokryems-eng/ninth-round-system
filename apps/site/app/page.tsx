import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { Hero } from "@/components/hero";
import { Pillars } from "@/components/pillars";
import { RoundSystem } from "@/components/round-system";
import { HowItWorks } from "@/components/how-it-works";
import { ProgramCard } from "@/components/program-card";
import { Gallery } from "@/components/gallery";
import { Testimonials } from "@/components/testimonials";
import { Faq } from "@/components/faq";
import { CtaBand } from "@/components/cta-band";
import { MembershipOptions } from "@/components/membership-options";
import { CoachCard } from "@/components/coach-card";
import { ButtonLink } from "@/components/button";
import { FaqJsonLd } from "@/components/json-ld";
import { PROGRAMS } from "@/content/programs";
import { site } from "@/content/site.config";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "9th Round",
  description: site.shortDescription,
  path: "/",
});

export default function HomePage() {
  const coach = site.coaches[0];

  return (
    <>
      <Hero />

      <div className="border-b border-white/10 bg-ink-900">
        <div className="u-wrap flex flex-wrap gap-x-8 gap-y-2 py-4 font-mono text-xs uppercase tracking-widest text-ash">
          <span>9 rounds</span>
          <span aria-hidden="true">·</span>
          <span>30 minutes</span>
          <span aria-hidden="true">·</span>
          <span>No class times</span>
          <span aria-hidden="true">·</span>
          <span>Coach-led</span>
          <span aria-hidden="true">·</span>
          <span>All levels</span>
        </div>
      </div>

      <Pillars />

      <Section>
        <SectionHead
          eyebrow="Programs"
          title="Choose how you train"
          intro="One format, several ways in — from the group circuit to one-to-one coaching."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((p) => (
            <ProgramCard key={p.slug} program={p} />
          ))}
        </div>
      </Section>

      <RoundSystem />
      <HowItWorks />

      {coach ? (
        <Section>
          <SectionHead eyebrow="Coaching" title="Coached every round" />
          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-center">
            <CoachCard coach={coach} />
            <div>
              <p className="max-w-prose text-ash">
                Every session at 9th Round is led by a coach on the floor — not a screen. They teach the technique, watch
                your form, and scale each round to where you are.
              </p>
              <div className="mt-6">
                <ButtonLink href="/coaches" variant="outline">
                  Meet the team
                </ButtonLink>
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      <Section tone="raised">
        <SectionHead eyebrow="Memberships" title="Train on your terms" intro="Monthly to annual, plus personal training." />
        <div className="mt-10">
          <MembershipOptions compact />
        </div>
      </Section>

      <Gallery />
      <Testimonials />
      <Faq />
      <FaqJsonLd />
      <CtaBand />
    </>
  );
}
