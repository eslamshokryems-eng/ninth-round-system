import { site, hasLocalBusinessData } from "@/content/site.config";
import { absoluteUrl } from "@/lib/seo";
import { FAQS } from "@/content/faqs";

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // Server-rendered, static, no user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function OrganizationJsonLd() {
  const sameAs = Object.values(site.social).filter((v): v is string => Boolean(v));
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    legalName: site.legalName,
    url: site.domain,
    description: site.shortDescription,
    logo: absoluteUrl("/favicon.svg"),
  };
  if (sameAs.length > 0) data.sameAs = sameAs;
  if (site.contact.email) data.email = site.contact.email;
  if (process.env.NEXT_PUBLIC_PHONE_NUMBER) data.telephone = `+${process.env.NEXT_PUBLIC_PHONE_NUMBER}`;
  return <JsonLd data={data} />;
}

/** Only emitted when address + city + phone are all confirmed. */
export function LocalBusinessJsonLd() {
  if (!hasLocalBusinessData()) return null;
  const c = site.contact;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    name: site.name,
    url: absoluteUrl("/contact"),
    description: site.shortDescription,
    address: {
      "@type": "PostalAddress",
      streetAddress: c.addressLine,
      addressLocality: c.city,
      addressCountry: "EG",
    },
  };
  if (process.env.NEXT_PUBLIC_PHONE_NUMBER) data.telephone = `+${process.env.NEXT_PUBLIC_PHONE_NUMBER}`;
  if (c.geo.lat != null && c.geo.lng != null) {
    data.geo = { "@type": "GeoCoordinates", latitude: c.geo.lat, longitude: c.geo.lng };
  }
  if (c.openingHours.length > 0) {
    data.openingHours = c.openingHours.map((o) => `${o.day} ${o.hours}`);
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

export function FaqJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return <JsonLd data={data} />;
}
