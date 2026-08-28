import { Section, SectionHead } from "@/components/primitives";
import { site } from "@/content/site.config";

/**
 * Testimonials. Renders ONLY real quotes from site.config → testimonials.
 * If the list is empty, the whole section is not rendered — no placeholder
 * quotes, ever.
 */
export function Testimonials() {
  const items = site.testimonials;
  if (items.length === 0) return null;

  return (
    <Section tone="raised">
      <SectionHead eyebrow="Members" title="What training here is like" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((t, i) => (
          <figure key={i} className="rounded-card border border-white/10 bg-ink-850 p-6">
            <blockquote className="text-sm leading-relaxed text-bone">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="mt-4 text-xs uppercase tracking-wider text-ash">
              {t.name}
              {t.context ? ` · ${t.context}` : ""}
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  );
}
