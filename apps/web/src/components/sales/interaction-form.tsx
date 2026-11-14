"use client";

import { useState } from "react";
import type { InteractionKind, InteractionOutcome, InterestLevel, LeadLostReason, NextActionKind } from "@9thround/sales";
import { isTerminalOutcome, suggestNextActionAt } from "@9thround/sales";
import { getSalesModule } from "../../lib/composition-root";
import { Button } from "../ui/button";
import { SelectField } from "../ui/select-field";
import { TextAreaField, TextField } from "../ui/text-field";

const KINDS: { value: InteractionKind; label: string }[] = [
  { value: "call", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp contact" },
  { value: "visit", label: "Gym visit" },
];
const OUTCOMES: { value: InteractionOutcome; label: string }[] = [
  { value: "no_answer", label: "No answer" },
  { value: "message_sent", label: "Message sent (waiting for a reply)" },
  { value: "interested", label: "Interested" },
  { value: "wants_visit", label: "Wants to visit the gym" },
  { value: "ready_to_join", label: "Ready to join" },
  { value: "not_ready", label: "Not ready yet" },
  { value: "attended_visit", label: "Attended a visit" },
  { value: "no_show", label: "Did not show up" },
  { value: "not_interested", label: "Not interested (close the lead)" },
  { value: "other", label: "Other" },
];
const NEXT_KINDS: { value: NextActionKind; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visit", label: "Gym visit" },
  { value: "other", label: "Other" },
];
const LOST: { value: LeadLostReason; label: string }[] = [
  { value: "not_interested", label: "Not interested" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "chose_competitor", label: "Chose a competitor" },
  { value: "unreachable", label: "Unreachable" },
  { value: "other", label: "Other" },
];

/** `datetime-local` value (browser local time) for a Date. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface InteractionFormProps {
  leadId: string;
  leadName: string;
  defaultKind?: InteractionKind;
  onDone: (message: string) => void;
  onCancel: () => void;
}

/**
 * "Record contact": what happened + what happens next, in one atomic step. The system records that the employee logged a call / WhatsApp
 * contact / visit — it never sends a message itself (WhatsApp is only opened from the lead card).
 */
export function InteractionForm({ leadId, leadName, defaultKind = "call", onDone, onCancel }: InteractionFormProps) {
  const [kind, setKind] = useState<InteractionKind>(defaultKind);
  const [outcome, setOutcome] = useState<InteractionOutcome>("no_answer");
  const [note, setNote] = useState("");
  const [nextKind, setNextKind] = useState<NextActionKind>("call");
  const [nextAt, setNextAt] = useState(toLocalInput(suggestNextActionAt("no_answer")));
  const [lost, setLost] = useState<LeadLostReason | "">("");
  const [interest, setInterest] = useState<InterestLevel | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closing = isTerminalOutcome(outcome);

  function pickOutcome(o: InteractionOutcome) {
    setOutcome(o);
    if (!isTerminalOutcome(o)) setNextAt(toLocalInput(suggestNextActionAt(o))); // an editable suggestion, not an enforced interval
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await getSalesModule().logLeadInteraction.execute({
      leadId, kind, outcome, note,
      nextKind: closing ? null : nextKind,
      nextAt: closing || !nextAt ? null : new Date(nextAt),
      lostReason: closing && lost ? lost : null,
      interestLevel: interest || null,
    });
    setBusy(false);
    if (result.isErr) { setError(result.error.message); return; }
    onDone(closing ? `${leadName} was closed as lost.` : `Contact recorded. Next action scheduled for ${new Date(nextAt).toLocaleString()}.`);
  }

  return (
    <div className="space-y-3 rounded-card border border-gold/30 bg-surface p-4" data-testid="interaction-form">
      <p className="text-sm font-semibold text-ink">Record contact — {leadName}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="What did you do?" value={kind} onChange={(e) => setKind(e.target.value as InteractionKind)}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </SelectField>
        <SelectField label="How did it go?" value={outcome} onChange={(e) => pickOutcome(e.target.value as InteractionOutcome)}>
          {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </SelectField>
      </div>
      <TextAreaField label="Notes" value={note} onChange={(e) => setNote(e.target.value)} />
      {closing ? (
        <SelectField label="Why is the lead lost?" value={lost} onChange={(e) => setLost(e.target.value as LeadLostReason)}>
          <option value="">Select a reason…</option>
          {LOST.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </SelectField>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Next action" value={nextKind} onChange={(e) => setNextKind(e.target.value as NextActionKind)}>
            {NEXT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </SelectField>
          <TextField label="When" type="datetime-local" value={nextAt} onChange={(e) => setNextAt(e.target.value)} />
        </div>
      )}
      <SelectField label="Interest level (optional)" value={interest} onChange={(e) => setInterest(e.target.value as InterestLevel | "")}>
        <option value="">Keep as it is</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
      </SelectField>
      {error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={() => void submit()} isLoading={busy}>Save</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}

export interface NextActionFormProps {
  leadId: string;
  leadName: string;
  onDone: (message: string) => void;
  onCancel: () => void;
}

export function NextActionForm({ leadId, leadName, onDone, onCancel }: NextActionFormProps) {
  const [kind, setKind] = useState<NextActionKind>("call");
  const [at, setAt] = useState(toLocalInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await getSalesModule().setLeadNextAction.execute({ leadId, kind, at: new Date(at), note });
    setBusy(false);
    if (result.isErr) { setError(result.error.message); return; }
    onDone(`Next action for ${leadName} scheduled for ${new Date(at).toLocaleString()}.`);
  }

  return (
    <div className="space-y-3 rounded-card border border-gold/30 bg-surface p-4" data-testid="next-action-form">
      <p className="text-sm font-semibold text-ink">Schedule follow-up — {leadName}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Next action" value={kind} onChange={(e) => setKind(e.target.value as NextActionKind)}>
          {NEXT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </SelectField>
        <TextField label="When" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </div>
      <TextAreaField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error ? <p className="text-sm text-red-400" role="alert">{error}</p> : null}
      <div className="flex gap-2">
        <Button onClick={() => void submit()} isLoading={busy}>Schedule</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );
}
