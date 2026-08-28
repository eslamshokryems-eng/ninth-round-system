import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { MembershipOptions } from "@/components/membership-options";
import { Faq } from "@/components/faq";
import { FaqJsonLd, BreadcrumbJsonLd } from "@/components/json-ld";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Memberships",
  description:
    "Monthly, quarterly, six-month and annual memberships at 9th Round, plus personal training. Start with a trial.",
  path: "/memberships",
});

export default function MembershipsPage() {
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Home", path: "/" }, { name: "Memberships", path: "/memberships" }]} />
      <PageHero
        eyebrow="Memberships"
        title="Train on your terms"
        intro="Options from one month to a full year, plus one-to-one personal training. Every membership includes the full 9-round circuit."
        breadcrumb={[
          { name: "Home", path: "/" },
          { name: "Memberships", path: "/memberships" },
        ]}
      />
      <Section>
        <SectionHead eyebrow="Options" title="Choose a commitment" />
        <div className="mt-10">
          <MembershipOptions />
        </div>
      </Section>
      <Faq />
      <FaqJsonLd />
    </>
  );
}
