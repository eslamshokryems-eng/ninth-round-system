import type { Metadata } from "next";
import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink } from "@/components/contact-links";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).thankYou;
  return pageMetadata({
    title: t.metaTitle,
    description: t.metaDescription,
    path: "/thank-you",
    lang: params.lang,
    noindex: true,
  });
}

export default function ThankYouPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);

  return (
    <Container>
      <div className="mx-auto max-w-2xl py-24 text-center">
        <p className="u-eyebrow">{t.thankYou.eyebrow}</p>
        <h1 className="mt-4 text-4xl uppercase tracking-tight sm:text-5xl">{t.thankYou.title}</h1>
        <p className="mt-4 text-lg text-ash">{t.thankYou.body}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <WhatsAppLink
            lang={lang}
            message="trial"
            context="thank_you"
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-blood px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-white hover:bg-blood-bright"
          >
            {t.cta.whatsappLong}
          </WhatsAppLink>
          <ButtonLink href={href(lang, "/programs")} variant="outline" size="lg">
            {t.cta.programs}
          </ButtonLink>
        </div>

        <div className="mt-12 rounded-card border border-white/10 bg-ink-900 p-6 text-start">
          <h2 className="font-display text-lg uppercase tracking-wide text-bone">{t.thankYou.bringTitle}</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {t.thankYou.bring.map((b) => (
              <li key={b} className="rounded-pill border border-white/15 px-3 py-1 text-sm text-ash">
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ash">{t.thankYou.bringNote}</p>
        </div>
      </div>
    </Container>
  );
}
