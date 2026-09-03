import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { RoundSystem } from "@/components/round-system";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang);
  return pageMetadata({
    title: t.about.eyebrow,
    description: t.about.metaDescription,
    path: "/about",
    lang: params.lang,
  });
}

export default function AboutPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.about.eyebrow, path: href(lang, "/about") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.about.eyebrow}
        title={t.about.title}
        intro={t.about.intro}
        breadcrumb={trail}
      />

      <Section>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="u-prose">
            <SectionHead eyebrow={t.about.ideaEyebrow} title={t.about.ideaTitle} />
            <p className="mt-4 text-ash">{t.about.ideaP1}</p>
            <p className="mt-4 text-ash">{t.about.ideaP2}</p>
          </div>
          <div className="u-prose">
            <SectionHead eyebrow={t.about.whoEyebrow} title={t.about.whoTitle} />
            <p className="mt-4 text-ash">{t.about.whoP1}</p>
            <p className="mt-4 text-ash">{t.about.whoP2}</p>
          </div>
        </div>
      </Section>

      <RoundSystem lang={lang} />

      <Section tone="raised">
        <SectionHead
          eyebrow={t.about.phasesEyebrow}
          title={t.about.phasesTitle}
          intro={t.about.phasesIntro}
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.about.phases.map((p, i) => (
            <div key={p.name} className="rounded-card border border-white/10 bg-ink-850 p-6">
              <span dir="ltr" className="font-display text-3xl font-bold text-blood">
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="mt-2 font-display text-lg uppercase tracking-wide text-bone">{p.name}</p>
              <p className="text-xs uppercase tracking-wider text-ash/70">{p.months}</p>
              <p className="mt-2 text-sm text-ash">{p.detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-ash">{t.about.phasesNote}</p>
      </Section>

      <CtaBand lang={lang} />
    </>
  );
}
