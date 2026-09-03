import { Section, SectionHead } from "@/components/primitives";
import { site } from "@/content/site.config";
import { dict } from "@/content/i18n";
import type { Lang } from "@/content/i18n/config";

/**
 * Testimonials. Renders ONLY real quotes from site.config → testimonials.
 * If the list is empty, the whole section is not rendered — no placeholder
 * quotes, ever.
 */
export function Testimonials({ lang }: { lang: Lang }) {
  const items = site.testimonials;
  if (items.length === 0) return null;
  const t = dict(lang).testimonials;

  return (
    <Section tone="raised">
      <SectionHead eyebrow={t.eyebrow} title={t.title} />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <figure key={i} className="rounded-card border border-white/10 bg-ink-850 p-6">
            <blockquote className="text-sm leading-relaxed text-bone">&ldquo;{item.quote[lang]}&rdquo;</blockquote>
            <figcaption className="mt-4 text-xs uppercase tracking-wider text-ash">
              {item.name}
              {item.context ? ` · ${item.context[lang]}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
