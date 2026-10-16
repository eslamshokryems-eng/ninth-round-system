"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { METRIC_UNITS, PROVISIONAL_SEASON_RULES, SEASON_TRANSITIONS, weekWindow, type AdminOverview, type AuditLine, type Challenge, type ChallengeInput, type ChallengeStatus, type MetricKind, type SeasonRules } from "@9thround/league";
import { useAction, useCurrentUserId, useOverview } from "../../../../../src/features/league/admin";
import { DemoBanner, fmtPoints } from "../../../../../src/components/league/league-ui";
import { RaceBadge, RaceButton, RaceHeader, RaceInput, RaceNotice, RacePage, RaceSelect, RaceSpinner, RaceTextArea } from "../../../../../src/components/race/race-ui";

const TABS = ["Overview", "Challenges", "Participants", "Attempts", "Points rules", "Standings", "Audit"] as const;
type Tab = (typeof TABS)[number];
const NEXT_CHALLENGE: Record<ChallengeStatus, ChallengeStatus[]> = { draft: ["published"], published: ["open", "draft"], open: ["closed", "published"], closed: [] };

export default function SeasonAdminPage() {
  const { seasonId } = useParams<{ seasonId: string }>();
  const { source, status, data, error, reload } = useOverview(seasonId);
  const [tab, setTab] = useState<Tab>("Overview");
  const act = useAction(reload);
  const me = useCurrentUserId(source);
  return (
    <>
      {source?.demo ? <DemoBanner /> : null}
      <RaceHeader wide right={<a className="race-label" href="/race/league/admin">← Seasons</a>} />
      <RacePage wide>
        {!source || status === "hydrating" ? <RaceSpinner /> : null}
        {status === "signedOut" ? <div className="mt-8 flex flex-col gap-3"><p>Sign in with your league staff account.</p><a className="race-btn self-start" href={`/race/login?next=/race/league/admin/${seasonId}`}>Sign in</a></div> : null}
        {error ? <div className="mt-6"><RaceNotice>{error}</RaceNotice></div> : null}
        {data ? (
          <div className="mt-4 flex flex-col gap-5" data-testid="season-admin">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="race-display text-4xl">{data.season.name}</h1>
              <RaceBadge>{data.season.status}</RaceBadge>
              {data.season.published ? <RaceBadge tone="red">PUBLISHED</RaceBadge> : <RaceBadge>NOT PUBLIC</RaceBadge>}
              {!data.isAdmin ? <RaceBadge>READ / RECORD ONLY</RaceBadge> : null}
            </div>
            <div className="flex flex-wrap gap-2" role="tablist">
              {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); act.clear(); }} className={`race-btn race-btn--sm ${tab === t ? "" : "race-btn--ghost"}`}>{t}</button>)}
            </div>
            {act.message ? (act.message.kind === "error" ? <RaceNotice>{act.message.text}</RaceNotice> : <div className="race-card race-card--flat" role="status" data-testid="ok">{act.message.text}</div>) : null}
            {tab === "Overview" ? <Overview d={data} act={act} slug={data.season.publicSlug} /> : null}
            {tab === "Challenges" ? <Challenges d={data} act={act} /> : null}
            {tab === "Participants" ? <Participants d={data} act={act} /> : null}
            {tab === "Attempts" ? <Attempts d={data} act={act} me={me} /> : null}
            {tab === "Points rules" ? <Rules d={data} act={act} /> : null}
            {tab === "Standings" ? <Standings d={data} /> : null}
            {tab === "Audit" ? <Audit d={data} /> : null}
          </div>
        ) : null}
      </RacePage>
    </>
  );
}

type Act = ReturnType<typeof useAction>;
const gw = () => import("../../../../../src/features/league/source").then((m) => m.getLeagueSource()).then((s) => s.gateway);

function Overview({ d, act, slug }: { d: AdminOverview; act: Act; slug: string }) {
  const [reason, setReason] = useState("");
  const next = SEASON_TRANSITIONS[d.season.status];
  return (
    <div className="grid gap-4 md:grid-cols-2" data-testid="tab-overview">
      <div className="race-card flex flex-col gap-2">
        <p className="race-label">Season</p>
        <p>{d.season.startsOn} → {d.season.endsOn} (8 weeks)</p>
        <p className="lg-sub">Address: <code>{slug}</code></p>
        <p className="lg-sub">Phone page: <a href={`/race/league?season=${slug}`}>/race/league?season={slug}</a> · TV: <a href={`/race/league/tv?season=${slug}`}>/race/league/tv?season={slug}</a></p>
        <p className="lg-sub">{d.challenges.filter((c) => c.status === "closed").length} of 8 challenges closed · {d.participants.length} participants</p>
      </div>
      {d.isAdmin ? (
        <div className="race-card flex flex-col gap-3">
          <p className="race-label">Season status</p>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => <RaceButton key={s} size="sm" disabled={act.busy} onClick={() => void act.run(`Season → ${s}`, async () => (await gw()).setSeasonStatus(d.season.id, s))}>{s === "completed" ? "Complete season (final)" : `Move to ${s}`}</RaceButton>)}
            {next.length === 0 ? <span className="lg-sub">Completed — the results are final and cannot be reopened.</span> : null}
          </div>
          <RaceInput id="pub-reason" label="Reason (required to publish or hide)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <RaceButton size="sm" variant={d.season.published ? "danger" : "primary"} disabled={act.busy || reason.trim() === ""} data-testid="toggle-publish"
            onClick={() => void act.run(d.season.published ? "Hidden from the public" : "Published", async () => (await gw()).setPublished(d.season.id, !d.season.published, reason))}>{d.season.published ? "Hide from the public" : "Publish to the public pages"}</RaceButton>
        </div>
      ) : <div className="race-card"><p className="lg-sub">Only a league administrator changes the season.</p></div>}
    </div>
  );
}

function Challenges({ d, act }: { d: AdminOverview; act: Act }) {
  const [week, setWeek] = useState(1);
  const ch = d.challenges.find((c) => c.weekNumber === week);
  const locked = d.season.status === "completed" || (ch !== undefined && ch.status !== "draft" && ch.status !== "published");
  return (
    <div className="flex flex-col gap-4" data-testid="tab-challenges">
      <div className="grid grid-cols-4 gap-2 md:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => i + 1).map((w) => {
          const c = d.challenges.find((x) => x.weekNumber === w);
          return <button key={w} data-testid={`week-${w}`} onClick={() => setWeek(w)} className={`race-card race-card--flat text-left ${week === w ? "" : ""}`} style={{ borderColor: week === w ? "var(--race-red-hot)" : undefined, padding: "0.6rem" }}>
            <span className="race-label">Week {w}</span><span className="block text-sm">{c ? c.name : "empty"}</span>{c ? <span className="lg-sub">{c.status}</span> : null}</button>;
        })}
      </div>
      {d.isAdmin ? <ChallengeForm key={`${week}-${ch?.id ?? "new"}-${ch?.status ?? ""}`} d={d} week={week} ch={ch} locked={locked} act={act} /> : <RaceNotice>Only a league administrator edits challenges.</RaceNotice>}
    </div>
  );
}

function ChallengeForm({ d, week, ch, locked, act }: { d: AdminOverview; week: number; ch: Challenge | undefined; locked: boolean; act: Act }) {
  const [f, setF] = useState({
    name: ch?.name ?? "", description: ch?.description ?? "", instructions: ch?.instructions ?? "", safetyNotes: ch?.safetyNotes ?? "", kind: (ch?.metric.kind ?? "REPS") as MetricKind, unit: ch?.metric.unit ?? "reps",
    direction: ch?.metric.direction ?? "HIGHER_WINS", maxAttempts: ch?.attemptPolicy.maxAttempts ?? 1, counting: ch?.attemptPolicy.counting ?? "BEST", requiresVerification: ch?.requiresVerification ?? true,
    referenceUrl: ch?.referenceUrl ?? "", opensAt: ch?.opensAt?.slice(0, 16) ?? "", closesAt: ch?.closesAt?.slice(0, 16) ?? "",
  });
  const w = weekWindow(d.season.startsOn, week);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const onKind = (kind: MetricKind) => set({ kind, unit: METRIC_UNITS[kind][0] as string, direction: kind === "TIME" ? "LOWER_WINS" : "HIGHER_WINS" });
  const save = () => {
    const input: ChallengeInput = {
      name: f.name, description: f.description, instructions: f.instructions, safetyNotes: f.safetyNotes, metricKind: f.kind, unit: f.unit, direction: f.direction, maxAttempts: f.maxAttempts, counting: f.counting,
      requiresVerification: f.requiresVerification, referenceUrl: f.referenceUrl.trim() === "" ? null : f.referenceUrl.trim(),
      opensAt: f.opensAt ? new Date(f.opensAt).toISOString() : null, closesAt: f.closesAt ? new Date(f.closesAt).toISOString() : null,
    };
    void act.run(`Week ${week} saved`, async () => (await gw()).upsertChallenge(d.season.id, week, input));
  };
  return (
    <div className="race-card flex flex-col gap-3" data-testid="challenge-form">
      <div className="flex flex-wrap items-center gap-3"><h2 className="race-display text-2xl">Week {week}</h2><span className="lg-sub">{w.from} → {w.to}</span>{ch ? <RaceBadge>{ch.status}</RaceBadge> : <RaceBadge>new</RaceBadge>}</div>
      {locked ? <RaceNotice>{d.season.status === "completed" ? "The season is completed — nothing can change." : "An open or closed challenge can no longer be edited."}</RaceNotice> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <RaceInput id="c-name" label="Name" value={f.name} disabled={locked} onChange={(e) => set({ name: e.target.value })} />
        <RaceSelect id="c-kind" label="Challenge type" value={f.kind} disabled={locked} onChange={(e) => onKind(e.target.value as MetricKind)}>
          {(["TIME", "REPS", "DISTANCE", "LOAD", "NUMERIC"] as const).map((k) => <option key={k} value={k}>{k === "TIME" ? "Time (lower wins)" : k === "REPS" ? "Repetitions (higher wins)" : k === "DISTANCE" ? "Distance (higher wins)" : k === "LOAD" ? "Load (higher wins)" : "Other number"}</option>)}
        </RaceSelect>
        <RaceSelect id="c-unit" label="Unit" value={f.unit} disabled={locked} onChange={(e) => set({ unit: e.target.value })}>{METRIC_UNITS[f.kind].map((u) => <option key={u}>{u}</option>)}</RaceSelect>
        <RaceSelect id="c-dir" label="Ranking direction" value={f.direction} disabled={locked || f.kind !== "NUMERIC"} onChange={(e) => set({ direction: e.target.value as typeof f.direction })} hint={f.kind === "NUMERIC" ? "Only an “other number” challenge can choose." : "Fixed by the challenge type."}>
          <option value="HIGHER_WINS">Higher wins</option><option value="LOWER_WINS">Lower wins</option>
        </RaceSelect>
        <RaceInput id="c-max" type="number" min={1} max={10} label="Attempts allowed" value={f.maxAttempts} disabled={locked} onChange={(e) => set({ maxAttempts: Number(e.target.value) })} hint="PROVISIONAL default: 1" />
        <RaceSelect id="c-count" label="Which attempt counts" value={f.counting} disabled={locked} onChange={(e) => set({ counting: e.target.value as typeof f.counting })} hint="PROVISIONAL default: best">
          <option value="BEST">Best approved attempt</option><option value="LATEST">Latest approved attempt</option><option value="FIRST_APPROVED">First approved attempt</option>
        </RaceSelect>
        <RaceInput id="c-open" type="datetime-local" label="Opens (optional)" value={f.opensAt} disabled={locked} onChange={(e) => set({ opensAt: e.target.value })} />
        <RaceInput id="c-close" type="datetime-local" label="Closes (optional)" value={f.closesAt} disabled={locked} onChange={(e) => set({ closesAt: e.target.value })} />
      </div>
      <RaceTextArea id="c-desc" label="Description" value={f.description} disabled={locked} onChange={(e) => set({ description: e.target.value })} />
      <RaceTextArea id="c-ins" label="Instructions" value={f.instructions} disabled={locked} onChange={(e) => set({ instructions: e.target.value })} />
      <RaceTextArea id="c-safe" label="Safety notes" value={f.safetyNotes} disabled={locked} onChange={(e) => set({ safetyNotes: e.target.value })} />
      <RaceInput id="c-url" label="Reference video / image link (https only, optional)" value={f.referenceUrl} disabled={locked} onChange={(e) => set({ referenceUrl: e.target.value })} />
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.requiresVerification} disabled={locked} onChange={(e) => set({ requiresVerification: e.target.checked })} /> A second person must approve every result before it counts</label>
      <div className="flex flex-wrap gap-2">
        <RaceButton disabled={act.busy || locked} onClick={save} data-testid="save-challenge">Save week {week}</RaceButton>
        {ch ? NEXT_CHALLENGE[ch.status].map((s) => <RaceButton key={s} variant={s === "closed" ? "danger" : "ghost"} disabled={act.busy} data-testid={`to-${s}`} onClick={() => void act.run(`Week ${week} → ${s}`, async () => (await gw()).setChallengeStatus(ch.id, s))}>{s === "closed" ? "Close & award points" : s === "open" ? "Open for attempts" : s === "published" ? "Publish" : "Back to draft"}</RaceButton>) : null}
      </div>
    </div>
  );
}

function Participants({ d, act }: { d: AdminOverview; act: Act }) {
  const [name, setName] = useState("");
  const [ref, setRef] = useState("");
  const [csv, setCsv] = useState("display_name,external_member_ref,eligible\n");
  const [reason, setReason] = useState("");
  const [report, setReport] = useState<string | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_22rem]" data-testid="tab-participants">
      <div className="flex flex-col gap-2">
        {d.isAdmin ? <RaceInput id="p-reason" label="Reason (required to change an athlete)" value={reason} onChange={(e) => setReason(e.target.value)} /> : null}
        {d.participants.map((p) => (
          <div key={p.id} className="race-card race-card--flat flex flex-wrap items-center justify-between gap-2" data-testid="participant-row" style={{ padding: "0.6rem 0.9rem" }}>
            <span><strong>{p.displayName}</strong> <span className="lg-sub">· {p.publicId}{p.externalRef ? ` · ${p.externalRef}` : ""}</span></span>
            <span className="flex flex-wrap gap-2">
              <RaceBadge tone={p.active ? "white" : "line"}>{p.active ? "ACTIVE" : "INACTIVE"}</RaceBadge><RaceBadge tone={p.eligible ? "white" : "red"}>{p.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</RaceBadge>
              {d.isAdmin ? <>
                <RaceButton size="sm" variant="ghost" disabled={act.busy || reason.trim() === ""} onClick={() => void act.run("Participant updated", async () => (await gw()).setParticipant(p.id, { active: !p.active }, reason))}>{p.active ? "Deactivate" : "Reactivate"}</RaceButton>
                <RaceButton size="sm" variant="ghost" disabled={act.busy || reason.trim() === ""} onClick={() => void act.run("Participant updated", async () => (await gw()).setParticipant(p.id, { eligible: !p.eligible }, reason))}>{p.eligible ? "Mark ineligible" : "Mark eligible"}</RaceButton>
              </> : null}
            </span>
          </div>
        ))}
      </div>
      {d.isAdmin ? (
        <div className="flex flex-col gap-4">
          <div className="race-card flex flex-col gap-2">
            <h2 className="race-display text-xl">Add an athlete</h2>
            <RaceInput id="a-name" label="Public display name" value={name} onChange={(e) => setName(e.target.value)} hint="e.g. “Ahmed K.” — shown on the TV and phone pages" />
            <RaceInput id="a-ref" label="Gym member reference (private, optional)" value={ref} onChange={(e) => setRef(e.target.value)} />
            <RaceButton disabled={act.busy || name.trim() === ""} onClick={() => void act.run("Athlete added", async () => { await (await gw()).addParticipant(d.season.id, name, ref.trim() === "" ? null : ref, true); setName(""); setRef(""); })}>Add</RaceButton>
          </div>
          <div className="race-card flex flex-col gap-2">
            <h2 className="race-display text-xl">Import from CSV</h2>
            <p className="lg-sub">Columns: display_name (or full_name), external_member_ref, eligible. Cells starting with = + - @ are refused. Duplicates are reported, never merged.</p>
            <RaceTextArea id="a-csv" label="CSV" value={csv} onChange={(e) => setCsv(e.target.value)} style={{ minHeight: 140, fontFamily: "monospace" }} />
            <RaceButton disabled={act.busy} data-testid="import" onClick={() => void act.run("Import", async () => { const r = await (await gw()).importParticipants(d.season.id, csv); setReport(`${r.added} added, ${r.issues.length} issue(s)${r.issues.length ? ": " + r.issues.slice(0, 8).map((i) => `row ${i.row} ${i.message}`).join("; ") : ""}`); })}>Validate & import</RaceButton>
            {report ? <p data-testid="import-report" className="lg-sub">{report}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Attempts({ d, act, me }: { d: AdminOverview; act: Act; me: string | null }) {
  const open = d.challenges.filter((c) => c.status === "open");
  const [challengeId, setChallengeId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [value, setValue] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [reason, setReason] = useState("");
  const [fix, setFix] = useState("");
  const names = useMemo(() => new Map(d.participants.map((p) => [p.id, p.displayName])), [d.participants]);
  const chName = useMemo(() => new Map(d.challenges.map((c) => [c.id, `W${c.weekNumber} ${c.name}`])), [d.challenges]);
  useEffect(() => { if (!challengeId && open[0]) setChallengeId(open[0].id); }, [open, challengeId]);
  const pending = d.attempts.filter((a) => a.status === "pending");
  return (
    <div className="grid gap-4 md:grid-cols-[22rem_1fr]" data-testid="tab-attempts">
      <div className="race-card flex flex-col gap-2">
        <h2 className="race-display text-xl">Record an attempt</h2>
        {open.length === 0 ? <p className="lg-sub">No challenge is open for attempts.</p> : null}
        <RaceSelect id="r-ch" label="Challenge" value={challengeId} onChange={(e) => setChallengeId(e.target.value)}>{open.map((c) => <option key={c.id} value={c.id}>Week {c.weekNumber} — {c.name}</option>)}</RaceSelect>
        <RaceSelect id="r-p" label="Athlete" value={participantId} onChange={(e) => setParticipantId(e.target.value)}><option value="">Choose…</option>{d.participants.filter((p) => p.active && p.eligible).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</RaceSelect>
        <RaceInput id="r-v" inputMode="decimal" label={`Result${open.find((c) => c.id === challengeId) ? ` (${open.find((c) => c.id === challengeId)?.metric.unit})` : ""}`} value={value} onChange={(e) => setValue(e.target.value)} />
        <RaceButton disabled={act.busy || !challengeId || !participantId || value.trim() === ""} data-testid="record" onClick={() => void act.run("Attempt recorded", async () => { await (await gw()).recordAttempt({ challengeId, participantId, value: Number(value), clientRequestId: requestId }); setValue(""); setRequestId(crypto.randomUUID()); })}>Record</RaceButton>
        <p className="lg-sub">A retry of the same press is safe: it is recorded once.</p>
      </div>
      <div className="flex flex-col gap-3">
        <RaceInput id="r-reason" label="Reason (required to reject or correct)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <h2 className="race-display text-xl">Waiting for review ({pending.length})</h2>
        {pending.length === 0 ? <p className="lg-sub">Nothing waiting.</p> : null}
        {pending.map((a) => (
          <div key={a.id} className="race-card race-card--flat flex flex-wrap items-center justify-between gap-2" data-testid="pending-attempt" style={{ padding: "0.6rem 0.9rem" }}>
            <span>{names.get(a.participantId)} · <strong>{a.value} {a.unit}</strong> <span className="lg-sub">· {chName.get(a.challengeId)}{a.recordedBy === me ? " · you recorded this" : ""}</span></span>
            <span className="flex gap-2">
              <RaceButton size="sm" disabled={act.busy} data-testid="approve" onClick={() => void act.run("Approved", async () => (await gw()).reviewAttempt(a.id, "approve"))}>Approve</RaceButton>
              <RaceButton size="sm" variant="danger" disabled={act.busy || reason.trim() === ""} onClick={() => void act.run("Rejected", async () => (await gw()).reviewAttempt(a.id, "reject", reason))}>Reject</RaceButton>
            </span>
          </div>
        ))}
        <h2 className="race-display mt-2 text-xl">All attempts</h2>
        {d.attempts.filter((a) => a.status !== "pending").slice(0, 60).map((a) => (
          <div key={a.id} className="race-card race-card--flat flex flex-wrap items-center justify-between gap-2" style={{ padding: "0.5rem 0.9rem" }} data-testid="attempt-row">
            <span>{names.get(a.participantId)} · {a.value} {a.unit} <span className="lg-sub">· {chName.get(a.challengeId)} · attempt {a.attemptNo}{a.correctedFrom ? " · correction" : ""}{a.reason ? ` · ${a.reason}` : ""}</span></span>
            <span className="flex items-center gap-2"><RaceBadge tone={a.status === "approved" ? "white" : a.status === "rejected" ? "red" : "line"}>{a.status}</RaceBadge>
              {d.isAdmin && a.status === "approved" ? <><input aria-label="Corrected value" className="race-input" style={{ width: "6rem", minHeight: 0, padding: "0.3rem" }} placeholder="new value" value={fix} onChange={(e) => setFix(e.target.value)} />
                <RaceButton size="sm" variant="ghost" disabled={act.busy || reason.trim() === "" || fix.trim() === ""} onClick={() => void act.run("Corrected", async () => (await gw()).correctAttempt(a.id, Number(fix), reason))}>Correct</RaceButton>
                <RaceButton size="sm" variant="danger" disabled={act.busy || reason.trim() === ""} onClick={() => void act.run("Voided", async () => (await gw()).correctAttempt(a.id, null, reason))}>Void</RaceButton></> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Rules({ d, act }: { d: AdminOverview; act: Act }) {
  const r = d.season.rules;
  const [table, setTable] = useState(r.points.byRank.join(", "));
  const [beyond, setBeyond] = useState(String(r.points.beyond));
  const [part, setPart] = useState(String(r.points.participation));
  const [absent, setAbsent] = useState(String(r.points.absent));
  const [tie, setTie] = useState(r.tiePolicy);
  const [abs, setAbs] = useState(r.absencePolicy);
  const [elig, setElig] = useState(r.eligibility);
  const [reason, setReason] = useState("");
  const rules: SeasonRules = { points: { byRank: table.split(",").map((x) => Number(x.trim())), beyond: Number(beyond), participation: Number(part), absent: Number(absent) }, tiePolicy: tie, absencePolicy: abs, eligibility: elig };
  const isDefault = JSON.stringify(r) === JSON.stringify(PROVISIONAL_SEASON_RULES);
  return (
    <div className="race-card flex flex-col gap-3" data-testid="tab-rules">
      <div className="flex items-center gap-3"><h2 className="race-display text-2xl">Points rules</h2><RaceBadge tone="red">PROVISIONAL — NOT APPROVED</RaceBadge></div>
      <RaceNotice>{isDefault ? "These are the development defaults. " : ""}The real points table, tie handling, absence and eligibility rules have not been decided. Changing a rule re-scores closed challenges by appending corrections; it never rewrites history.</RaceNotice>
      <RaceInput id="pt" label="Points for rank 1, 2, 3 … (comma separated, never increasing)" value={table} disabled={!d.isAdmin} onChange={(e) => setTable(e.target.value)} />
      <div className="grid gap-3 md:grid-cols-3">
        <RaceInput id="pb" label="Points beyond the table" value={beyond} disabled={!d.isAdmin} onChange={(e) => setBeyond(e.target.value)} />
        <RaceInput id="pp" label="Participation floor" value={part} disabled={!d.isAdmin} onChange={(e) => setPart(e.target.value)} hint="Minimum for any approved result" />
        <RaceInput id="pa" label="Points for an absent athlete" value={absent} disabled={!d.isAdmin} onChange={(e) => setAbsent(e.target.value)} />
        <RaceSelect id="tie" label="Equal results" value={tie} disabled={!d.isAdmin} onChange={(e) => setTie(e.target.value as typeof tie)}><option value="SHARE">All get the points of the shared rank</option><option value="SPLIT">Split the points of the places they occupy</option></RaceSelect>
        <RaceSelect id="abs" label="Absence" value={abs} disabled={!d.isAdmin} onChange={(e) => setAbs(e.target.value as typeof abs)}><option value="ZERO">Absent = the “absent” points</option><option value="PARTICIPATION">Absent = the participation floor</option></RaceSelect>
        <RaceSelect id="elig" label="Eligibility" value={elig} disabled={!d.isAdmin} onChange={(e) => setElig(e.target.value as typeof elig)}><option value="AT_REGISTRATION">Checked when the athlete is added</option><option value="ENTIRE_SEASON">Must be in from the first day</option></RaceSelect>
      </div>
      {d.isAdmin ? <>
        <RaceInput id="rr" label="Reason for the change (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <RaceButton disabled={act.busy || reason.trim() === "" || d.season.status === "completed"} data-testid="save-rules" onClick={() => void act.run("Rules saved", async () => (await gw()).updateRules(d.season.id, rules, reason))}>Save rules</RaceButton>
      </> : <p className="lg-sub">Only a league administrator changes the rules.</p>}
    </div>
  );
}

function Standings({ d }: { d: AdminOverview }) {
  return (
    <div className="flex flex-col gap-2" data-testid="tab-standings">
      {d.standings.map((s) => (
        <div key={s.id} className="race-card race-card--flat flex items-center justify-between gap-3" style={{ padding: "0.5rem 0.9rem" }}>
          <span><strong>{s.rank}.</strong> {s.displayName} <span className="lg-sub">· {s.challengesCompleted} challenges · {s.firstPlaces} wins · weekly {Object.entries(s.weeklyPoints).map(([w, p]) => `W${w}:${fmtPoints(p)}`).join(" ") || "—"}</span></span>
          <strong>{fmtPoints(s.totalPoints)} pts</strong>
        </div>
      ))}
    </div>
  );
}

function Audit({ d }: { d: AdminOverview }) {
  const [lines, setLines] = useState<readonly AuditLine[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void gw().then((g) => g.audit(d.season.id, 200)).then(setLines).catch(() => setErr("The audit trail is for league administrators.")); }, [d.season.id]);
  if (err) return <RaceNotice>{err}</RaceNotice>;
  if (!lines) return <RaceSpinner />;
  return (
    <div className="flex flex-col gap-1" data-testid="tab-audit">
      {lines.map((l, i) => <div key={i} className="race-card race-card--flat" style={{ padding: "0.4rem 0.8rem" }}><span className="lg-sub">{new Date(l.at).toLocaleString()} · {l.actor ?? "system"}</span> <strong>{l.action}</strong> <span className="lg-sub">{JSON.stringify(l.metadata)}</span></div>)}
      {lines.length === 0 ? <p className="lg-sub">Nothing recorded yet.</p> : null}
    </div>
  );
}
