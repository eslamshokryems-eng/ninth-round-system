import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { Faq } from "@/components/faq";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink } from "@/components/contact-links";
import { FaqJsonLd, BreadcrumbJsonLd } from "@/components/json-ld";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * A standalone FAQ page exists for search, not for the homepage: these
 * questions ("do I need experience", "what should I bring") are typed into
 * Google verbatim, and a dedicated URL with FAQ structured data is what
 * competes for them. The same answers still appear inline on the homepage
 * and memberships page — one source, three surfaces.
 */

const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).faq;
  return pageMetadata({
    title: t.pageEyebrow,
    description: t.metaDescription,
    path: "/faq",
    lang: params.lang,
  });
}

export default function FaqPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.faq, path: href(lang, "/faq") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <FaqJsonLd lang={lang} />
      <PageHero
        lang={lang}
        eyebrow={t.faq.pageEyebrow}
        title={t.faq.pageTitle}
        intro={t.faq.pageIntro}
        breadcrumb={trail}
      />

      <Faq lang={lang} eyebrow={t.faq.eyebrow} title={t.faq.title} />

      <Section tone="raised">
        <SectionHead eyebrow={t.nav.contact} title={t.faq.stillAsking} intro={t.faq.stillAskingBody} />
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={href(lang, "/trial")} size="lg">
            {t.cta.trial}
          </ButtonLink>
          <WhatsAppLink lang={lang} message="general" context="faq_page" className={outlineBtn}>
            {t.cta.whatsapp}
          </WhatsAppLink>
        </div>
      </Section>
    </>
  );
}
