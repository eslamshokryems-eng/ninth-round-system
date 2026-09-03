import { Section, SectionHead } from "@/components/primitives";
import { dict } from "@/content/i18n";
import type { Lang } from "@/content/i18n/config";

export function HowItWorks({ lang }: { lang: Lang }) {
  const t = dict(lang).how;

  return (
    <Section tone="raised">
      <SectionHead eyebrow={t.eyebrow} title={t.title} />
      <ol className="mt-12 grid gap-px overflow-hidden rounded-card border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
        {t.steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 bg-ink-850 p-6">
            <span dir="ltr" className="font-display text-4xl font-bold leading-none text-blood">
              {i + 1}
            </span>
            <p className="font-display uppercase tracking-wide text-bone">{s.title}</p>
            <p className="text-sm text-ash">{s.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
