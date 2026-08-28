import type { Metadata } from "next";
import { Container } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { site } from "@/content/site.config";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy",
  description: "How 9th Round handles the information you submit through this website.",
  path: "/privacy",
});

/**
 * PLACEHOLDER privacy note. 9th Round must review and finalise this text
 * with whatever legal wording it needs before launch (see README →
 * "Content required"). It describes only what this website actually does.
 */
export default function PrivacyPage() {
  return (
    <>
      <PageHero eyebrow="Legal" title="Privacy note" />
      <Container>
        <div className="u-prose prose-invert max-w-prose py-14 text-ash [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-bone [&_p]:mt-3">
          <p className="rounded-lg border border-dashed border-white/15 bg-ink-850 p-4 text-sm">
            Draft wording — to be reviewed and finalised by {site.legalName} before launch.
          </p>

          <h2>What we collect</h2>
          <p>
            When you submit the trial form, we collect the details you enter: your name, phone number, and optionally your
            email, preferred program, preferred date and time, and any notes. We also record that the request came from
            this website.
          </p>

          <h2>Why we collect it</h2>
          <p>
            We use these details only to contact you about your trial and to answer your enquiry. Your request is added to
            our internal customer-management system so our team can follow up with you.
          </p>

          <h2>Who can see it</h2>
          <p>
            Your details are visible only to authorised {site.legalName} staff. We do not sell your data or share it with
            unrelated third parties.
          </p>

          <h2>Analytics</h2>
          <p>
            This site may use privacy-respecting analytics to understand how pages are used. Analytics data does not
            include your name, phone number, or email.
          </p>

          <h2>Your choices</h2>
          <p>
            To ask what information we hold about you, or to have it removed, contact us using the details on the Contact
            page.
          </p>
        </div>
      </Container>
    </>
  );
}
