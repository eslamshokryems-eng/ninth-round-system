import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink } from "@/components/contact-links";

export function CtaBand({
  title = "Come as you are. Learn. Train.",
  subtitle = "Your first session is a trial. Book it in under a minute.",
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="bg-blood text-white">
      <Container className="flex flex-col items-start gap-6 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="text-3xl uppercase tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-3 text-white/85">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href="/trial"
            size="lg"
            className="bg-white text-ink-950 hover:bg-white/90 focus-visible:outline-white"
          >
            Book a trial
          </ButtonLink>
          <WhatsAppLink
            message="trial"
            context="cta_band"
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/50 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-white transition-colors hover:bg-white/10"
          >
            WhatsApp us
          </WhatsAppLink>
        </div>
      </Container>
    </section>
  );
}
