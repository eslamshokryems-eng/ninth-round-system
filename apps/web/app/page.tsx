import Image from "next/image";
import Link from "next/link";
import { StaffAutoRedirect } from "../src/features/auth/staff-auto-redirect";

/**
 * Public marketing homepage (Phase 3, draft). Everything marked
 * PLACEHOLDER below is unverified — no real address, phone number,
 * price, coach name, or schedule has been supplied yet, so none is
 * invented here. Replace every PLACEHOLDER before this is treated as
 * launch-ready copy.
 */

const WHATSAPP_HREF = "#"; // PLACEHOLDER: replace with https://wa.me/20XXXXXXXXXX
const CALL_HREF = "#"; // PLACEHOLDER: replace with tel:+20XXXXXXXXXX

const PROGRAMS = [
  {
    name: "Boxing",
    blurb: "Fundamentals, combinations, and heavy-bag work built around real technique.",
  },
  {
    name: "Kickboxing",
    blurb: "Strikes, footwork, and conditioning in one high-output round.",
  },
  {
    name: "Fitness",
    blurb: "Strength and conditioning stations for full-body performance.",
  },
  {
    name: "Kids / Junior",
    blurb: "PLACEHOLDER — confirm age range, format, and days before publishing.",
  },
];

function Placeholder({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
      Placeholder — {label}
    </span>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <StaffAutoRedirect />

      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/5 bg-bg/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Image src="/emblem-red.png" alt="9th Round" width={28} height={28} />
          <span className="text-sm font-bold tracking-wide">9TH ROUND EGYPT</span>
        </div>
        <Link href="/login" className="text-xs font-medium text-muted hover:text-ink">
          Staff Login
        </Link>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5 px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-500">
            Combat-Fitness &middot; 9-Station Circuit
          </p>
          <h1 className="mt-4 text-4xl font-black uppercase leading-tight tracking-tight sm:text-6xl">
            Where Legends
            <br />
            Are Made
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg">
            No classes. No waiting. Just action. Boxing, kickboxing, and functional
            fitness in one structured, 30-minute round.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={WHATSAPP_HREF}
              className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-gold px-6 py-3 text-sm font-bold text-bg transition-colors hover:bg-gold-soft sm:w-auto"
            >
              Book a Free Trial
            </a>
            <a
              href={CALL_HREF}
              className="inline-flex w-full items-center justify-center gap-2 rounded-pill border border-white/20 px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-white/[0.06] sm:w-auto"
            >
              Call Us
            </a>
          </div>
          <div className="mt-3 flex justify-center">
            <Placeholder label="WhatsApp number + phone number needed" />
          </div>
        </div>
      </section>

      {/* About */}
      <section className="border-b border-white/5 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Not Another Gym Class</h2>
          <p className="mt-4 text-muted">
            9th Round is a structured combat-fitness circuit — 9 stations, roughly
            three minutes each, combining boxing, kickboxing, strength, and
            conditioning into one complete session. Beginners welcome. No prior
            boxing experience required.
          </p>
        </div>
      </section>

      {/* Programs */}
      <section className="border-b border-white/5 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Programs</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROGRAMS.map((program) => (
              <div key={program.name} className="rounded-card border border-white/10 bg-surface p-5">
                <h3 className="text-base font-semibold text-ink">{program.name}</h3>
                <p className="mt-2 text-sm text-muted">{program.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trial CTA banner */}
      <section className="border-b border-white/5 bg-surface px-4 py-14 text-center sm:px-6 lg:px-8">
        <h2 className="text-2xl font-bold sm:text-3xl">Try Your First Session Free</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Come as you are. Learn the fundamentals, feel the energy, and see what a
          real round feels like — no commitment required.
        </p>
        <a
          href={WHATSAPP_HREF}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-pill bg-gold px-6 py-3 text-sm font-bold text-bg transition-colors hover:bg-gold-soft"
        >
          Join 9th Round
        </a>
      </section>

      {/* Location + Contact */}
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold">Location</h2>
            <p className="mt-2 text-muted">Placeholder — full address not yet supplied.</p>
            <div className="mt-2">
              <Placeholder label="branch address + map link needed" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-bold">Contact</h2>
            <ul className="mt-2 space-y-1 text-muted">
              <li>WhatsApp — placeholder number</li>
              <li>Phone — placeholder number</li>
              <li>Instagram — placeholder handle</li>
              <li>Facebook — placeholder handle</li>
            </ul>
            <div className="mt-2">
              <Placeholder label="contact details needed" />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-4 py-8 text-center text-xs text-muted sm:px-6 lg:px-8">
        <p>&copy; 9th Round Egypt. All rights reserved.</p>
      </footer>
    </div>
  );
}
