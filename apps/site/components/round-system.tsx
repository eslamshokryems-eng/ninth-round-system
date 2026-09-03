import { Section, SectionHead } from "@/components/primitives";
import { dict } from "@/content/i18n";
import type { Lang } from "@/content/i18n/config";

/**
 * The 9-round circuit explainer. Station names are a faithful summary of
 * 9th Round's own documented circuit (warm-up through conditioning, with
 * round 9 always core). Not a schedule or a guarantee — a description.
 */
export function RoundSystem({ lang }: { lang: Lang }) {
  const t = dict(lang).rounds;

  return (
    <Section>
      <SectionHead eyebrow={t.eyebrow} title={t.title} intro={t.intro} />
      <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {t.items.map((r, i) => (
          <li key={r.label} className="flex items-start gap-4 rounded-card border border-white/10 bg-ink-850 p-5">
            <span dir="ltr" className="font-display text-3xl font-bold leading-none text-blood">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="font-display uppercase tracking-wide text-bone">{r.label}</p>
              <p className="mt-0.5 text-sm text-ash">{r.detail}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-prose text-sm text-ash">{t.note}</p>
    </Section>
  );
}
