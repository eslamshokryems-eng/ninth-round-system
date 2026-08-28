import { Section, SectionHead } from "@/components/primitives";
import { FAQS } from "@/content/faqs";

export function Faq() {
  return (
    <Section>
      <SectionHead eyebrow="Questions" title="Before your first session" />
      <div className="mx-auto mt-10 max-w-3xl divide-y divide-white/10 border-y border-white/10">
        {FAQS.map((f) => (
          <details key={f.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base uppercase tracking-wide text-bone">
              {f.q}
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                aria-hidden="true"
                className="shrink-0 transition-transform group-open:rotate-45"
              >
                <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-ash">{f.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
