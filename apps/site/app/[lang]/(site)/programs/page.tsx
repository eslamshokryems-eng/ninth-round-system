import type { Metadata } from "next";
import { Section } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ProgramCard } from "@/components/program-card";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PROGRAMS } from "@/content/programs";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).programsPage;
  return pageMetadata({
    title: t.eyebrow,
    description: t.metaDescription,
    path: "/programs",
    lang: params.lang,
  });
}

export default function ProgramsPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.programs, path: href(lang, "/programs") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.programsPage.eyebrow}
        title={t.programsPage.title}
        intro={t.programsPage.intro}
        breadcrumb={trail}
      />
      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((p) => (
            <ProgramCard key={p.slug} program={p} lang={lang} />
          ))}
        </div>
      </Section>
      <CtaBand lang={lang} />
    </>
  );
}
