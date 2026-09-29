"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import {
  parseRaceNumberQuery,
  type CheckInResult,
  type PublicRaceEvent,
  type QueueEntry,
  type StaffRegistrationRow,
} from "@9thround/race";
import { getRaceModule } from "../../../../src/lib/composition-root";
import { useAuthStore } from "../../../../src/features/auth/store";
import { QrScanner } from "../../../../src/components/qr-scanner";
import {
  RaceBadge,
  RaceButton,
  RaceHeader,
  RaceInput,
  RaceNotice,
  RacePage,
  RaceSpinner,
  StaffNav,
  formatClock,
  formatMoney,
} from "../../../../src/components/race/race-ui";

const CATEGORY_LABEL = { MEN: "Men", WOMEN: "Women", MASTERS: "Masters 40+" } as const;

/** Why this athlete cannot be checked in right now (null = ready). Mirrors the database rules, for a clear message before the tap. */
function blockReason(row: StaffRegistrationRow, event: PublicRaceEvent): string | null {
  if (row.status === "CANCELLED") return "Registration cancelled.";
  if (row.status === "PENDING_PAYMENT") return "Payment not confirmed — send the athlete to the payment desk first.";
  if (row.heatId === null) return "No heat assigned yet — ask the Event Manager.";
  if (row.raceStatus === "MISSED_START") return "Missed their start — cannot check in. Ask the Event Manager.";
  if (row.raceStatus !== "REGISTERED") return null; // already checked in: the button reports the original check-in
  if (!event.heatsLocked && event.status !== "LIVE") return "Check-in opens when heats are locked.";
  return null;
}

export default function ReceptionPage() {
  const { slug } = useParams<{ slug: string }>();
  const authStatus = useAuthStore((s) => s.status);
  const [event, setEvent] = useState<PublicRaceEvent | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<StaffRegistrationRow[]>([]);
  const [selected, setSelected] = useState<StaffRegistrationRow | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [heatFilter, setHeatFilter] = useState<number | null>(null);
  const [result, setResult] = useState<{ row: StaffRegistrationRow; checkIn: CheckInResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authStatus !== "signedIn") return;
    let cancelled = false;
    void getRaceModule()
      .getPublicEvent.execute(slug)
      .then((r) => {
        if (cancelled) return;
        if (r.isOk) setEvent(r.value);
        else setError(r.error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, slug]);

  const loadQueue = useCallback(async (eventId: string) => {
    const r = await getRaceModule().getQueue.execute({ eventId });
    if (r.isOk) setQueue(r.value);
  }, []);

  // The queue refreshes every few seconds so two desks see each other's check-ins.
  useEffect(() => {
    if (!event) return;
    void loadQueue(event.eventId);
    const timer = window.setInterval(() => void loadQueue(event.eventId), 5000);
    return () => window.clearInterval(timer);
  }, [event, loadQueue]);

  // Search as you type — race number first (the fast path), then phone, then name; resolved by the database.
  useEffect(() => {
    if (!event) return;
    const q = query.trim();
    if (q === "") {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void getRaceModule()
        .listRegistrations.execute({ eventId: event.eventId, query: q, limit: 8 })
        .then((r) => {
          if (cancelled) return;
          if (r.isErr) return setError(r.error.message);
          setError(null);
          setMatches(r.value);
          // A race number typed exactly identifies one athlete: select it straight away.
          if (parseRaceNumberQuery(q) !== null && r.value.length === 1) setSelected(r.value[0]!);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [event, query]);

  async function checkIn() {
    if (!selected || !event || busy) return;
    setBusy(true);
    setError(null);
    const r = await getRaceModule().checkInAthlete.execute(selected.registrationId);
    setBusy(false);
    if (r.isErr) {
      setError(r.error.message);
      return;
    }
    setResult({ row: selected, checkIn: r.value });
    setSelected(null);
    setMatches([]);
    setQuery("");
    void loadQueue(event.eventId);
    inputRef.current?.focus();
  }

  if (authStatus === "hydrating") return <Shell slug={slug}><RaceSpinner /></Shell>;
  if (authStatus === "signedOut") {
    return (
      <Shell slug={slug}>
        <div className="mt-10 flex flex-col gap-4">
          <h1 className="race-display text-5xl">Sign in required</h1>
          <a href={`/race/login?next=/race/reception/${slug}`} className="race-btn self-start">
            Sign in
          </a>
        </div>
      </Shell>
    );
  }

  const heats = [...new Set(queue.map((q) => q.heatNumber))].sort((a, b) => a - b);
  const shownQueue = heatFilter === null ? queue : queue.filter((q) => q.heatNumber === heatFilter);
  const reason = selected && event ? blockReason(selected, event) : null;
  const alreadyIn = selected !== null && selected.raceStatus !== "REGISTERED" && reason === null;

  return (
    <Shell slug={slug} wide>
      <div className="mt-2 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-5">
          <div>
            <p className="race-kicker">Reception</p>
            <h1 className="race-display mt-2 text-5xl">Check-in</h1>
          </div>

          {event && !event.heatsLocked && event.status !== "LIVE" ? <RaceNotice>Check-in opens when the Event Manager locks the heats.</RaceNotice> : null}
          {error ? <RaceNotice>{error}</RaceNotice> : null}

          {result ? (
            <div className="race-card text-center" style={{ borderLeftColor: result.checkIn.kind === "LATE" ? "var(--race-red-hot)" : "var(--race-white)" }} role="status">
              <p className="race-kicker">{result.checkIn.alreadyCheckedIn ? "Already checked in" : result.checkIn.kind === "LATE" ? "Late check-in" : "Checked in"}</p>
              <div className="race-number-plate" style={{ fontSize: "clamp(4.5rem, 20vw, 8rem)" }}>{result.row.raceNumber}</div>
              <p className="race-display text-2xl">{result.row.fullName}</p>
              <p className="mt-2" style={{ color: "var(--race-muted)" }}>
                Heat {String(result.checkIn.heatNumber).padStart(2, "0")} · position {result.checkIn.queuePosition} in the heat
                {result.checkIn.kind === "LATE" ? " · next available start slot" : ""}
              </p>
            </div>
          ) : null}

          <RaceInput
            inputRef={inputRef}
            id="race-checkin-search"
            label="Race number, phone or name"
            placeholder="27 · N027 · 0100… · Ahmed"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setResult(null);
              setError(null);
            }}
            autoComplete="off"
            autoFocus
          />
          <div className="flex gap-3">
            <RaceButton variant="ghost" size="sm" onClick={() => setScanning((v) => !v)}>
              {scanning ? "Close scanner" : "Scan QR"}
            </RaceButton>
          </div>
          {scanning ? (
            <div className="race-card race-card--flat">
              <QrScanner
                isPaused={busy}
                onDecode={(text) => {
                  setScanning(false);
                  setQuery(parseRaceNumberQuery(text) ?? text);
                }}
              />
            </div>
          ) : null}

          {!selected && matches.length > 1 ? (
            <ul className="flex flex-col gap-2" aria-label="Matches">
              {matches.map((m) => (
                <li key={m.registrationId}>
                  <button type="button" className="race-choice flex w-full items-center justify-between text-left" onClick={() => setSelected(m)}>
                    <span>
                      <span className="race-display text-2xl">{m.raceNumber}</span> <span className="ml-2">{m.fullName}</span>
                    </span>
                    <span className="text-sm" style={{ color: "var(--race-muted)" }}>{m.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!selected && query.trim() !== "" && matches.length === 0 ? <p style={{ color: "var(--race-muted)" }}>No athlete matches.</p> : null}

          {selected ? (
            <div className="race-card flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="race-number-plate" style={{ fontSize: "clamp(4rem, 18vw, 7rem)" }}>{selected.raceNumber}</div>
                  <p className="race-display mt-2 text-3xl">{selected.fullName}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--race-muted)" }}>{selected.phone}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <RaceBadge tone="white">{CATEGORY_LABEL[selected.categoryCode]}</RaceBadge>
                  <RaceBadge>{selected.heatNumber !== null ? `Heat ${String(selected.heatNumber).padStart(2, "0")}` : "No heat"}</RaceBadge>
                  <RaceBadge tone={selected.status === "CONFIRMED" ? "white" : "red"}>{selected.status.replace("_", " ")}</RaceBadge>
                  {selected.paymentStatus === "PENDING" && selected.paymentAmount !== null ? <RaceBadge tone="red">Owes {formatMoney(selected.paymentAmount, event?.currency ?? "EGP")}</RaceBadge> : null}
                </div>
              </div>
              {reason ? <RaceNotice>{reason}</RaceNotice> : null}
              {alreadyIn ? <p style={{ color: "var(--race-muted)" }}>Already {selected.raceStatus.replace("_", " ").toLowerCase()}. Tap to see their position.</p> : null}
              <RaceButton onClick={() => void checkIn()} isLoading={busy} disabled={reason !== null} className="w-full" style={{ minHeight: 72, fontSize: "1.4rem" }}>
                {alreadyIn ? "Show check-in" : "Check in"}
              </RaceButton>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="race-kicker">Start queue</p>
              <h2 className="race-display mt-1 text-4xl">{shownQueue.length} checked in</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <RaceButton size="sm" variant={heatFilter === null ? "primary" : "ghost"} onClick={() => setHeatFilter(null)}>All</RaceButton>
              {heats.map((h) => (
                <RaceButton key={h} size="sm" variant={heatFilter === h ? "primary" : "ghost"} onClick={() => setHeatFilter(h)}>
                  Heat {String(h).padStart(2, "0")}
                </RaceButton>
              ))}
            </div>
          </div>
          <div className="race-card race-card--flat overflow-x-auto p-0">
            <table className="race-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>No.</th>
                  <th>Athlete</th>
                  <th>Starts</th>
                </tr>
              </thead>
              <tbody>
                {shownQueue.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center" style={{ color: "var(--race-muted)", padding: "2rem" }}>
                      Nobody checked in yet.
                    </td>
                  </tr>
                ) : null}
                {shownQueue.map((q) => (
                  <tr key={q.registrationId}>
                    <td>
                      {heatFilter === null ? `${String(q.heatNumber).padStart(2, "0")}·` : ""}
                      {q.queuePosition}
                    </td>
                    <td><span className="race-display text-xl">{q.raceNumber}</span></td>
                    <td>
                      <div className="font-semibold">{q.fullName}</div>
                      <div className="mt-1 flex gap-2">
                        {q.kind === "LATE" ? <RaceBadge tone="red">Late</RaceBadge> : null}
                        {q.isOverflow ? <RaceBadge>Overflow slot</RaceBadge> : null}
                      </div>
                    </td>
                    <td>
                      {q.noSlotAvailable ? (
                        <RaceBadge tone="red">No slot — Event Manager</RaceBadge>
                      ) : (
                        <div>
                          <div>
                            {q.slotStatus === "BOUND" || q.slotStatus === "STARTED" ? "Slot " : "≈ slot "}
                            {q.projectedSlotIndex !== null ? String((q.slotIndex ?? q.projectedSlotIndex) + 1).padStart(2, "0") : "—"}
                          </div>
                          {q.projectedStartAt && event ? <div className="text-xs" style={{ color: "var(--race-muted)" }}>{formatClock(q.projectedStartAt, event.timezone)}</div> : null}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs" style={{ color: "var(--race-muted)" }}>
            The start order is decided by the system from the moment each athlete is checked in. Times are the plan; they shift only if the race is paused.
          </p>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false, slug }: { children: ReactNode; wide?: boolean; slug: string }) {
  return (
    <>
      <RaceHeader wide={wide} right={<StaffNav slug={slug} current="reception" />} />
      <RacePage wide={wide}>{children}</RacePage>
    </>
  );
}
