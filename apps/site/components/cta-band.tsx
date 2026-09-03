import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink } from "@/components/contact-links";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";

export function CtaBand({ lang, title, subtitle }: { lang: Lang; title?: string; subtitle?: string }) {
  const t = dict(lang);

  return (
    <section className="bg-blood text-white">
      <Container className="flex flex-col items-start gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="text-3xl uppercase tracking-tight sm:text-4xl">{title ?? t.ctaBand.title}</h2>
          <p className="mt-3 text-white/85">{subtitle ?? t.ctaBand.subtitle}</p>
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
            message="trial"
            context="cta_band"
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/50 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
          >
            {t.cta.whatsapp}
          </WhatsAppLink>
        </div>
      </Container>
    </section>
  );
}
