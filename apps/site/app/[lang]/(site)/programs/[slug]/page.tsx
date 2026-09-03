import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ButtonLink } from "@/components/button";
import { TrialForm } from "@/components/trial-form";
import { trialFormLabels } from "@/components/trial-form-labels";
import { WhatsAppLink } from "@/components/contact-links";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PROGRAMS, PROGRAM_SLUGS, getProgram, trialProgramOptions } from "@/content/programs";
import { dict } from "@/content/i18n";
import { LANGS, href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return LANGS.flatMap((lang) => PROGRAM_SLUGS.map((slug) => ({ lang, slug })));
}

export function generateMetadata({ params }: { params: { lang: Lang; slug: string } }): Metadata {
  const program = getProgram(params.slug);
  if (!program) return {};
  return pageMetadata({
    title: program.name[params.lang],
    description: program.short[params.lang],
    path: `/programs/${program.slug}`,
    lang: params.lang,
  });
}

export default function ProgramPage({ params }: { params: { lang: Lang; slug: string } }) {
  const lang = params.lang;
  const program = getProgram(params.slug);
  if (!program) notFound();

  const t = dict(lang);
  const others = PROGRAMS.filter((p) => p.slug !== program.slug).slice(0, 3);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.programs, path: href(lang, "/programs") },
    { name: program.name[lang], path: href(lang, `/programs/${program.slug}`) },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.programPage.eyebrow}
        title={program.name[lang]}
        intro={program.short[lang]}
        breadcrumb={trail}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,380px)]">
          <div className="u-prose">
            <SectionHead eyebrow={t.programPage.whatEyebrow} title={t.programPage.whatTitle} />
            <div className="mt-5 space-y-4 text-ash">
              {program.body[lang].map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            <h3 className="mt-10 font-display text-lg uppercase tracking-wide text-bone">{t.programPage.focus}</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {program.focus[lang].map((f) => (
                <li key={f} className="rounded-pill border border-white/15 px-3 py-1 text-sm text-ash">
                  {f}
                </li>
              ))}
            </ul>

            <h3 className="mt-10 font-display text-lg uppercase tracking-wide text-bone">{t.programPage.who}</h3>
            <p className="mt-2 text-ash">{program.who[lang]}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={href(lang, "/trial")} size="lg">
                {program.ctaLabel[lang]}
              </ButtonLink>
              <WhatsAppLink
                lang={lang}
                message="trial"
                context={`program_${program.slug}`}
                className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5"
              >
                {t.cta.whatsapp}
              </WhatsAppLink>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-card border border-white/10 bg-ink-900 p-6">
              <h2 className="font-display text-xl uppercase tracking-wide text-bone">{t.programPage.trialTitle}</h2>
              <p className="mt-1 text-sm text-ash">{t.programPage.trialNote}</p>
              <div className="mt-5">
                <TrialForm
                  lang={lang}
                  labels={trialFormLabels(lang)}
                  programOptions={trialProgramOptions(lang)}
                  defaultProgram={program.trialValue}
                />
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHead eyebrow={t.programPage.othersEyebrow} title={t.programPage.othersTitle} />
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {others.map((o) => (
            <Link
              key={o.slug}
              href={href(lang, `/programs/${o.slug}`)}
              className="rounded-card border border-white/10 bg-ink-850 p-5 transition-colors hover:border-white/30"
            >
              <p className="font-display uppercase tracking-wide text-bone">{o.name[lang]}</p>
              <p className="mt-1 text-sm text-ash">{o.who[lang]}</p>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
