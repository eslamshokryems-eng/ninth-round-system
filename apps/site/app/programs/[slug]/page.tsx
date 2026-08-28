import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ButtonLink } from "@/components/button";
import { TrialForm } from "@/components/trial-form";
import { WhatsAppLink } from "@/components/contact-links";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { PROGRAMS, PROGRAM_SLUGS, getProgram } from "@/content/programs";
import { pageMetadata } from "@/lib/seo";

export function generateStaticParams() {
  return PROGRAM_SLUGS.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const program = getProgram(params.slug);
  if (!program) return {};
  return pageMetadata({
    title: program.name,
    description: program.short,
    path: `/programs/${program.slug}`,
  });
}

export default function ProgramPage({ params }: { params: { slug: string } }) {
  const program = getProgram(params.slug);
  if (!program) notFound();

  const others = PROGRAMS.filter((p) => p.slug !== program.slug).slice(0, 3);

  return (
    <>
      <BreadcrumbJsonLd
        trail={[
          { name: "Home", path: "/" },
          { name: "Programs", path: "/programs" },
          { name: program.name, path: `/programs/${program.slug}` },
        ]}
      />
      <PageHero
        eyebrow="Program"
        title={program.name}
        intro={program.short}
        breadcrumb={[
          { name: "Home", path: "/" },
          { name: "Programs", path: "/programs" },
          { name: program.name, path: `/programs/${program.slug}` },
        ]}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,380px)]">
          <div className="u-prose">
            <SectionHead eyebrow="What it is" title={`Training ${program.name.toLowerCase()} at 9th Round`} />
            <div className="mt-5 space-y-4 text-ash">
              {program.body.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            <h3 className="mt-10 font-display text-lg uppercase tracking-wide text-bone">Focus</h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {program.focus.map((f) => (
                <li key={f} className="rounded-pill border border-white/15 px-3 py-1 text-sm text-ash">
                  {f}
                </li>
              ))}
            </ul>

            <h3 className="mt-10 font-display text-lg uppercase tracking-wide text-bone">Who it&apos;s for</h3>
            <p className="mt-2 text-ash">{program.who}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/trial" size="lg">
                {program.ctaLabel}
              </ButtonLink>
              <WhatsAppLink
                message="trial"
                context={`program_${program.slug}`}
                className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-bone transition-colors hover:border-white/60 hover:bg-white/5"
              >
                WhatsApp us
              </WhatsAppLink>
            </div>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-card border border-white/10 bg-ink-900 p-6">
              <h2 className="font-display text-xl uppercase tracking-wide text-bone">Book a trial</h2>
              <p className="mt-1 text-sm text-ash">First session is a trial. We&apos;ll confirm a time with you.</p>
              <div className="mt-5">
                <TrialForm defaultProgram={program.trialValue} />
              </div>
            </div>
          </aside>
        </div>
      </Section>

      <Section tone="raised">
        <SectionHead eyebrow="Also train" title="Other programs" />
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {others.map((o) => (
            <Link
              key={o.slug}
              href={`/programs/${o.slug}`}
              className="rounded-card border border-white/10 bg-ink-850 p-5 transition-colors hover:border-white/30"
            >
              <p className="font-display uppercase tracking-wide text-bone">{o.name}</p>
              <p className="mt-1 text-sm text-ash">{o.who}</p>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
