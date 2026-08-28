import type { Metadata } from "next";
import { Section } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ProgramCard } from "@/components/program-card";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PROGRAMS } from "@/content/programs";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Programs",
  description:
    "Boxing, kickboxing, the 9-round conditioning circuit, personal training and junior sessions — all coached, all built on the same round-based format.",
  path: "/programs",
});

export default function ProgramsPage() {
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Home", path: "/" }, { name: "Programs", path: "/programs" }]} />
      <PageHero
        eyebrow="Programs"
        title="One format. Several ways in."
        intro="Everything runs on the same coached, round-based idea — pick the emphasis that fits your goal."
        breadcrumb={[
          { name: "Home", path: "/" },
          { name: "Programs", path: "/programs" },
        ]}
      />
      <Section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PROGRAMS.map((p) => (
            <ProgramCard key={p.slug} program={p} />
          ))}
        </div>
      </Section>
      <CtaBand />
    </>
  );
}
