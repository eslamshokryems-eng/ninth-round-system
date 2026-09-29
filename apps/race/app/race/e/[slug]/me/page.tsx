"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { allowedPushupStyles, type MyRegistration, type PushupStyle } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { QrCodeImage } from "../../../../../src/components/qr-code";
import {
  RaceBadge,
  RaceButton,
  RaceHeader,
  RaceNotice,
  RacePage,
  RaceSpinner,
  formatEventDate,
  formatEventTime,
  formatMoney,
} from "../../../../../src/components/race/race-ui";

function readToken(slug: string): string | null {
  const fromHash = /[#&]t=([A-Za-z0-9]+)/.exec(window.location.hash)?.[1];
  if (fromHash) {
    try {
      window.localStorage.setItem(`race:token:${slug}`, fromHash);
    } catch {
      /* private mode */
    }
    return fromHash;
  }
  try {
    return window.localStorage.getItem(`race:token:${slug}`);
  } catch {
    return null;
  }
}

export default function MyRegistrationPage() {
  const { slug } = useParams<{ slug: string }>();
  const [token, setToken] = useState<string | null>(null);
  const [registration, setRegistration] = useState<MyRegistration | null>(null);
  const [state, setState] = useState<"loading" | "invalid" | "error" | "ready">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [styleBusy, setStyleBusy] = useState(false);

  const load = useCallback(async (t: string) => {
    const result = await getRaceModule().getMyRegistration.execute(t);
    if (result.isOk) {
      setRegistration(result.value);
      setState("ready");
    } else if (result.error.code === "RACE_NOT_FOUND") {
      setState("invalid");
    } else {
      setMessage(result.error.message);
      setState("error");
    }
  }, []);

  useEffect(() => {
    const t = readToken(slug);
    if (!t) {
      setState("invalid");
      return;
    }
    setToken(t);
    void load(t);
  }, [slug, load]);

  async function changeStyle(style: PushupStyle) {
    if (!token || styleBusy) return;
    setStyleBusy(true);
    setMessage(null);
    const result = await getRaceModule().updateMyPushupStyle.execute({ token, style });
    setStyleBusy(false);
    if (result.isErr) {
      setMessage(result.error.message);
      return;
    }
    await load(token);
  }

  return (
    <>
      <RaceHeader />
      <RacePage>
        {state === "loading" ? <RaceSpinner /> : null}
        {state === "invalid" ? (
          <div className="mt-10">
            <h1 className="race-display text-5xl">Link not valid</h1>
            <p className="mt-3" style={{ color: "var(--race-muted)" }}>
              Open the exact link you received when you registered. If you lost it, ask the organizers or reception — they can find you by phone number.
            </p>
            <a href={`/race/e/${slug}`} className="race-btn race-btn--ghost mt-6">
              Event page
            </a>
          </div>
        ) : null}
        {state === "error" ? <RaceNotice>{message}</RaceNotice> : null}
        {state === "ready" && registration ? (
          <Ready registration={registration} onStyle={(s) => void changeStyle(s)} styleBusy={styleBusy} message={message} />
        ) : null}
      </RacePage>
    </>
  );
}

function Ready({ registration: r, onStyle, styleBusy, message }: { registration: MyRegistration; onStyle: (s: PushupStyle) => void; styleBusy: boolean; message: string | null }) {
  const cancelled = r.status === "CANCELLED";
  const styles = allowedPushupStyles(r.categoryCode);
  return (
    <div className="mt-4 flex flex-col gap-6">
      <div className="race-card text-center" style={{ borderLeftColor: cancelled ? "var(--race-line)" : undefined }}>
        <p className="race-kicker">Your race number</p>
        <div className="race-number-plate" style={{ opacity: cancelled ? 0.35 : 1 }} aria-label={`Race number ${r.raceNumber}`}>
          {r.raceNumber}
        </div>
        <p className="race-display mt-3 text-3xl">{r.fullName}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <RaceBadge tone="white">{r.categoryName}</RaceBadge>
          {cancelled ? <RaceBadge>Cancelled</RaceBadge> : r.status === "CONFIRMED" ? <RaceBadge tone="red">Confirmed</RaceBadge> : <RaceBadge tone="red">Payment pending</RaceBadge>}
        </div>
      </div>

      {cancelled ? <RaceNotice>This registration was cancelled. Contact the organizers if this is a mistake.</RaceNotice> : null}

      {!cancelled && r.status === "PENDING_PAYMENT" ? (
        <RaceNotice>
          <strong>Your spot is not confirmed yet.</strong> Payment of {r.paymentAmount !== null ? formatMoney(r.paymentAmount, r.currency) : "the registration fee"} is confirmed by the
          organizers. Keep this page — your race number is reserved for you.
        </RaceNotice>
      ) : null}

      <div className="race-card race-card--flat grid gap-4 sm:grid-cols-2">
        <div>
          <p className="race-label">Event</p>
          <p className="race-display mt-1 text-2xl">{r.eventName}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--race-muted)" }}>
            {formatEventDate(r.eventDate)}
            {r.venue ? ` · ${r.venue}` : ""}
          </p>
        </div>
        <div>
          <p className="race-label">Your heat</p>
          {r.heatNumber !== null ? (
            <>
              <p className="race-display mt-1 text-2xl">Heat {String(r.heatNumber).padStart(2, "0")}</p>
              {r.heatStartAt ? (
                <p className="mt-1 text-sm" style={{ color: "var(--race-muted)" }}>
                  Heat starts about {formatEventTime(r.heatStartAt, r.timezone)}
                  {r.checkinClosesAt ? ` · check-in closes ${formatEventTime(r.checkinClosesAt, r.timezone)}` : ""}
                </p>
              ) : (
                <p className="mt-1 text-sm" style={{ color: "var(--race-muted)" }}>
                  Start time is announced when heats are locked.
                </p>
              )}
            </>
          ) : (
            <p className="mt-1" style={{ color: "var(--race-muted)" }}>
              Not assigned yet — you will see it here.
            </p>
          )}
        </div>
      </div>

      {!cancelled ? (
        <div className="race-card race-card--flat flex flex-col items-center gap-3 text-center">
          <p className="race-label">Show this at reception</p>
          <div className="bg-white p-2">
            <QrCodeImage value={r.raceNumber} size={176} alt={`QR code for race number ${r.raceNumber}`} />
          </div>
          <p className="text-sm" style={{ color: "var(--race-muted)" }}>
            Reception finds you by race number, name or phone. On race day, check in before your heat&apos;s check-in closes.
          </p>
        </div>
      ) : null}

      {!cancelled ? (
        <div className="race-card race-card--flat">
          <p className="race-label mb-2">Station 02 — push-ups</p>
          {r.pushupStyleLocked ? (
            <p>
              <strong>{r.pushupStyle === "KNEE" ? "Knee" : "Standard"}</strong> — locked, Station 02 has started.
            </p>
          ) : styles.length > 1 ? (
            <div className="grid grid-cols-2 gap-3">
              {styles.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={styleBusy}
                  onClick={() => s !== r.pushupStyle && onStyle(s)}
                  className="race-choice text-left"
                  style={s === r.pushupStyle ? { borderColor: "var(--race-red)", background: "rgba(225,6,0,0.12)" } : undefined}
                  aria-pressed={s === r.pushupStyle}
                >
                  {s === "STANDARD" ? "Standard" : "Knee"}
                  <span className="block text-xs" style={{ color: "var(--race-muted)" }}>
                    {s === "STANDARD" ? "1 rep = 1 score" : "3 reps = 1 score"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p>Knee — every 3 complete reps count as 1 score.</p>
          )}
          <p className="mt-2 text-xs" style={{ color: "var(--race-muted)" }}>
            You can change this until Station 02 starts. It cannot change during the station.
          </p>
          {message ? <p role="alert" className="mt-2 text-sm" style={{ color: "var(--race-red-hot)" }}>{message}</p> : null}
        </div>
      ) : null}

      {r.instructions ? (
        <div className="race-card">
          <p className="race-label mb-2">Event instructions</p>
          <p className="whitespace-pre-line">{r.instructions}</p>
        </div>
      ) : null}

      <p className="text-center text-xs" style={{ color: "var(--race-muted)" }}>
        This page is private to you — anyone with this link can see your race number. Bookmark it.
      </p>
      <RaceButton variant="ghost" onClick={() => window.print()} className="self-center">
        Print / save as PDF
      </RaceButton>
    </div>
  );
}
