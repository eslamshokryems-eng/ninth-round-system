import type { Metadata } from "next";
import { Container } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { TrialForm } from "@/components/trial-form";
import { trialFormLabels } from "@/components/trial-form-labels";
import { WhatsAppLink, CallLink } from "@/components/contact-links";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { trialProgramOptions } from "@/content/programs";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone hover:border-white/60 hover:bg-white/5";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).trial;
  return pageMetadata({
    title: t.title,
    description: t.metaDescription,
    path: "/trial",
    lang: params.lang,
  });
}

export default function TrialPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.cta.trial, path: href(lang, "/trial") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.trial.eyebrow}
        title={t.trial.title}
        intro={t.trial.intro}
        breadcrumb={trail}
      />

      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
            <div className="rounded-card border border-white/10 bg-ink-900 p-6 sm:p-8">
              <TrialForm lang={lang} labels={trialFormLabels(lang)} programOptions={trialProgramOptions(lang)} />
            </div>

            <div className="u-prose">
              <h2 className="font-display text-2xl uppercase tracking-wide text-bone">{t.trial.expectTitle}</h2>
              <ul className="mt-5 space-y-3">
                {t.trial.expect.map((e) => (
                  <li key={e} className="flex gap-3 text-ash">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blood" />
                    {e}
                  </li>
                ))}
              </ul>

              <h2 className="mt-10 font-display text-2xl uppercase tracking-wide text-bone">{t.trial.ratherTitle}</h2>
              <p className="mt-3 text-ash">{t.trial.ratherBody}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <WhatsAppLink lang={lang} message="trial" context="trial_page" className={outlineBtn}>
                  {t.cta.whatsapp}
                </WhatsAppLink>
                <CallLink lang={lang} context="trial_page" className={outlineBtn}>
                  {t.cta.call}
                </CallLink>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
