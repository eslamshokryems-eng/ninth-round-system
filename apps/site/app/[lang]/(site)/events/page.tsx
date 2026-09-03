import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink } from "@/components/contact-links";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { upcomingEvents, pastEvents, AUDIENCE_LABELS, formatEventDate } from "@/content/events";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * Events are a retention and referral engine, not a news feed: a scored,
 * timed challenge gives existing members a reason to bring someone. The
 * page therefore leads with the FORMAT — which never changes and is worth
 * ranking for — and lists dates only once the club has confirmed them.
 */

const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).events;
  return pageMetadata({
    title: t.eyebrow,
    description: t.metaDescription,
    path: "/events",
    lang: params.lang,
  });
}

export default function EventsPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const upcoming = upcomingEvents();
  const past = pastEvents();
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.events, path: href(lang, "/events") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.events.eyebrow}
        title={t.events.title}
        intro={t.events.intro}
        breadcrumb={trail}
      />

      <Section>
        <SectionHead eyebrow={t.events.eyebrow} title={t.events.upcomingTitle} />
        {upcoming.length > 0 ? (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e) => (
              <li key={e.slug} className="flex flex-col rounded-card border border-white/10 bg-ink-850 p-6">
                <p className="font-mono text-sm text-blood-bright">{formatEventDate(e.date, lang)}</p>
                <h3 className="mt-2 font-display text-xl uppercase tracking-wide text-bone">{e.name[lang]}</h3>
                <p className="mt-2 flex-1 text-sm text-ash">{e.summary[lang]}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-pill border border-white/15 px-3 py-1 text-xs text-ash">
                    {AUDIENCE_LABELS[e.openTo][lang]}
                  </span>
                  {e.format ? (
                    <span className="rounded-pill border border-white/15 px-3 py-1 text-xs text-ash">
                      {e.format[lang]}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-10 rounded-card border border-dashed border-white/15 bg-ink-850 p-6">
            <p className="max-w-prose text-sm text-ash">{t.events.pending}</p>
            <div className="mt-5">
              <WhatsAppLink lang={lang} message="events" context="events_page" className={outlineBtn}>
                {t.cta.whatsapp}
              </WhatsAppLink>
            </div>
          </div>
        )}
      </Section>

      <Section tone="raised">
        <SectionHead eyebrow={t.events.formatEyebrow} title={t.events.formatTitle} intro={t.events.formatIntro} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.events.formatItems.map((item) => (
            <div key={item.title} className="rounded-card border border-white/10 bg-ink-850 p-6">
              <h3 className="font-display text-lg uppercase tracking-wide text-bone">{item.title}</h3>
              <p className="mt-2 text-sm text-ash">{item.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {past.length > 0 ? (
        <Section>
          <SectionHead eyebrow={t.events.eyebrow} title={t.events.upcomingTitle} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((e) => (
              <li key={e.slug} className="rounded-card border border-white/10 bg-ink-900 p-5 opacity-70">
                <p className="font-mono text-xs text-ash">{formatEventDate(e.date, lang)}</p>
                <p className="mt-1 font-display uppercase tracking-wide text-bone">{e.name[lang]}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section tone="blood">
        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl uppercase tracking-tight sm:text-4xl">{t.events.interestTitle}</h2>
            <p className="mt-3 text-white/85">{t.events.interestBody}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink
              href={href(lang, "/trial")}
              size="lg"
              className="bg-white text-ink-950 hover:bg-white/90 focus-visible:outline-white"
            >
              {t.cta.trial}
            </ButtonLink>
            <WhatsAppLink
              lang={lang}
              message="events"
              context="events_cta"
              className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/50 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
            >
              {t.cta.whatsapp}
            </WhatsAppLink>
          </div>
        </div>
      </Section>
    </>
  );
}
