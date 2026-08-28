import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { ButtonLink } from "@/components/button";
import { WhatsAppLink, CallLink } from "@/components/contact-links";
import { LocalBusinessJsonLd, BreadcrumbJsonLd } from "@/components/json-ld";
import { site } from "@/content/site.config";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description: "Get in touch with 9th Round — book a trial, ask about memberships, or find the club.",
  path: "/contact",
});

export default function ContactPage() {
  const c = site.contact;
  const hasAny = c.addressLine || c.phone || c.email || c.mapsUrl || c.openingHours.length > 0;

  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }]} />
      <LocalBusinessJsonLd />
      <PageHero
        eyebrow="Contact"
        title="Get in touch"
        intro="Book a trial, ask about memberships, or come see the floor."
        breadcrumb={[
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ]}
      />

      <Section>
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <SectionHead eyebrow="Talk to us" title="Fastest ways to reach the club" />
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/trial" size="lg">
                Book a trial
              </ButtonLink>
              <WhatsAppLink
                message="general"
                context="contact_page"
                className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-bone hover:border-white/60 hover:bg-white/5"
              >
                WhatsApp us
              </WhatsAppLink>
              <CallLink
                context="contact_page"
                className="inline-flex items-center justify-center gap-2 rounded-pill border border-white/25 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-wide text-bone hover:border-white/60 hover:bg-white/5"
              >
                Call us
              </CallLink>
            </div>

            <dl className="mt-10 space-y-4 text-sm">
              {c.addressLine ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">Address</dt>
                  <dd className="mt-1 text-bone">
                    {c.addressLine}
                    {c.city ? `, ${c.city}` : ""}
                  </dd>
                </div>
              ) : null}
              {process.env.NEXT_PUBLIC_PHONE_NUMBER ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">Phone</dt>
                  <dd className="mt-1 text-bone">+{process.env.NEXT_PUBLIC_PHONE_NUMBER}</dd>
                </div>
              ) : null}
              {c.email ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">Email</dt>
                  <dd className="mt-1 text-bone">{c.email}</dd>
                </div>
              ) : null}
              {c.openingHours.length > 0 ? (
                <div>
                  <dt className="font-mono text-xs uppercase tracking-widest text-ash/70">Opening hours</dt>
                  <dd className="mt-1 space-y-0.5 text-bone">
                    {c.openingHours.map((o) => (
                      <p key={o.day}>
                        <span className="text-ash">{o.day}</span> {o.hours}
                      </p>
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>

            {!hasAny ? (
              <p className="mt-8 rounded-card border border-dashed border-white/15 bg-ink-850 p-5 text-sm text-ash">
                Full location details are being finalised. Use the trial form or WhatsApp and the team will send you
                everything you need for your visit.
              </p>
            ) : null}
          </div>

          <div>
            {c.mapsUrl ? (
              <a
                href={c.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex aspect-[4/3] items-center justify-center rounded-card border border-white/10 bg-ink-850 text-sm text-ash hover:border-white/30"
              >
                Open in Google Maps →
              </a>
            ) : (
              <div className="flex aspect-[4/3] items-end rounded-card border border-dashed border-white/15 bg-ink-850 p-5">
                <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ash/50">
                  Map — added when the location is confirmed
                </span>
              </div>
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
