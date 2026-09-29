"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  MANUAL_PAYMENT_METHODS,
  type ManualPaymentMethod,
  type PublicRaceEvent,
  type RegistrationConfirmation,
  type StaffRegistrationRow,
} from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { useAuthStore } from "../../../../../src/features/auth/store";
import { RegistrationForm } from "../../../../../src/components/race/registration-form";
import {
  RaceBadge,
  RaceButton,
  RaceHeader,
  RaceInput,
  RaceNotice,
  RacePage,
  RaceSelect,
  RaceSpinner,
  RaceTextArea,
  StaffNav,
  formatMoney,
} from "../../../../../src/components/race/race-ui";

type ActionKind = "confirm" | "waive" | "refund" | "cancel";
interface ActionState {
  kind: ActionKind;
  row: StaffRegistrationRow;
}

const CATEGORY_LABEL = { MEN: "Men", WOMEN: "Women", MASTERS: "Masters 40+" } as const;

export default function RegistrationsAdminPage() {
  const { slug } = useParams<{ slug: string }>();
  const authStatus = useAuthStore((s) => s.status);
  const [event, setEvent] = useState<PublicRaceEvent | null>(null);
  const [rows, setRows] = useState<StaffRegistrationRow[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [registered, setRegistered] = useState<RegistrationConfirmation | null>(null);
  const [action, setAction] = useState<ActionState | null>(null);

  // 1) Resolve the event (staff can see their own DRAFT events).
  useEffect(() => {
    if (authStatus !== "signedIn") return;
    let cancelled = false;
    void getRaceModule()
      .getPublicEvent.execute(slug)
      .then((result) => {
        if (cancelled) return;
        if (result.isOk) setEvent(result.value);
        else {
          setError(result.error.message);
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, slug]);

  const load = useCallback(
    async (eventId: string, q: string) => {
      const result = await getRaceModule().listRegistrations.execute({ eventId, query: q, limit: 500 });
      if (result.isErr) {
        setError(result.error.message);
        setState("error");
        return;
      }
      setRows(result.value);
      setError(null);
      setState("ready");
    },
    [],
  );

  // 2) Search-as-you-type (debounced). Race number first, then phone, then name — resolved by the database.
  useEffect(() => {
    if (!event) return;
    const handle = window.setTimeout(() => void load(event.eventId, query), query === "" ? 0 : 250);
    return () => window.clearTimeout(handle);
  }, [event, query, load]);

  const refresh = () => (event ? load(event.eventId, query) : Promise.resolve());

  if (authStatus === "hydrating") return <Shell><RaceSpinner /></Shell>;
  if (authStatus === "signedOut") {
    return (
      <Shell>
        <div className="mt-10 flex flex-col gap-4">
          <h1 className="race-display text-5xl">Sign in required</h1>
          <a href={`/race/login?next=/race/admin/${slug}/registrations`} className="race-btn self-start">
            Sign in
          </a>
        </div>
      </Shell>
    );
  }

  const active = rows.filter((r) => r.status !== "CANCELLED");
  const pending = active.filter((r) => r.status === "PENDING_PAYMENT").length;
  const paidTotal = rows.reduce((sum, r) => sum + (r.paymentStatus === "PAID" ? (r.paymentAmount ?? 0) : 0), 0);
  const currency = event?.currency ?? "EGP";

  return (
    <Shell wide slug={slug}>
      <div className="mt-2 flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="race-kicker">Registrations</p>
            <h1 className="race-display mt-2 text-5xl">{event?.name ?? "…"}</h1>
          </div>
          {event ? (
            <RaceButton
              onClick={() => {
                setShowRegister((v) => !v);
                setRegistered(null);
              }}
              variant={showRegister ? "ghost" : "primary"}
            >
              {showRegister ? "Close" : "Register an athlete"}
            </RaceButton>
          ) : null}
        </div>

        {state === "error" ? <RaceNotice>{error}</RaceNotice> : null}

        {event && showRegister ? (
          <div className="race-card">
            {registered ? <RegisteredPanel slug={slug} confirmation={registered} onAnother={() => setRegistered(null)} /> : (
              <RegistrationForm
                event={event}
                mode="staff"
                onRegistered={(confirmation) => {
                  setRegistered(confirmation);
                  void refresh();
                }}
              />
            )}
          </div>
        ) : null}

        {state === "ready" ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Showing" value={String(rows.length)} />
              <Stat label="Active" value={String(active.length)} />
              <Stat label="Payment pending" value={String(pending)} hot={pending > 0} />
              <Stat label="Collected" value={formatMoney(paidTotal, currency)} />
            </div>

            <RaceInput
              id="race-search"
              label="Search — race number, phone or name"
              placeholder="e.g. 27, N027, 0100…, Ahmed"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              autoFocus
            />

            {action ? (
              <ActionPanel
                key={`${action.kind}-${action.row.registrationId}`}
                action={action}
                currency={currency}
                onClose={() => setAction(null)}
                onDone={() => {
                  setAction(null);
                  void refresh();
                }}
              />
            ) : null}

            <div className="race-card race-card--flat overflow-x-auto p-0">
              <table className="race-table">
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Athlete</th>
                    <th>Category</th>
                    <th>Heat</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center" style={{ color: "var(--race-muted)", padding: "2rem" }}>
                        {query === "" ? "No registrations yet." : "No athlete matches that search."}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((r) => (
                    <Row key={r.registrationId} row={r} onAction={(kind) => setAction({ kind, row: r })} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : state === "loading" ? (
          <RaceSpinner />
        ) : null}
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false, slug }: { children: React.ReactNode; wide?: boolean; slug?: string }) {
  return (
    <>
      <RaceHeader wide={wide} right={slug ? <StaffNav slug={slug} current="registrations" /> : undefined} />
      <RacePage wide={wide}>{children}</RacePage>
    </>
  );
}

function Stat({ label, value, hot = false }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className="race-card race-card--flat" style={hot ? { borderLeftColor: "var(--race-red)" } : undefined}>
      <div className="race-display text-3xl">{value}</div>
      <div className="race-label mt-1">{label}</div>
    </div>
  );
}

function Row({ row: r, onAction }: { row: StaffRegistrationRow; onAction: (kind: ActionKind) => void }) {
  const cancelled = r.status === "CANCELLED";
  const canConfirm = !cancelled && r.paymentStatus === "PENDING";
  const canWaive = !cancelled && r.paymentStatus !== "PAID" && r.status === "PENDING_PAYMENT";
  const canRefund = r.paymentStatus === "PAID" && r.raceStatus === "REGISTERED";
  const canCancel = !cancelled && r.paymentStatus !== "PAID" && r.raceStatus === "REGISTERED";
  return (
    <tr style={{ opacity: cancelled ? 0.5 : 1 }}>
      <td>
        <span className="race-display text-2xl">{r.raceNumber}</span>
      </td>
      <td>
        <div className="font-semibold">{r.fullName}</div>
        <div className="text-xs" style={{ color: "var(--race-muted)" }}>{r.phone}</div>
      </td>
      <td>{CATEGORY_LABEL[r.categoryCode]}</td>
      <td>{r.heatNumber !== null ? `Heat ${String(r.heatNumber).padStart(2, "0")}` : "—"}</td>
      <td>
        <div className="flex flex-col items-start gap-1">
          <RaceBadge tone={cancelled ? "line" : r.status === "CONFIRMED" ? "white" : "red"}>{r.status.replace("_", " ")}</RaceBadge>
          {r.raceStatus !== "REGISTERED" ? <RaceBadge>{r.raceStatus.replace("_", " ")}</RaceBadge> : null}
        </div>
      </td>
      <td>
        {r.paymentStatus ? (
          <div className="flex flex-col items-start gap-1">
            <RaceBadge tone={r.paymentStatus === "PAID" ? "white" : r.paymentStatus === "PENDING" ? "red" : "line"}>{r.paymentStatus}</RaceBadge>
            <span className="text-xs" style={{ color: "var(--race-muted)" }}>
              {r.paymentAmount !== null ? r.paymentAmount : ""}
              {r.paymentMethod ? ` · ${r.paymentMethod.replace("_", " ")}` : ""}
            </span>
          </div>
        ) : (
          <span style={{ color: "var(--race-muted)" }}>—</span>
        )}
      </td>
      <td>
        <div className="flex flex-wrap justify-end gap-2">
          {canConfirm ? <RaceButton size="sm" onClick={() => onAction("confirm")}>Confirm payment</RaceButton> : null}
          {canWaive ? <RaceButton size="sm" variant="ghost" onClick={() => onAction("waive")}>Waive</RaceButton> : null}
          {canRefund ? <RaceButton size="sm" variant="danger" onClick={() => onAction("refund")}>Refund</RaceButton> : null}
          {canCancel ? <RaceButton size="sm" variant="danger" onClick={() => onAction("cancel")}>Cancel</RaceButton> : null}
        </div>
      </td>
    </tr>
  );
}

const ACTION_TITLE: Record<ActionKind, string> = {
  confirm: "Confirm payment",
  waive: "Waive payment",
  refund: "Refund payment",
  cancel: "Cancel registration",
};

function ActionPanel({ action, currency, onClose, onDone }: { action: ActionState; currency: string; onClose: () => void; onDone: () => void }) {
  const { kind, row } = action;
  const [method, setMethod] = useState<ManualPaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per opened panel: a retry or a double-click can never record a second payment.
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const race = getRaceModule();
    const result =
      kind === "confirm"
        ? await race.confirmPayment.execute({
            registrationId: row.registrationId,
            method,
            amount: amount.trim() === "" ? null : Number(amount),
            notes,
            idempotencyKey: idempotencyKey.current,
          })
        : kind === "waive"
          ? await race.waivePayment.execute({ registrationId: row.registrationId, reason })
          : kind === "refund"
            ? await race.refundPayment.execute({ paymentId: row.paymentId ?? "", reason })
            : await race.cancelRegistration.execute({ registrationId: row.registrationId, reason });
    setBusy(false);
    if (result.isErr) {
      setError(result.error.message);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="race-card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="race-kicker">{ACTION_TITLE[kind]}</p>
          <p className="race-display mt-1 text-3xl">
            {row.raceNumber} · {row.fullName}
          </p>
        </div>
        <RaceButton type="button" size="sm" variant="ghost" onClick={onClose}>
          Close
        </RaceButton>
      </div>
      {kind === "confirm" ? (
        <>
          <RaceSelect id="race-method" label="Payment method" value={method} onChange={(e) => setMethod(e.target.value as ManualPaymentMethod)}>
            {MANUAL_PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </RaceSelect>
          <RaceInput
            id="race-amount"
            label={`Amount received (${currency}) — leave empty for the fee`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={row.paymentAmount !== null ? String(row.paymentAmount) : ""}
            hint="A different amount needs a note."
          />
          <RaceInput id="race-notes" label="Note / receipt reference (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </>
      ) : (
        <RaceTextArea
          id="race-reason"
          label={kind === "waive" ? "Reason for waiving (kept in the audit log)" : kind === "refund" ? "Reason for the refund" : "Reason for cancelling"}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />
      )}
      {error ? <RaceNotice>{error}</RaceNotice> : null}
      <RaceButton type="submit" isLoading={busy} variant={kind === "refund" || kind === "cancel" ? "danger" : "primary"}>
        {ACTION_TITLE[kind]}
      </RaceButton>
    </form>
  );
}

function RegisteredPanel({ slug, confirmation, onAnother }: { slug: string; confirmation: RegistrationConfirmation; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/race/e/${slug}/me#t=${confirmation.accessToken}`;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p className="race-kicker">Registered</p>
      <div className="race-number-plate">{confirmation.raceNumber}</div>
      <RaceBadge tone={confirmation.status === "CONFIRMED" ? "white" : "red"}>
        {confirmation.status === "CONFIRMED" ? "Confirmed" : `Payment pending — ${formatMoney(confirmation.amountDue, confirmation.currency)}`}
      </RaceBadge>
      <p className="max-w-md text-sm" style={{ color: "var(--race-muted)" }}>
        Give the athlete this private link (it is their key to their race number). It is shown only now.
      </p>
      <input readOnly value={link} className="race-input" onFocus={(e) => e.currentTarget.select()} aria-label="Athlete's private link" />
      <div className="flex gap-3">
        <RaceButton
          variant="ghost"
          onClick={() => {
            void navigator.clipboard
              .writeText(link)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </RaceButton>
        <RaceButton onClick={onAnother}>Register another</RaceButton>
      </div>
    </div>
  );
}
