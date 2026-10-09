"use client";

import { useState, type FormEvent } from "react";
import { getRaceModule } from "../../../src/lib/composition-root";
import { AdminShell, plainError, useAdminAccess } from "../../../src/components/race/admin-shell";
import { RaceBadge, RaceButton, RaceInput, RaceNotice, RaceSelect } from "../../../src/components/race/race-ui";

export default function AdminHubPage() {
  const { status, access, error, reload } = useAdminAccess();
  const [name, setName] = useState("Private demo run");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    const r = await getRaceModule().demo.create(name, copyFrom || undefined);
    setBusy(false);
    if (r.isErr) { setProblem(plainError(r.error.message)); return; }
    window.location.assign(`/race/admin/${r.value.slug}`);
  }

  const canCreate = access?.can_create_events ?? false;
  return (
    <AdminShell current="hub" title="Private admin" gate={{ status, error, ready: access !== null }}>
      {access ? (
        <>
          <div className="flex items-center gap-3">
            <h1 className="race-display text-4xl">Events</h1>
            {access.is_super_admin ? <RaceBadge tone="red">SUPER ADMIN</RaceBadge> : null}
          </div>
          {canCreate ? (
            <form onSubmit={create} className="race-card flex flex-col gap-3" data-testid="create-demo">
              <h2 className="race-display text-2xl">New private demo event</h2>
              <p style={{ color: "var(--race-muted)" }}>Private: never open for public registration. Athletes are labelled DEMO. Real races are created separately.</p>
              <RaceInput id="demo-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} />
              <RaceSelect id="demo-copy" label="Start from" hint="Copy the station configuration of an earlier run, or start from the rulebook defaults." value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                <option value="">Rulebook defaults</option>
                {access.events.filter((ev) => ev.manager).map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
              </RaceSelect>
              {problem ? <RaceNotice>{problem}</RaceNotice> : null}
              <RaceButton type="submit" isLoading={busy} className="self-start">Create demo event</RaceButton>
            </form>
          ) : (
            <RaceNotice>Your account is not authorized to create events. Ask the Super Admin to enable it.</RaceNotice>
          )}
          <div className="flex flex-col gap-2" data-testid="event-list">
            {access.events.length === 0 ? <p style={{ color: "var(--race-muted)" }}>No events yet.</p> : null}
            {access.events.map((ev) => (
              <a key={ev.id} href={`/race/admin/${ev.slug}`} className="race-card race-card--flat flex items-center justify-between gap-3">
                <span>{ev.name}</span>
                <span className="flex gap-2">
                  {ev.is_demo ? <RaceBadge tone="red">DEMO</RaceBadge> : null}
                  <RaceBadge>{ev.status}</RaceBadge>
                </span>
              </a>
            ))}
          </div>
          <button type="button" className="race-label self-start" onClick={reload}>Refresh</button>
        </>
      ) : null}
    </AdminShell>
  );
}
