import { Container } from "../src/components/container";
import { PrimaryCta, SecondaryCta } from "../src/components/cta-buttons";
import { PlaceholderTag } from "../src/components/placeholder-tag";
import { CONTACT } from "../src/data/contact";
import { PROGRAMS } from "../src/data/programs";
import { COACHES } from "../src/data/coaches";

export default function HomePage() {
  return (
    <>
      {/* 1. Hero */}
      <section className="relative overflow-hidden border-b border-white/5 py-16 text-center sm:py-24">
        <Container>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
            Combat-Fitness &middot; 9-Station Circuit
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-black uppercase leading-tight tracking-tight sm:text-6xl">
            Where Legends Are Made
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg">
            9th Round Egypt — no classes, no waiting, just action. Boxing, kickboxing,
            and functional fitness in one structured, high-energy round.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <PrimaryCta href="/trial">Book a Free Trial</PrimaryCta>
            <SecondaryCta href="/programs">View Programs</SecondaryCta>
          </div>

          <div className="mt-8 flex items-center justify-center">
            <div className="flex aspect-video w-full max-w-2xl items-center justify-center rounded-card border border-white/10 bg-surface">
              <PlaceholderTag label="hero photo/video of the real facility needed" />
            </div>
          </div>
        </Container>
      </section>

      {/* 2. Why 9th Round */}
      <section className="border-b border-white/5 py-16">
        <Container>
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Not Another Gym</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <WhyCard title="Methodology" body="A structured 9-station circuit — every round has a purpose, nothing wasted." />
            <WhyCard title="Coaching" body="Real coaching, real technique — beginners welcome, no boxing experience required." />
            <WhyCard title="Community" body="Train alongside people who show up — energy that pushes you further." />
            <WhyCard title="Results" body="Strength, conditioning, and skill, built one round at a time." />
          </div>
        </Container>
      </section>

      {/* 3. Programs */}
      <section className="border-b border-white/5 py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl font-bold sm:text-3xl">Programs</h2>
            <SecondaryCta href="/programs">See all programs</SecondaryCta>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROGRAMS.slice(0, 4).map((program) => (
              <div key={program.slug} className="rounded-card border border-white/10 bg-surface p-5">
                <h3 className="text-base font-semibold text-ink">{program.name}</h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-red-500">{program.tagline}</p>
                <p className="mt-2 text-sm text-muted">{program.description}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* 4. Training Experience */}
      <section className="border-b border-white/5 bg-surface py-16">
        <Container>
          <div className="grid items-center gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">The 9th Round Experience</h2>
              <p className="mt-4 text-muted">
                9 stations, roughly three minutes each — warm-up, strength, boxing, kickboxing,
                functional movement, core, and conditioning, all in one complete session. Come
                as you are. Learn. Train. Improve.
              </p>
            </div>
            <div className="flex aspect-video items-center justify-center rounded-card border border-white/10 bg-bg">
              <PlaceholderTag label="training-experience photo/video needed" />
            </div>
          </div>
        </Container>
      </section>

      {/* 5. Coaches */}
      <section className="border-b border-white/5 py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl font-bold sm:text-3xl">Coaches</h2>
            <SecondaryCta href="/coaches">Meet the team</SecondaryCta>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {COACHES.map((coach) => (
              <div key={coach.id} className="flex items-center gap-4 rounded-card border border-white/10 bg-surface p-5">
                <div className="h-16 w-16 flex-shrink-0 rounded-full border border-white/10 bg-bg" />
                <div>
                  <p className="font-semibold text-ink">{coach.name}</p>
                  <p className="text-sm text-muted">{coach.role}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <PlaceholderTag label="real coach names, roles, and photos needed" />
          </div>
        </Container>
      </section>

      {/* 6. Classes / Schedule (preview) */}
      <section className="border-b border-white/5 bg-surface py-16">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl font-bold sm:text-3xl">Classes</h2>
            <SecondaryCta href="/classes">View schedule</SecondaryCta>
          </div>
          <p className="mt-4 max-w-xl text-muted">
            A public schedule is coming soon. This preview does not reflect real class times yet.
          </p>
        </Container>
      </section>

      {/* 7. Trial CTA */}
      <section className="border-b border-white/5 py-16 text-center">
        <Container>
          <h2 className="text-2xl font-bold sm:text-3xl">Try Your First Session Free</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">
            Come as you are. Learn the fundamentals, feel the energy, and see what a real
            round feels like — no commitment required.
          </p>
          <div className="mt-6 flex justify-center">
            <PrimaryCta href="/trial">Book a Free Trial</PrimaryCta>
          </div>
        </Container>
      </section>

      {/* 8. Location / Contact */}
      <section className="py-16">
        <Container>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h2 className="text-lg font-bold">Location</h2>
              <p className="mt-2 text-muted">{CONTACT.addressLine ?? "Full address not yet supplied."}</p>
              <div className="mt-2">
                <PlaceholderTag label="branch address + map link needed" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold">Contact</h2>
              <p className="mt-2 text-muted">WhatsApp and phone details not yet supplied.</p>
              <div className="mt-2">
                <PlaceholderTag label="WhatsApp + phone number needed" />
              </div>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}

function WhyCard({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gold">{title}</h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}
