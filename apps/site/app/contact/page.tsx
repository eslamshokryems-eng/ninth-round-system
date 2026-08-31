import type { Metadata } from "next";
import { Container } from "../../src/components/container";
import { ExternalCta, PrimaryCta } from "../../src/components/cta-buttons";
import { PlaceholderTag } from "../../src/components/placeholder-tag";
import { CONTACT } from "../../src/data/contact";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact 9th Round Egypt — WhatsApp, phone, and location.",
};

export default function ContactPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Contact</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Have a question before your first session? Reach out — or just book a free trial
        and ask in person.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ExternalCta href={CONTACT.whatsappHref}>WhatsApp Us</ExternalCta>
        <ExternalCta href={CONTACT.callHref}>Call Us</ExternalCta>
        <PrimaryCta href="/trial">Book a Free Trial</PrimaryCta>
      </div>
      <div className="mt-3">
        <PlaceholderTag label="WhatsApp + phone number needed" />
      </div>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-bold">Location</h2>
          <p className="mt-2 text-muted">{CONTACT.addressLine ?? "Full address not yet supplied."}</p>
          <div className="mt-2">
            <PlaceholderTag label="branch address + map link needed" />
          </div>
        </div>
        <div>
          <h2 className="text-lg font-bold">Social</h2>
          <p className="mt-2 text-muted">Instagram — {CONTACT.instagramHandle ?? "placeholder handle"}</p>
          <p className="text-muted">Facebook — {CONTACT.facebookHandle ?? "placeholder handle"}</p>
          <div className="mt-2">
            <PlaceholderTag label="social handles needed" />
          </div>
        </div>
      </div>
    </Container>
  );
}
