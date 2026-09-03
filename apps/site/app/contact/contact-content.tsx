"use client";

import { Container } from "../../src/components/container";
import { ExternalCta, PrimaryCta } from "../../src/components/cta-buttons";
import { CONTACT } from "../../src/data/contact";
import { useLanguage } from "../../src/i18n/language-provider";

export function ContactContent() {
  const { dict } = useLanguage();

  return (
    <Container className="py-16">
      <h1 className="font-display text-4xl uppercase text-bone sm:text-5xl">{dict.pages.contact.title}</h1>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ExternalCta href={CONTACT.whatsappHref}>
          {dict.location.whatsapp} — {CONTACT.whatsappDisplay}
        </ExternalCta>
        <ExternalCta href={CONTACT.callHref}>
          {dict.location.phone} — {CONTACT.phoneDisplay}
        </ExternalCta>
        <PrimaryCta href="/trial">{dict.trialCta.cta}</PrimaryCta>
      </div>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-display text-lg uppercase text-bone">{dict.location.heading}</h2>
          <p className="mt-2 text-grey">{CONTACT.addressLine}</p>
          <a
            href={CONTACT.mapHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm font-bold text-red hover:text-red/80"
          >
            {dict.location.getDirections} →
          </a>
        </div>
        <div>
          <h2 className="font-display text-lg uppercase text-bone">Social</h2>
          <p className="mt-2 text-grey">
            <a href={CONTACT.instagramHref} target="_blank" rel="noopener noreferrer" className="hover:text-bone">
              Instagram — {CONTACT.instagramHandle}
            </a>
          </p>
          <p className="text-grey">
            <a href={CONTACT.facebookHref} target="_blank" rel="noopener noreferrer" className="hover:text-bone">
              Facebook
            </a>
          </p>
        </div>
      </div>
    </Container>
  );
}
