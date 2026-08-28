import type { Metadata } from "next";
import { Section } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { CoachCard } from "@/components/coach-card";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { site } from "@/content/site.config";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Coaches",
  description: "The coaches who run the floor at 9th Round — hands-on technique and conditioning coaching every round.",
  path: "/coaches",
});

export default function CoachesPage() {
  const coaches = site.coaches;

  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Home", path: "/" }, { name: "Coaches", path: "/coaches" }]} />
      <PageHero
        eyebrow="Coaches"
        title="Coached every round"
        intro="A coach is on the floor for every session — teaching the movement, correcting form, and scaling the work to you."
        breadcrumb={[
          { name: "Home", path: "/" },
          { name: "Coaches", path: "/coaches" },
        ]}
      />
      <Section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {coaches.map((c) => (
            <CoachCard key={c.name} coach={c} />
          ))}
        </div>
        <p className="mt-8 max-w-prose text-sm text-ash">
          More coach profiles are being added. To ask which coach runs a specific session, get in touch.
        </p>
      </Section>
      <CtaBand />
    </>
  );
}
