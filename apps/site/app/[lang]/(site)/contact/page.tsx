import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink, CallLink } from "@/components/contact-links";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * Contact is about REACHING the club. The address, map, hours and "what to
 * bring" live on /location, so the two pages do not compete for the same
 * search query or drift out of sync with each other.
 */

const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).contact;
  return pageMetadata({
    title: t.eyebrow,
    description: t.metaDescription,
    path: "/contact",
    lang: params.lang,
  });
}

export default function ContactPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const c = site.contact;
  const hasDirectDetails = Boolean(process.env.NEXT_PUBLIC_PHONE_NUMBER || c.email);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.contact, path: href(lang, "/contact") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.contact.eyebrow}
        title={t.contact.title}
        intro={t.contact.intro}
        breadcrumb={trail}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow={t.contact.fastestEyebrow} title={t.contact.fastestTitle} />
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href={href(lang, "/trial")} size="lg">
                {t.cta.trial}
              </ButtonLink>
              <WhatsAppLink lang={lang} message="general" context="contact_page" className={outlineBtn}>
                {t.cta.whatsapp}
              </WhatsAppLink>
              <CallLink lang={lang} context="contact_page" className={outlineBtn}>
                {t.cta.call}
              </CallLink>
            </div>

            <dl className="mt-10 space-y-4 text-sm">
              {process.env.NEXT_PUBLIC_PHONE_NUMBER ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">{t.location.phoneTitle}</dt>
                  <dd dir="ltr" className="mt-1 text-start text-bone">
                    +{process.env.NEXT_PUBLIC_PHONE_NUMBER}
                  </dd>
                </div>
              ) : null}
              {c.email ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">{t.location.emailTitle}</dt>
                  <dd dir="ltr" className="mt-1 text-start text-bone">
                    {c.email}
                  </dd>
                </div>
              ) : null}
            </dl>

            {!hasDirectDetails ? (
              <p className="mt-8 rounded-card border border-dashed border-white/15 bg-ink-850 p-5 text-sm text-ash">
                {t.contact.pending}
              </p>
            ) : null}
          </div>

          <div className="rounded-card border border-white/10 bg-ink-900 p-6 sm:p-8">
            <h2 className="font-display text-xl uppercase tracking-wide text-bone">{t.location.title}</h2>
            <p className="mt-2 text-sm text-ash">{t.location.intro}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href={href(lang, "/location")} variant="outline">
                {t.nav.location}
              </ButtonLink>
              <ButtonLink href={href(lang, "/schedule")} variant="outline">
                {t.cta.seeSchedule}
              </ButtonLink>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
