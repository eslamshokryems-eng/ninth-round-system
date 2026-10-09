"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { MyAccess } from "@9thround/race";
import { getRaceClient, getRaceModule } from "../../lib/composition-root";
import { useAuthStore } from "../../features/auth/store";
import { RaceBadge, RaceButton, RaceHeader, RaceNotice, RaceSpinner } from "./race-ui";

type Item = { href: string; label: string; key: string };

/** Strips the "RACE_X: " prefix the database puts in front of its explanation. */
export function plainError(message: string): string {
  return message.replace(/^RACE_[A-Z_]+:\s*/, "");
}

export function SignOutButton() {
  const email = useAuthStore((s) => s.email);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3">
      {email ? <span className="race-label hidden sm:inline" data-testid="signed-in-as">{email}</span> : null}
      <RaceButton
        size="sm"
        variant="ghost"
        isLoading={busy}
        data-testid="logout"
        onClick={async () => {
          setBusy(true);
          await getRaceClient().auth.signOut();
          useAuthStore.getState().setSignedOut();
          window.location.assign("/race/login");
        }}
      >
        Sign out
      </RaceButton>
    </div>
  );
}

/** Loads who the caller is (from the database) and, for event pages, the event by slug among the events the caller staffs. */
export function useAdminAccess(slug?: string) {
  const status = useAuthStore((s) => s.status);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (status !== "signedIn") return;
    let cancelled = false;
    void getRaceModule().stationConfig.myAccess().then((r) => {
      if (cancelled) return;
      if (r.isOk) setAccess(r.value); else setError(plainError(r.error.message));
    });
    return () => { cancelled = true; };
  }, [status, version]);
  const event = slug && access ? (access.events.find((e) => e.slug === slug) ?? null) : null;
  return { status, access, event, error, reload: () => setVersion((v) => v + 1) };
}

/** The private admin area's frame: header with sign-out, a sidebar, and the signed-out / not-authorized states. */
export function AdminShell({ slug, current, title, children, gate }: { slug?: string; current: string; title: string; children: ReactNode; gate: { status: string; error: string | null; ready: boolean; notFound?: boolean } }) {
  const items: Item[] = slug
    ? [
        { key: "overview", href: `/race/admin/${slug}`, label: "Guided demo" },
        { key: "stations", href: `/race/admin/${slug}/stations`, label: "Station & Exercise Settings" },
        { key: "registrations", href: `/race/admin/${slug}/registrations`, label: "Registrations" },
        { key: "reception", href: `/race/reception/${slug}`, label: "Check-in" },
        { key: "control", href: `/race/control/${slug}`, label: "Master dashboard" },
        { key: "results", href: `/race/control/${slug}/results`, label: "Results" },
        { key: "hub", href: "/race/admin", label: "← All events" },
      ]
    : [{ key: "hub", href: "/race/admin", label: "Events" }];
  let body: ReactNode;
  if (gate.status === "hydrating") body = <RaceSpinner />;
  else if (gate.status === "signedOut") {
    body = (
      <div className="flex flex-col gap-4">
        <h1 className="race-display text-4xl">Sign in required</h1>
        <p style={{ color: "var(--race-muted)" }}>This area is private and invitation-only.</p>
        <a href={`/race/login?next=${encodeURIComponent(slug ? `/race/admin/${slug}` : "/race/admin")}`} className="race-btn self-start">Sign in</a>
      </div>
    );
  } else if (gate.error) body = <RaceNotice>{gate.error}</RaceNotice>;
  else if (!gate.ready) body = <RaceSpinner />;
  else if (gate.notFound) body = <RaceNotice>This event does not exist, or your account has no role on it.</RaceNotice>;
  else body = children;
  return (
    <>
      <RaceHeader wide right={gate.status === "signedIn" ? <SignOutButton /> : undefined} />
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 pt-4 md:grid-cols-[220px_1fr]">
        <nav aria-label="Admin sections" className="flex flex-row flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-2" data-testid="admin-sidebar">
          {items.map((i) => (
            <a
              key={i.key}
              href={i.href}
              aria-current={i.key === current ? "page" : undefined}
              className="race-label"
              style={{ padding: "0.5rem 0.25rem", borderBottom: i.key === current ? "2px solid var(--race-red-hot)" : "2px solid transparent", color: i.key === current ? "var(--race-white)" : undefined }}
            >
              {i.label}
            </a>
          ))}
        </nav>
        <section aria-label={title} className="flex min-w-0 flex-col gap-4">
          <p className="race-kicker">{title}</p>
          {body}
        </section>
      </main>
    </>
  );
}

export { RaceBadge };
