import type { Metadata } from "next";
import { Container } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import type { Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * PLACEHOLDER terms. 9th Round to finalise before launch (see README).
 */

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).legal;
  return pageMetadata({
    title: t.termsTitle,
    description: t.termsMeta,
    path: "/terms",
    lang: params.lang,
  });
}

export default function TermsPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);

  return (
    <>
      <PageHero lang={lang} eyebrow={t.nav.legal} title={t.legal.termsTitle} />
      <Container>
        <div className="u-prose max-w-prose py-14 text-ash">
          <p className="rounded-lg border border-dashed border-white/15 bg-ink-850 p-4 text-sm">
            {t.legal.draftNoticePrefix} {site.legalName[lang]} {t.legal.draftNoticeSuffix}
          </p>

          {t.legal.terms.map((s) => (
            <section key={s.h}>
              <h2 className="mt-8 font-display text-lg uppercase tracking-wide text-bone">{s.h}</h2>
              <p className="mt-3">{s.p}</p>
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
