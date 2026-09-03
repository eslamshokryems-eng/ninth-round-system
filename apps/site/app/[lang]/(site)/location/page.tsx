import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink, CallLink } from "@/components/contact-links";
import { CtaBand } from "@/components/cta-band";
import { LocalBusinessJsonLd, BreadcrumbJsonLd } from "@/components/json-ld";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * Location owns the club's physical facts — address, map, hours, what to
 * bring — and carries the LocalBusiness structured data, which is the
 * page Google should rank for "boxing gym near me" style queries.
 * Nothing here is invented: an unconfirmed address renders as an honest
 * "message us for the pin", never a plausible-looking street.
 */

const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).location;
  return pageMetadata({
    title: t.title,
    description: t.metaDescription,
    path: "/location",
    lang: params.lang,
  });
}

export default function LocationPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const c = site.contact;
  const hasAddress = Boolean(c.addressLine);
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.location, path: href(lang, "/location") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <LocalBusinessJsonLd lang={lang} />
      <PageHero
        lang={lang}
        eyebrow={t.location.eyebrow}
        title={t.location.title}
        intro={t.location.intro}
        breadcrumb={trail}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <dl className="space-y-5 text-sm">
              {hasAddress ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">{t.location.addressTitle}</dt>
                  <dd className="mt-1 text-lg text-bone">
                    {c.addressLine ? c.addressLine[lang] : null}
                    {c.city ? `${lang === "ar" ? "، " : ", "}${c.city[lang]}` : ""}
                  </dd>
                </div>
              ) : null}
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
              {c.openingHours.length > 0 ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">{t.location.hoursTitle}</dt>
                  <dd className="mt-2 space-y-1 text-bone">
                    {c.openingHours.map((o) => (
                      <p key={o.day.en} className="flex items-baseline justify-between gap-4 max-w-xs">
                        <span className="text-ash">{o.day[lang]}</span>
                        <span dir="ltr" className="font-mono">
                          {o.hours}
                        </span>
                      </p>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>

            {!hasAddress ? (
              <div className="rounded-card border border-dashed border-white/15 bg-ink-850 p-5">
                <p className="text-sm text-ash">{t.location.pending}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <WhatsAppLink lang={lang} message="general" context="location_page" className={outlineBtn}>
                    {t.cta.whatsapp}
                  </WhatsAppLink>
                  <CallLink lang={lang} context="location_page" className={outlineBtn}>
                    {t.cta.call}
                  </CallLink>
                </div>
              </div>
            ) : (
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href={href(lang, "/trial")} size="lg">
                  {t.cta.trial}
                </ButtonLink>
                <WhatsAppLink lang={lang} message="general" context="location_page" className={outlineBtn}>
                  {t.cta.whatsapp}
                </WhatsAppLink>
              </div>
            )}
          </div>

          <div>
            {c.mapsUrl ? (
              <a
                href={c.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex aspect-[4/3] items-center justify-center rounded-card border border-white/10 bg-ink-850 text-sm text-ash transition-colors hover:border-white/30"
              >
                {t.cta.maps}
              </a>
            ) : (
              <div className="flex aspect-[4/3] items-end rounded-card border border-dashed border-white/15 bg-ink-850 p-5">
                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ash/50">
                  {t.location.mapPending}
                </span>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section tone="raised">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow={t.location.eyebrow} title={t.location.firstVisitTitle} />
            <p className="mt-4 max-w-prose text-ash">{t.location.firstVisitBody}</p>
          </div>
          <div className="rounded-card border border-white/10 bg-ink-850 p-6">
            <h2 className="font-display text-lg uppercase tracking-wide text-bone">{t.location.bringTitle}</h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {t.location.bring.map((b) => (
                <li key={b} className="rounded-pill border border-white/15 px-3 py-1 text-sm text-ash">
                  {b}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm text-ash">{t.location.bringNote}</p>
          </div>
        </div>
      </Section>

      <CtaBand lang={lang} />
    </>
  );
}
