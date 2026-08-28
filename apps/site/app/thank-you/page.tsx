import type { Metadata } from "next";
import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink } from "@/components/contact-links";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Request received",
  description: "Your trial request has been received.",
  path: "/thank-you",
  noindex: true,
});

const BRING = ["Training clothes", "A towel", "Water"];

export default function ThankYouPage() {
  return (
    <Container>
      <div className="mx-auto max-w-2xl py-24 text-center">
        <p className="u-eyebrow">Trial request received</p>
        <h1 className="mt-4 text-4xl uppercase tracking-tight sm:text-5xl">We&apos;ve got it</h1>
        <p className="mt-4 text-lg text-ash">
          A coach from 9th Round will contact you to confirm a time. If you&apos;d like to sort it faster, message us
          directly.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <WhatsAppLink
            message="trial"
            context="thank_you"
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-blood px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-white hover:bg-blood-bright"
          >
            Message us on WhatsApp
          </WhatsAppLink>
          <ButtonLink href="/programs" variant="outline" size="lg">
            Explore programs
          </ButtonLink>
        </div>

        <div className="mt-12 rounded-card border border-white/10 bg-ink-900 p-6 text-left">
          <h2 className="font-display text-lg uppercase tracking-wide text-bone">What to bring</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {BRING.map((b) => (
              <li key={b} className="rounded-pill border border-white/15 px-3 py-1 text-sm text-ash">
                {b}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ash">
            Hand wraps and gloves are useful once you keep coming — you don&apos;t need your own kit for a first session.
          </p>
        </div>
      </div>
    </Container>
  );
}
