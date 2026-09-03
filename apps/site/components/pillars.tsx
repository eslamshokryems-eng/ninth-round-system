import { Section, SectionHead } from "@/components/primitives";
import { Reveal } from "@/components/reveal";
import { dict } from "@/content/i18n";
import type { Lang } from "@/content/i18n/config";

export function Pillars({ lang }: { lang: Lang }) {
  const t = dict(lang).pillars;

  return (
    <Section tone="raised">
      <SectionHead eyebrow={t.eyebrow} title={t.title} intro={t.intro} />
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {t.items.map((p, i) => (
          <Reveal key={p.title} delay={i * 60}>
            <div className="h-full rounded-card border border-white/10 bg-ink-850 p-6">
              <h3 className="font-display text-lg uppercase tracking-wide text-bone">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ash">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
