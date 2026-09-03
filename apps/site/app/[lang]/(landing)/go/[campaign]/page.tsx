import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/primitives";
import { Logo } from "@/components/logo";
import { TrialForm } from "@/components/trial-form";
import { trialFormLabels } from "@/components/trial-form-labels";
import { WhatsAppLink, CallLink } from "@/components/contact-links";
import { CAMPAIGN_SLUGS, getCampaign } from "@/content/campaigns";
import { trialProgramOptions } from "@/content/programs";
import { dict } from "@/content/i18n";
import { LANGS, href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * Paid-traffic landing page. Structure follows the 9th Round ad model:
 * HOOK → OFFER → PROOF → CTA, and nothing else on the screen.
 *
 * `noindex` is deliberate. This page is written for a cold audience
 * arriving from an ad, not for search; letting it into the index would
 * put it in competition with /programs and /trial for the same queries
 * while showing a visitor copy that assumes they just clicked an ad.
 */

const outlineBtn =
  "inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5";

export function generateStaticParams() {
  return LANGS.flatMap((lang) => CAMPAIGN_SLUGS.map((campaign) => ({ lang, campaign })));
}

export function generateMetadata({ params }: { params: { lang: Lang; campaign: string } }): Metadata {
  const campaign = getCampaign(params.campaign);
  if (!campaign) return {};
  return pageMetadata({
    title: campaign.headline[params.lang],
    description: campaign.sub[params.lang],
    path: `/go/${campaign.slug}`,
    lang: params.lang,
    noindex: true,
  });
}

export default function LandingPage({ params }: { params: { lang: Lang; campaign: string } }) {
  const lang = params.lang;
  const campaign = getCampaign(params.campaign);
  if (!campaign) notFound();

  const t = dict(lang);

  return (
    <div className="min-h-screen bg-ink-950">
      {/* A logo, not a nav: identity without an exit. */}
      <header className="border-b border-white/10">
        <Container className="flex h-16 items-center">
          <Logo lang={lang} />
        </Container>
      </header>

      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1000px 460px at 70% -10%, rgba(228,20,27,0.30), transparent 62%), radial-gradient(800px 500px at 5% 110%, rgba(228,20,27,0.12), transparent 58%), #0B0B0C",
          }}
        />
        <Container className="relative py-14 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-16">
            <div>
              <span className="inline-block rounded-pill bg-blood px-4 py-1.5 font-display text-sm font-semibold uppercase tracking-wide text-white">
                {campaign.offer[lang]}
              </span>

              <h1 className="mt-6 max-w-2xl text-[clamp(2.25rem,7vw,4rem)] uppercase leading-[0.98] tracking-tight">
                {campaign.headline[lang]}
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ash">{campaign.sub[lang]}</p>

              <ul className="mt-8 space-y-3">
                {campaign.points[lang].map((p) => (
                  <li key={p} className="flex gap-3 text-bone">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blood" />
                    {p}
                  </li>
                ))}
              </ul>

              <p className="mt-8 font-mono text-xs uppercase tracking-widest text-ash/70">{t.landing.trustline}</p>

              <div className="mt-8 rounded-card border border-white/10 bg-ink-900/70 p-6">
                <h2 className="font-display text-base uppercase tracking-wide text-bone">{t.landing.stepsTitle}</h2>
                <ol className="mt-4 grid gap-4 sm:grid-cols-3">
                  {t.landing.steps.map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span dir="ltr" className="font-display text-2xl font-bold leading-none text-blood">
                        {i + 1}
                      </span>
                      <span className="text-sm text-ash">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="lg:sticky lg:top-8 lg:self-start">
              <div className="rounded-card border border-white/10 bg-ink-900 p-6 sm:p-8">
                <h2 className="font-display text-2xl uppercase tracking-wide text-bone">{t.landing.formTitle}</h2>
                <p className="mt-1 text-sm text-ash">{t.landing.formNote}</p>
                <div className="mt-6">
                  <TrialForm
                    lang={lang}
                    labels={trialFormLabels(lang)}
                    programOptions={trialProgramOptions(lang)}
                    defaultProgram={campaign.program ?? ""}
                    campaign={campaign.leadTag}
                    compact
                  />
                </div>

                <div className="mt-6 flex flex-wrap gap-3 border-t border-white/10 pt-6">
                  <WhatsAppLink
                    lang={lang}
                    message="trial"
                    context={`landing_${campaign.slug}`}
                    className={outlineBtn}
                  >
                    {t.cta.whatsapp}
                  </WhatsAppLink>
                  <CallLink lang={lang} context={`landing_${campaign.slug}`} className={outlineBtn}>
                    {t.cta.call}
                  </CallLink>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* The only way out, placed after the form rather than above it. */}
      <footer className="border-t border-white/10 py-8">
        <Container className="flex flex-wrap items-center justify-between gap-4 text-xs text-ash/70">
          <Link href={href(lang, "/")} className="hover:text-bone">
            {t.landing.backToSite}
          </Link>
          <Link href={href(lang, "/privacy")} className="hover:text-bone">
            {t.nav.privacy}
          </Link>
        </Container>
      </footer>
    </div>
  );
}
