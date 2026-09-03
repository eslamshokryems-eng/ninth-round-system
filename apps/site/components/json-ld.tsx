import { site, hasLocalBusinessData } from "@/content/site.config";
import { absoluteUrl } from "@/lib/seo";
import { faqs } from "@/content/faqs";
import { href, type Lang } from "@/content/i18n/config";

/**
 * Structured data, emitted in the language of the page it sits on.
 * Google reads the answer text itself, so an Arabic FAQ page must emit
 * Arabic FAQ markup — English markup under an Arabic page is a mismatch
 * that costs the rich result.
 */

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Server-rendered, static, no user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd({ lang }: { lang: Lang }) {
  const sameAs = Object.values(site.social).filter((v): v is string => Boolean(v));
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    legalName: site.legalName[lang],
    url: absoluteUrl(href(lang, "/")),
    description: site.shortDescription[lang],
    logo: absoluteUrl("/favicon.svg"),
    inLanguage: lang === "ar" ? "ar-EG" : "en",
  };
  if (sameAs.length > 0) data.sameAs = sameAs;
  if (site.contact.email) data.email = site.contact.email;
  if (process.env.NEXT_PUBLIC_PHONE_NUMBER) data.telephone = `+${process.env.NEXT_PUBLIC_PHONE_NUMBER}`;
  return <JsonLd data={data} />;
}

/** Only emitted when address + city + a phone number are all confirmed. */
export function LocalBusinessJsonLd({ lang }: { lang: Lang }) {
  if (!hasLocalBusinessData()) return null;
  const c = site.contact;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: site.name,
    url: absoluteUrl(href(lang, "/location")),
    description: site.shortDescription[lang],
    address: {
      "@type": "PostalAddress",
      streetAddress: c.addressLine ? c.addressLine[lang] : undefined,
      addressLocality: c.city ? c.city[lang] : undefined,
      addressCountry: "EG",
    },
  };
  if (process.env.NEXT_PUBLIC_PHONE_NUMBER) data.telephone = `+${process.env.NEXT_PUBLIC_PHONE_NUMBER}`;
  if (c.mapsUrl) data.hasMap = c.mapsUrl;
  if (c.geo.lat != null && c.geo.lng != null) {
    data.geo = { "@type": "GeoCoordinates", latitude: c.geo.lat, longitude: c.geo.lng };
  }
  if (c.openingHours.length > 0) {
    // Schema.org expects the English day name regardless of page language.
    data.openingHours = c.openingHours.map((o) => `${o.day.en} ${o.hours}`);
  }
  return <JsonLd data={data} />;
}

export function BreadcrumbJsonLd({ trail }: { trail: Array<{ name: string; path: string }> }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: absoluteUrl(t.path),
    })),
  };
  return <JsonLd data={data} />;
}

export function FaqJsonLd({ lang }: { lang: Lang }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: lang === "ar" ? "ar-EG" : "en",
    mainEntity: faqs(lang).map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return <JsonLd data={data} />;
}
