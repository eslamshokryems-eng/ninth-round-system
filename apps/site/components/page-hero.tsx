import Link from "next/link";
import { Container } from "@/components/primitives";

export function PageHero({
  eyebrow,
  title,
  intro,
  breadcrumb,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  breadcrumb?: Array<{ name: string; path: string }>;
}) {
  return (
    <section className="border-b border-white/10 bg-ink-900">
      <Container className="py-14 sm:py-20">
        {breadcrumb && breadcrumb.length > 0 ? (
          <nav aria-label="Breadcrumb" className="mb-5">
            <ol className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-ash">
              {breadcrumb.map((c, i) => (
                <li key={c.path} className="flex items-center gap-2">
                  {i > 0 ? <span aria-hidden="true">/</span> : null}
                  {i < breadcrumb.length - 1 ? (
                    <Link href={c.path} className="hover:text-bone">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="text-bone">{c.name}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <p className="u-eyebrow">{eyebrow}</p>
        <h1 className="mt-3 max-w-4xl text-4xl uppercase leading-[0.98] tracking-tight sm:text-5xl lg:text-6xl">
          {title}
        </h1>
        {intro ? <p className="mt-5 max-w-2xl text-lg text-ash">{intro}</p> : null}
      </Container>
    </section>
  );
}
