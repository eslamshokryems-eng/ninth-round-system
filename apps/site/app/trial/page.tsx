import type { Metadata } from "next";
import { Container } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { TrialForm } from "@/components/trial-form";
import { WhatsAppLink, CallLink } from "@/components/contact-links";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Book a trial",
  description: "Book your first session at 9th Round. Fill the form and the team will confirm a time with you.",
  path: "/trial",
});

const EXPECT = [
  "A short intro and a look around the floor",
  "A coach who sets you up and scales every round",
  "A full nine-round circuit — real intensity from day one",
  "A no-pressure chat afterwards about what fits your goal",
];

export default function TrialPage() {
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Home", path: "/" }, { name: "Book a trial", path: "/trial" }]} />
      <PageHero
        eyebrow="Trial"
        title="Book your first round"
        intro="Leave your details and a preferred time. The team follows up to confirm. Bring training clothes, a towel and water."
        breadcrumb={[
          { name: "Home", path: "/" },
          { name: "Book a trial", path: "/trial" },
        ]}
      />

      <section className="py-14 sm:py-20">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-16">
            <div className="rounded-card border border-white/10 bg-ink-900 p-6 sm:p-8">
              <TrialForm />
            </div>

            <div className="u-prose">
              <h2 className="font-display text-2xl uppercase tracking-wide text-bone">What to expect</h2>
              <ul className="mt-5 space-y-3">
                {EXPECT.map((e) => (
                  <li key={e} className="flex gap-3 text-ash">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blood" />
                    {e}
                  </li>
                ))}
              </ul>

              <h2 className="mt-10 font-display text-2xl uppercase tracking-wide text-bone">Rather message us?</h2>
              <p className="mt-3 text-ash">Ask a question or book over chat.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <WhatsAppLink
                  message="trial"
                  context="trial_page"
                  className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone hover:border-white/60 hover:bg-white/5"
                >
                  WhatsApp us
                </WhatsAppLink>
                <CallLink
                  context="trial_page"
                  className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-6 py-3 font-display text-sm font-semibold uppercase tracking-wide text-bone hover:border-white/60 hover:bg-white/5"
                >
                  Call us
                </CallLink>
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
