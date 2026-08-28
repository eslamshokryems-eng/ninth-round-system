import type { ElementType, ReactNode } from "react";

/** Centered max-width wrapper with responsive gutters. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`u-wrap ${className}`}>{children}</div>;
}

/** A vertical section band. `tone` sets the background. */
export function Section({
  children,
  id,
  tone = "base",
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  id?: string;
  tone?: "base" | "raised" | "blood";
  className?: string;
  as?: ElementType;
}) {
  const tones: Record<string, string> = {
    base: "bg-ink-950",
    raised: "bg-ink-900",
    blood: "bg-blood text-white",
  };
  return (
    <Tag id={id} className={`${tones[tone]} py-16 sm:py-20 lg:py-28 ${className}`}>
      <Container>{children}</Container>
    </Tag>
  );
}

/** Section eyebrow + heading pair. */
export function SectionHead({
  eyebrow,
  title,
  intro,
  align = "start",
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  align?: "start" | "center";
}) {
  return (
    <div className={`max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      <p className="u-eyebrow">{eyebrow}</p>
      <h2 className="mt-3 text-3xl uppercase tracking-tight sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      {intro ? <p className="mt-4 text-base text-ash sm:text-lg">{intro}</p> : null}
    </div>
  );
}
