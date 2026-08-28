import { Container } from "@/components/primitives";
import { ButtonLink } from "@/components/button";

/**
 * Homepage hero. The background is a placeholder gradient + grain until a
 * real 9th Round facility photo/loop is supplied (see README). No stock
 * imagery is used in its place.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/10 bg-ink-950">
      {/* Placeholder atmosphere — replaced by real facility media. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 500px at 70% -10%, rgba(228,20,27,0.28), transparent 60%), radial-gradient(900px 600px at 10% 110%, rgba(228,20,27,0.12), transparent 55%), #0B0B0C",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.06] mix-blend-screen"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <Container className="relative py-24 sm:py-32 lg:py-40">
        <p className="u-eyebrow">9th Round · Egypt</p>
        <h1 className="mt-4 max-w-4xl text-[clamp(2.75rem,9vw,5.5rem)] uppercase leading-[0.95] tracking-tight">
          Your first round
          <br />
          starts here
        </h1>
        <p className="mt-6 max-w-xl text-lg text-ash sm:text-xl">
          Boxing, kickboxing and combat-fitness conditioning — nine rounds, about thirty minutes, a coach on the floor
          every round. No class times. Come as you are.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <ButtonLink href="/trial" size="lg">
            Book a trial
          </ButtonLink>
          <ButtonLink href="/programs" size="lg" variant="outline">
            Explore programs
          </ButtonLink>
        </div>
      </Container>
    </section>
  );
}
