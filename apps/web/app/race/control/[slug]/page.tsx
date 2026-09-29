"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatCountdown, formatRaceClock, parseRaceNumberQuery } from "@9thround/race";
import type { AttentionAthlete, ControlState, PublicRaceEvent, QueueEntry, StaffRegistrationRow } from "@9thround/race";
import { getRaceModule } from "../../../../src/lib/composition-root";
import { useAuthStore } from "../../../../src/features/auth/store";
import { useRaceControl } from "../../../../src/features/race/use-race-control";
import { RaceBadge, RaceButton, RaceHeader, RaceInput, RaceNotice, RacePage, RaceSpinner, StaffNav } from "../../../../src/components/race/race-ui";

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function MasterControlPage() {
  const { slug } = useParams<{ slug: string }>();
  const authStatus = useAuthStore((s) => s.status);
  const [event, setEvent] = useState<PublicRaceEvent | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus !== "signedIn") return;
    let cancelled = false;
    void getRaceModule()
      .getPublicEvent.execute(slug)
      .then((r) => {
        if (cancelled) return;
        if (r.isOk) setEvent(r.value);
        else setLoadError(r.error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, slug]);

  if (authStatus === "hydrating") return <Shell slug={slug}><RaceSpinner /></Shell>;
  if (authStatus === "signedOut") {
    return (
      <Shell slug={slug}>
        <div className="mt-10 flex flex-col gap-4">
          <h1 className="race-display text-5xl">Sign in required</h1>
          <a href={`/race/login?next=/race/control/${slug}`} className="race-btn self-start">Sign in</a>
        </div>
      </Shell>
    );
  }
  if (loadError) return <Shell slug={slug}><RaceNotice>{loadError}</RaceNotice></Shell>;
  if (!event) return <Shell slug={slug}><RaceSpinner /></Shell>;
  return <Dashboard slug={slug} event={event} />;
}

function Dashboard({ slug, event }: { slug: string; event: PublicRaceEvent }) {
  const { state, error, raceMs, uncertaintyMs, offline, refresh } = useRaceControl(event.eventId);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const announced = useRef(new Set<string>());

  async function run<T>(label: string, action: () => Promise<{ isErr: boolean; error?: { message: string }; value?: T }>, success?: (v: T) => string) {
    if (busy) return false;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    const r = await action();
    setBusy(false);
    if (r.isErr) {
      setActionError(r.error?.message ?? `${label} failed.`);
      return false;
    }
    if (success && r.value !== undefined) setNotice(success(r.value));
    await refresh();
    return true;
  }

  // Voice: "next athlete in ten seconds" — once per athlete, only after the operator switched voice on (browsers need a tap first).
  const next = state?.nextAthlete ?? null;
  useEffect(() => {
    if (!voiceOn || !state || !next || raceMs === null) return;
    if (announced.current.has(next.registrationId)) return;
    if (next.startMs - state.event.announceLeadMs > raceMs) return;
    announced.current.add(next.registrationId);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const digits = next.raceNumber.replace(/^\D+/, "").replace(/^0+/, "") || "0";
      const u = new SpeechSynthesisUtterance(`Next athlete. Number ${digits}. ${next.fullName}. Ten seconds.`);
      window.speechSynthesis.speak(u);
    }
  }, [voiceOn, state, next, raceMs]);

  if (!state) {
    return (
      <Shell slug={slug} wide>
        {error ? <RaceNotice>{error}</RaceNotice> : <RaceSpinner />}
      </Shell>
    );
  }

  const clock = state.clock;
  const canStart = !clock.started && event.heatsLocked;
  const heatsAwaiting = state.heats.filter((h) => h.status === "AWAITING_START");
  const nextManual = heatsAwaiting[0] ?? null;
  const startsIn = next && raceMs !== null ? next.startMs - raceMs : null;

  return (
    <Shell slug={slug} wide>
      <div className="mt-2 flex flex-col gap-6">
        {error ? <RaceNotice>{error}</RaceNotice> : null}
        {offline ? <RaceNotice>Connection problem — the clock below is an estimate. The race itself is unaffected: it is timed by the server.</RaceNotice> : null}
        {actionError ? <RaceNotice>{actionError}</RaceNotice> : null}
        {notice ? <div className="race-card race-card--flat" role="status">{notice}</div> : null}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" aria-label="Race clock">
          <div className="race-card flex flex-col gap-3" style={{ borderLeftColor: clock.paused ? "var(--race-red-hot)" : undefined }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="race-kicker">{event.name} · Master Control</p>
              <div className="flex gap-2">
                {clock.paused ? <RaceBadge tone="red">PAUSED</RaceBadge> : null}
                {clock.finished ? <RaceBadge tone="white">FINISHED</RaceBadge> : clock.started ? <RaceBadge tone="white">LIVE</RaceBadge> : <RaceBadge>Not started</RaceBadge>}
                {clock.preRace ? <RaceBadge tone="red">PRE-RACE</RaceBadge> : null}
              </div>
            </div>
            <div className="race-number-plate" aria-label="Race clock" data-testid="race-clock" style={{ fontSize: "clamp(4rem, 14vw, 9rem)" }}>
              {raceMs === null ? "0:00" : formatRaceClock(raceMs)}
            </div>
            {clock.preRace && startsIn !== null ? (
              <p className="race-display text-3xl" data-testid="pre-race">First athlete in {formatCountdown(startsIn)}</p>
            ) : null}
            {uncertaintyMs !== null ? <p className="text-xs" style={{ color: "var(--race-muted)" }}>Server clock ± {Math.round(uncertaintyMs)} ms</p> : null}

            <div className="mt-2 flex flex-wrap gap-3">
              {!clock.started ? (
                confirmStart ? (
                  <>
                    <RaceButton
                      isLoading={busy}
                      onClick={() => void run("Start", () => getRaceModule().startEvent.execute(event.eventId), (v) => `Race started. First athlete in ${formatCountdown(v.firstStartMs)}.`).then(() => setConfirmStart(false))}
                      style={{ minHeight: 72, fontSize: "1.4rem" }}
                    >
                      Confirm — START EVENT
                    </RaceButton>
                    <RaceButton variant="ghost" onClick={() => setConfirmStart(false)}>Cancel</RaceButton>
                  </>
                ) : (
                  <RaceButton disabled={!canStart} onClick={() => setConfirmStart(true)} style={{ minHeight: 72, fontSize: "1.4rem" }}>START EVENT</RaceButton>
                )
              ) : null}
              {clock.started && !clock.finished && !clock.paused ? (
                <RaceButton
                  variant="danger"
                  isLoading={busy}
                  onClick={() => void run("Pause", () => getRaceModule().pauseRace.execute({ eventId: event.eventId, reason: "Emergency pause" }), () => "Race PAUSED. Every clock is frozen.")}
                  style={{ minHeight: 72, fontSize: "1.4rem" }}
                >
                  EMERGENCY PAUSE
                </RaceButton>
              ) : null}
              {clock.paused ? (
                <RaceButton isLoading={busy} onClick={() => void run("Resume", () => getRaceModule().resumeRace.execute(event.eventId), (v) => `Race resumed after ${formatCountdown(v.pausedMs)} of pause.`)} style={{ minHeight: 72, fontSize: "1.4rem" }}>
                  RESUME RACE
                </RaceButton>
              ) : null}
              <RaceButton variant="ghost" size="sm" aria-pressed={voiceOn} onClick={() => setVoiceOn((v) => !v)}>
                {voiceOn ? "Voice: on" : "Voice: off"}
              </RaceButton>
            </div>
            {!clock.started && !event.heatsLocked ? <RaceNotice>Lock the heats (Event Manager) before starting the event.</RaceNotice> : null}
          </div>

          <div className="race-card flex flex-col gap-3" aria-label="Next athlete">
            <p className="race-kicker">Next athlete</p>
            {next ? (
              <>
                <div className="race-number-plate" style={{ fontSize: "clamp(3.5rem, 10vw, 6rem)" }}>{next.raceNumber}</div>
                <p className="race-display text-3xl">{next.fullName}</p>
                <p style={{ color: "var(--race-muted)" }}>Heat {pad2(next.heat)} · slot {pad2(next.slotIndex + 1)}</p>
                <p className="race-display text-4xl" data-testid="next-countdown">{startsIn !== null ? formatCountdown(startsIn) : "—"}</p>
                {startsIn !== null && startsIn <= state.event.announceLeadMs ? <RaceBadge tone="red">GO TO START LINE</RaceBadge> : null}
              </>
            ) : (
              <p style={{ color: "var(--race-muted)" }}>{clock.finished ? "The race is over." : clock.started ? "Nobody is waiting at the moment." : "The first athlete appears when the race starts."}</p>
            )}
            <Counts state={state} />
          </div>
        </section>

        {nextManual ? (
          <div className="race-card race-card--flat flex flex-wrap items-center justify-between gap-3">
            <p>Heat {pad2(nextManual.number)} starts on your command ({nextManual.roster} athletes).</p>
            <RaceButton isLoading={busy} onClick={() => void run("Start heat", () => getRaceModule().startNextHeat.execute({ eventId: event.eventId, heatNumber: nextManual.number }), (v) => `Heat ${pad2(v.heatNumber)} anchored.`)}>
              START HEAT {pad2(nextManual.number)}
            </RaceButton>
          </div>
        ) : null}

        <section aria-label="Stations" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.stations.map((s) => {
            const remaining = s.state !== "IDLE" && raceMs !== null && s.windowEndMs !== null && s.scoringEndMs !== null
              ? s.state === "WORK" && raceMs < s.windowEndMs ? s.windowEndMs - raceMs : Math.max(0, s.scoringEndMs - raceMs)
              : null;
            const working = s.state === "WORK" && raceMs !== null && s.windowEndMs !== null && raceMs < s.windowEndMs;
            return (
              <div key={s.number} className="race-card race-card--flat flex flex-col gap-1" data-testid={`station-${s.number}`} style={{ borderLeftColor: working ? "var(--race-red-hot)" : undefined }}>
                <div className="flex items-center justify-between">
                  <span className="race-display text-2xl">{s.name}</span>
                  <RaceBadge tone={working ? "red" : "line"}>{s.state === "IDLE" ? "Free" : working ? "WORK" : "0:30 scoring"}</RaceBadge>
                </div>
                {s.athlete ? (
                  <>
                    <span className="race-display text-3xl">{s.athlete.raceNumber}</span>
                    <span>{s.athlete.fullName}</span>
                    <span className="race-display text-2xl">{remaining !== null ? formatCountdown(remaining) : ""}</span>
                  </>
                ) : (
                  <span style={{ color: "var(--race-muted)" }}>—</span>
                )}
              </div>
            );
          })}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <SkipPanel state={state} raceMs={raceMs} busy={busy} run={run} />
          <ExceptionsPanel state={state} run={run} />
        </div>

        <CorrectionPanel event={event} state={state} busy={busy} run={run} />

        <section aria-label="Heats" className="race-card race-card--flat overflow-x-auto p-0">
          <table className="race-table">
            <thead>
              <tr><th>Heat</th><th>Status</th><th>Start</th><th>Roster</th><th>Started</th><th>Waiting</th><th>Empty</th><th>Skipped</th></tr>
            </thead>
            <tbody>
              {state.heats.map((h) => (
                <tr key={h.number}>
                  <td className="race-display text-xl">{pad2(h.number)}</td>
                  <td>{h.status.replace("_", " ")}{h.startMode === "MANUAL" ? " · manual" : ""}</td>
                  <td>{h.anchorMs === null ? "—" : formatRaceClock(h.anchorMs)}</td>
                  <td>{h.roster}</td><td>{h.started}</td><td>{h.bound + h.open}</td><td>{h.empty}</td><td>{h.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Shell>
  );
}

function Counts({ state }: { state: ControlState }) {
  const c = state.counts;
  const items: [string, number][] = [["Registered", c.registered], ["Checked in", c.checkedIn], ["Racing", c.racing], ["Finished", c.finished], ["DNS", c.dns], ["DNF", c.dnf]];
  return (
    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
      {items.map(([label, n]) => (
        <div key={label}>
          <div className="race-display text-2xl">{n}</div>
          <div className="race-label">{label}</div>
        </div>
      ))}
    </div>
  );
}

type Run = <T>(label: string, action: () => Promise<{ isErr: boolean; error?: { message: string }; value?: T }>, success?: (v: T) => string) => Promise<boolean>;

/** Athlete → reason → confirm. The reason is mandatory and goes to the audit log. */
function SkipPanel({ state, raceMs, busy, run }: { state: ControlState; raceMs: number | null; busy: boolean; run: Run }) {
  const [target, setTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  return (
    <section className="race-card race-card--flat flex flex-col gap-3" aria-label="Skip athlete">
      <div>
        <p className="race-kicker">Skip athlete</p>
        <p className="text-sm" style={{ color: "var(--race-muted)" }}>The slot stays empty. Nobody moves up and no other start time changes.</p>
      </div>
      {state.skippable.length === 0 ? <p style={{ color: "var(--race-muted)" }}>Nobody can be skipped right now.</p> : null}
      <ul className="flex flex-col gap-2">
        {state.skippable.map((s) => {
          const startsIn = raceMs === null ? s.startsInMs : s.startMs - raceMs;
          return (
            <li key={s.slotId} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="race-display text-2xl">{s.raceNumber}</span> <span className="ml-2">{s.fullName}</span>
                  {s.isOverflow ? <span className="ml-2"><RaceBadge>Overflow</RaceBadge></span> : null}
                  <span className="ml-2 text-sm" style={{ color: "var(--race-muted)" }}>Heat {pad2(s.heat)} · {startsIn > 0 ? `starts in ${formatCountdown(startsIn)}` : "started"}</span>
                </span>
                <RaceButton size="sm" variant="danger" onClick={() => { setTarget(target === s.slotId ? null : s.slotId); setReason(""); }}>SKIP</RaceButton>
              </div>
              {target === s.slotId ? (
                <div className="flex flex-col gap-2">
                  <RaceInput id={`skip-reason-${s.slotId}`} label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
                  <RaceButton
                    variant="danger"
                    isLoading={busy}
                    disabled={reason.trim() === ""}
                    onClick={() => void run("Skip", () => getRaceModule().skipAthlete.execute({ slotId: s.slotId, reason }), (v) => `${v.raceNumber} skipped — slot ${pad2(v.slotIndex + 1)} stays empty.`).then((ok) => ok && setTarget(null))}
                  >
                    Confirm skip {s.raceNumber}
                  </RaceButton>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** DNS athletes and late athletes with no safe slot — Event Manager decisions. The server says NO SLOT AVAILABLE rather than displace anyone. */
function ExceptionsPanel({ state, run }: { state: ControlState; run: Run }) {
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [heat, setHeat] = useState<string>("");
  const laterHeats = (from: number | null) => state.heats.filter((h) => h.anchorMs !== null && h.status !== "FINISHED" && (from === null || h.number > from));

  // a plain render function (not a component) so typing in the reason box never remounts the row and steals focus
  function renderItem(a: AttentionAthlete & { wasSkipped?: boolean }, kind: "dns" | "move") {
    const key = `${kind}-${a.registrationId}`;
    return (
      <li key={key} className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span>
            <span className="race-display text-2xl">{a.raceNumber}</span> <span className="ml-2">{a.fullName}</span>
            {a.heat !== null ? <span className="ml-2 text-sm" style={{ color: "var(--race-muted)" }}>Heat {pad2(a.heat)}{a.wasSkipped ? " · skipped" : ""}</span> : null}
          </span>
          <RaceButton size="sm" variant="ghost" onClick={() => { setOpen(open === key ? null : key); setReason(""); setHeat(""); }}>
            {kind === "dns" ? "Override DNS" : "Move to later heat"}
          </RaceButton>
        </div>
        {open === key ? (
          <div className="flex flex-col gap-2">
            {kind === "move" ? (
              <label className="race-label flex flex-col gap-1">
                Target heat
                <select className="race-input" value={heat} onChange={(e) => setHeat(e.target.value)}>
                  <option value="">Choose…</option>
                  {laterHeats(a.heat).map((h) => <option key={h.number} value={h.number}>Heat {pad2(h.number)}</option>)}
                </select>
              </label>
            ) : null}
            <RaceInput id={`ex-reason-${key}`} label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
            <RaceButton
              disabled={reason.trim() === "" || (kind === "move" && heat === "")}
              onClick={() =>
                void (kind === "dns"
                  ? run("Override", () => getRaceModule().overrideDns.execute({ registrationId: a.registrationId, reason }), (v) =>
                      v.outcome === "NO_SLOT_AVAILABLE"
                        ? `NO SLOT AVAILABLE in heat ${pad2(v.heatNumber)} — nobody was displaced. Move ${a.raceNumber} to a later heat if one has room.`
                        : `${a.raceNumber} is back in — queue position ${v.queuePosition ?? "?"}.`)
                  : run("Move", () => getRaceModule().moveToLaterHeat.execute({ registrationId: a.registrationId, targetHeatNumber: Number(heat), reason }), (v) => `${a.raceNumber} moved to heat ${pad2(v.heatNumber)}.`)
                ).then(() => setOpen(null))
              }
            >
              Confirm
            </RaceButton>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <section className="race-card race-card--flat flex flex-col gap-3" aria-label="Needs the Event Manager">
      <div>
        <p className="race-kicker">Event Manager</p>
        <p className="text-sm" style={{ color: "var(--race-muted)" }}>Overrides look for a safe slot. If there is none they say so — assigned athletes are never moved.</p>
      </div>
      {state.attention.noSlot.length > 0 ? <p className="race-label">No slot available</p> : null}
      <ul className="flex flex-col gap-3">{state.attention.noSlot.map((a) => renderItem(a, "move"))}</ul>
      {state.attention.dns.length > 0 ? <p className="race-label">DNS</p> : null}
      <ul className="flex flex-col gap-3">{state.attention.dns.map((a) => renderItem(a, "dns"))}</ul>
      {state.attention.noSlot.length === 0 && state.attention.dns.length === 0 ? <p style={{ color: "var(--race-muted)" }}>Nothing needs attention.</p> : null}
    </section>
  );
}

/** Master Control only: swap the wrongly checked-in athlete for the right one. The original check-in is kept, never deleted. */
function CorrectionPanel({ event, state, busy, run }: { event: PublicRaceEvent; state: ControlState; busy: boolean; run: Run }) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [wrong, setWrong] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<StaffRegistrationRow[]>([]);
  const [right, setRight] = useState<StaffRegistrationRow | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    void getRaceModule().getQueue.execute({ eventId: event.eventId }).then((r) => r.isOk && setQueue(r.value.filter((q) => q.raceStatus === "CHECKED_IN" || q.raceStatus === "LATE_CHECK_IN")));
  }, [open, event.eventId, state.counts.checkedIn]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q === "") {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void getRaceModule().listRegistrations.execute({ eventId: event.eventId, query: q, limit: 6 }).then((r) => {
        if (cancelled || r.isErr) return;
        setMatches(r.value.filter((m) => m.raceStatus === "REGISTERED" && m.status === "CONFIRMED"));
        if (parseRaceNumberQuery(q) !== null && r.value.length === 1) setRight(r.value[0]!);
      });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query, event.eventId]);

  return (
    <section className="race-card race-card--flat flex flex-col gap-3" aria-label="Correct check-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="race-kicker">Correct a wrong check-in</p>
          <p className="text-sm" style={{ color: "var(--race-muted)" }}>Master Control only. The right athlete inherits the original arrival time; the original check-in is kept and marked superseded.</p>
        </div>
        <RaceButton size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Open"}</RaceButton>
      </div>
      {open ? (
        <div className="flex flex-col gap-3">
          <label className="race-label flex flex-col gap-1">
            Checked in by mistake
            <select className="race-input" value={wrong} onChange={(e) => setWrong(e.target.value)}>
              <option value="">Choose…</option>
              {queue.map((q) => <option key={q.registrationId} value={q.registrationId}>{q.raceNumber} · {q.fullName} · heat {pad2(q.heatNumber)}</option>)}
            </select>
          </label>
          <RaceInput id="correct-right-search" label="Who actually arrived (number, phone or name)" value={query} onChange={(e) => { setQuery(e.target.value); setRight(null); }} autoComplete="off" />
          {!right ? (
            <ul className="flex flex-col gap-2">
              {matches.map((m) => (
                <li key={m.registrationId}>
                  <button type="button" className="race-choice w-full text-left" onClick={() => setRight(m)}>
                    <span className="race-display text-xl">{m.raceNumber}</span> <span className="ml-2">{m.fullName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p><span className="race-display text-2xl">{right.raceNumber}</span> <span className="ml-2">{right.fullName}</span></p>
          )}
          <RaceInput id="correct-reason" label="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
          <RaceButton
            isLoading={busy}
            disabled={wrong === "" || !right || reason.trim() === ""}
            onClick={() => right && void run("Correction", () => getRaceModule().correctCheckIn.execute({ wrongRegistrationId: wrong, rightRegistrationId: right.registrationId, reason }), (v) => `Corrected — queue position ${v.queuePosition}${v.slotRebound ? " · start slot handed over" : ""}.`).then((ok) => { if (ok) { setWrong(""); setRight(null); setQuery(""); setReason(""); } })}
          >
            Apply correction
          </RaceButton>
        </div>
      ) : null}
    </section>
  );
}

function Shell({ children, wide = false, slug }: { children: React.ReactNode; wide?: boolean; slug: string }) {
  return (
    <>
      <RaceHeader wide={wide} right={<StaffNav slug={slug} current="control" />} />
      <RacePage wide={wide}>{children}</RacePage>
    </>
  );
}
