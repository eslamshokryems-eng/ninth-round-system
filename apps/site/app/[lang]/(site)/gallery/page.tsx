import type { Metadata } from "next";
import { Section } from "@/components/primitives";
import { PageHero } from "@/components/page-hero";
import { Gallery } from "@/components/gallery";
import { CtaBand } from "@/components/cta-band";
import { BreadcrumbJsonLd } from "@/components/json-ld";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import { href, type Lang } from "@/content/i18n/config";
import { pageMetadata } from "@/lib/seo";

/**
 * The gallery is a sales page, not a scrapbook: people book after they can
 * picture the room. Until real facility photography exists it says so
 * plainly rather than filling the grid with stock images of some other
 * gym — the one thing that would make the whole site less believable.
 */

export function generateMetadata({ params }: { params: { lang: Lang } }): Metadata {
  const t = dict(params.lang).gallery;
  return pageMetadata({
    title: t.pageTitle,
    description: t.metaDescription,
    path: "/gallery",
    lang: params.lang,
  });
}

export default function GalleryPage({ params }: { params: { lang: Lang } }) {
  const lang = params.lang;
  const t = dict(lang);
  const isEmpty = site.gallery.length === 0;
  const trail = [
    { name: t.nav.home, path: href(lang, "/") },
    { name: t.nav.gallery, path: href(lang, "/gallery") },
  ];

  return (
    <>
      <BreadcrumbJsonLd trail={trail} />
      <PageHero
        lang={lang}
        eyebrow={t.gallery.eyebrow}
        title={t.gallery.pageTitle}
        intro={t.gallery.pageIntro}
        breadcrumb={trail}
      />
      <Section>
        {isEmpty ? (
          <p className="mb-10 max-w-prose rounded-card border border-dashed border-white/15 bg-ink-850 p-5 text-sm text-ash">
            {t.gallery.empty}
          </p>
        ) : null}
        <Gallery lang={lang} heading={false} />
      </Section>
      <CtaBand lang={lang} />
    </>
  );
}
