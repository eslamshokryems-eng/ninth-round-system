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
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  return pageMetadata({
    title: site.name,
    description: site.shortDescription[params.lang],
    path: "/",
    lang: params.lang,
  });
}

export default function HomePage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const coach = site.coaches[0];

  return (
    <>
      <Hero lang={lang} />

      <div className="border-b border-white/10 bg-ink-900">
        <div className="u-wrap flex flex-wrap items-center gap-x-8 gap-y-2 py-4 font-mono text-xs uppercase tracking-widest text-ash">
          {t.ticker.map((item, i) => (
            <span key={item} className="flex items-center gap-8">
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              {item}
            </span>
          ))}
        </div>
      </div>

      <Pillars lang={lang} />

      <Section>
        <SectionHead
          eyebrow={t.homeSections.programsEyebrow}
          title={t.homeSections.programsTitle}
          intro={t.homeSections.programsIntro}
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((p) => (
            <ProgramCard key={p.slug} program={p} lang={lang} />
          ))}
        </div>
      </Section>

      <RoundSystem lang={lang} />
      <HowItWorks lang={lang} />

      {coach ? (
        <Section>
          <SectionHead eyebrow={t.homeSections.coachingEyebrow} title={t.homeSections.coachingTitle} />
          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:items-center">
            <CoachCard coach={coach} lang={lang} />
            <div>
              <p className="max-w-prose text-ash">{t.homeSections.coachingBody}</p>
              <div className="mt-6">
                <ButtonLink href={href(lang, "/coaches")} variant="outline">
                  {t.cta.meetTeam}
                </ButtonLink>
              </div>
            </div>
          </div>
        </Section>
      ) : null}

      <Section tone="raised">
        <SectionHead
          eyebrow={t.homeSections.membershipsEyebrow}
          title={t.homeSections.membershipsTitle}
          intro={t.homeSections.membershipsIntro}
        />
        <div className="mt-10">
          <MembershipOptions lang={lang} />
        </div>
      </Section>

      <Gallery lang={lang} limit={6} />
      <Testimonials lang={lang} />
      <Faq lang={lang} />
      <FaqJsonLd lang={lang} />
      <CtaBand lang={lang} />
    </>
  );
}
