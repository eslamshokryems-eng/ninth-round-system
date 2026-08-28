import type { Metadata } from "next";
import { Container } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { site } from "@/content/site.config";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms",
  description: "Terms for using the 9th Round website.",
  path: "/terms",
});

/**
 * PLACEHOLDER terms. 9th Round to finalise before launch (see README).
 */
export default function TermsPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Website terms" />
      <Container>
        <div className="u-prose max-w-prose py-14 text-ash [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-bone [&_p]:mt-3">
          <p className="rounded-lg border border-dashed border-white/15 bg-ink-850 p-4 text-sm">
            Draft wording — to be reviewed and finalised by {site.legalName} before launch.
          </p>

          <h2>Using this site</h2>
          <p>
            This website provides information about {site.legalName} and lets you request a trial session. Submitting a
            request does not confirm a booking — our team will contact you to arrange a time.
          </p>

          <h2>Accuracy</h2>
          <p>
            We keep the information here as accurate as we can. Programs, schedules and pricing can change; contact us to
            confirm current details.
          </p>

          <h2>Contact</h2>
          <p>Questions about these terms can be sent to us via the Contact page.</p>
        </div>
      </Container>
    </>
  );
}
