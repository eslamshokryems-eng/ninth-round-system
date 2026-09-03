import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink } from "@/components/contact-links";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { SESSIONS, GROUPS, SESSION_BADGE_LABELS, formatTime } from "@/content/schedule";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * The single question every lead asks first. It answers the format
 * honestly ("the circuit has no timetable") and lists only times the club
 * has actually confirmed — an unconfirmed session time here is a wasted
 * trip and a lost member.
 */

const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).schedule;
  return pageMetadata({
    title: t.title,
    description: t.metaDescription,
    path: "/schedule",
    lang: params.lang,
  });
}

export default function SchedulePage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const hours = site.contact.openingHours;
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.schedule, path: href(lang, "/schedule") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.schedule.eyebrow}
        title={t.schedule.title}
        intro={t.schedule.intro}
        breadcrumb={trail}
      />

      {/* The circuit — no timetable, by design. */}
      <Section>
        <div className="grid gap-10 lg:grid-cols-[1fr_minmax(0,340px)]">
          <div className="u-prose">
            <SectionHead eyebrow={t.schedule.openEyebrow} title={t.schedule.openTitle} />
            <p className="mt-4 text-ash">{t.schedule.openBody}</p>
            <div className="mt-6">
              <ButtonLink href={href(lang, "/trial")} size="lg">
                {t.cta.trial}
              </ButtonLink>
            </div>
          </div>

          <div className="rounded-card border border-white/10 bg-ink-900 p-6">
            <h2 className="font-display text-lg uppercase tracking-wide text-bone">{t.schedule.hoursTitle}</h2>
            {hours.length > 0 ? (
              <ul className="mt-4 space-y-1.5 text-sm">
                {hours.map((o) => (
                  <li key={o.day.en} className="flex items-baseline justify-between gap-4">
                    <span className="text-bone">{o.day[lang]}</span>
                    <span dir="ltr" className="font-mono text-ash">
                      {o.hours}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="mt-3 text-sm text-ash">{t.schedule.hoursPending}</p>
                <div className="mt-5">
                  <WhatsAppLink lang={lang} message="general" context="schedule_hours" className={outlineBtn}>
                    {t.cta.whatsapp}
                  </WhatsAppLink>
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* Fixed-time coached sessions. */}
      <Section tone="raised">
        <SectionHead
          eyebrow={t.schedule.sessionsEyebrow}
          title={t.schedule.sessionsTitle}
          intro={t.schedule.sessionsIntro}
        />
        {SESSIONS.length > 0 ? (
          <>
            <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SESSIONS.map((s) => (
                <li key={`${s.name.en}-${s.day.en}-${s.time}`} className="rounded-card border border-white/10 bg-ink-850 p-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-xl uppercase tracking-wide text-bone">{s.name[lang]}</h3>
                    {s.badge ? (
                      <span className="shrink-0 rounded-pill bg-blood px-2.5 py-0.5 text-[0.7rem] font-semibold text-white">
                        {SESSION_BADGE_LABELS[s.badge][lang]}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 font-mono text-sm text-blood-bright">
                    {s.day[lang]} · {formatTime(s.time, lang)}
                  </p>
                  {s.coach ? <p className="mt-1 text-sm text-ash">{s.coach[lang]}</p> : null}
                  {s.note ? <p className="mt-2 text-sm text-ash">{s.note[lang]}</p> : null}
                  {s.programSlug ? (
                    <a
                      href={href(lang, `/programs/${s.programSlug}`)}
                      className="mt-4 inline-block text-sm font-semibold text-blood-bright hover:underline"
                    >
                      {t.cta.learnMore}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-ash">{t.schedule.confirmNote}</p>
          </>
        ) : (
          <div className="mt-10 rounded-card border border-dashed border-white/15 bg-ink-850 p-6">
            <p className="max-w-prose text-sm text-ash">{t.schedule.sessionsPending}</p>
            <div className="mt-5">
              <WhatsAppLink lang={lang} message="general" context="schedule_sessions" className={outlineBtn}>
                {t.cta.whatsapp}
              </WhatsAppLink>
            </div>
          </div>
        )}
      </Section>

      {/* Training groups people can ask to join. */}
      <Section>
        <SectionHead eyebrow={t.schedule.groupsEyebrow} title={t.schedule.groupsTitle} intro={t.schedule.groupsIntro} />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <li key={g.label.en} className="rounded-card border border-white/10 bg-ink-850 p-6">
              <div className="flex items-baseline gap-3">
                <span dir="ltr" className="font-display text-3xl font-bold text-blood">
                  {formatTime(g.time, lang)}
                </span>
                <h3 className="font-display text-lg uppercase tracking-wide text-bone">{g.label[lang]}</h3>
              </div>
              <p className="mt-3 text-sm text-ash">{g.note[lang]}</p>
            </li>
          ))}
        </ul>
      </Section>

      <CtaBand lang={lang} />
    </>
  );
}
