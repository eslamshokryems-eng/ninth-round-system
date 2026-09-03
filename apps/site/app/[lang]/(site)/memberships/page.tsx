import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { MembershipOptions } from "@/components/membership-options";
import { Faq } from "@/components/faq";
import { FaqJsonLd, BreadcrumbJsonLd } from "@/components/json-ld";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).memberships;
  return pageMetadata({
    title: t.eyebrow,
    description: t.metaDescription,
    path: "/memberships",
    lang: params.lang,
  });
}

export default function MembershipsPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.memberships, path: href(lang, "/memberships") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.memberships.eyebrow}
        title={t.memberships.title}
        intro={t.memberships.intro}
        breadcrumb={trail}
      />
      <Section>
        <SectionHead eyebrow={t.memberships.optionsEyebrow} title={t.memberships.optionsTitle} />
        <div className="mt-10">
          <MembershipOptions lang={lang} />
        </div>
      </Section>
      <Faq lang={lang} />
      <FaqJsonLd lang={lang} />
    </>
  );
}
