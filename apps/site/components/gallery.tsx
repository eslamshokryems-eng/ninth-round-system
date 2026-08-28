import Image from "next/image";
import { Section, SectionHead } from "@/components/primitives";
import { site } from "@/content/site.config";

/**
 * Training gallery. Renders real 9th Round media from site.config →
 * gallery. With none supplied, it shows a clearly-labelled placeholder
 * grid — never stock photos standing in for the real facility.
 */
export function Gallery() {
  const items = site.gallery;

  return (
    <Section>
      <SectionHead eyebrow="Inside 9th Round" title="The training floor" />
      {items.length > 0 ? (
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((g) => (
            <div key={g.src} className="relative aspect-[4/3] overflow-hidden rounded-card border border-white/10">
              <Image src={g.src} alt={g.alt} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex aspect-[4/3] items-end rounded-card border border-dashed border-white/15 bg-ink-850 p-4"
            >
              <span className="font-mono text-[0.65rem] uppercase tracking-widest text-ash/50">
                Real facility photo — to be added
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
