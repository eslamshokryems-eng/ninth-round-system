import type { Metadata } from "next";
import { Section } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { CoachCard } from "@/components/coach-card";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).coaches;
  return pageMetadata({
    title: t.eyebrow,
    description: t.metaDescription,
    path: "/coaches",
    lang: params.lang,
  });
}

export default function CoachesPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.coaches, path: href(lang, "/coaches") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.coaches.eyebrow}
        title={t.coaches.title}
        intro={t.coaches.intro}
        breadcrumb={trail}
      />
      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {site.coaches.map((c) => (
            <CoachCard key={c.name.en} coach={c} lang={lang} />
          ))}
        </div>
        <p className="mt-8 max-w-prose text-sm text-ash">{t.coaches.more}</p>
      </Section>
      <CtaBand lang={lang} />
    </>
  );
}
