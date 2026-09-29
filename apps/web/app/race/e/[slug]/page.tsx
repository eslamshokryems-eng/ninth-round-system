"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { PublicRaceEvent } from "@9thround/race";
import { getRaceModule } from "../../../../src/lib/composition-root";
import { RaceHeader, RacePage, RaceSpinner, formatEventDate, formatMoney } from "../../../../src/components/race/race-ui";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "error"; message: string } | { kind: "ready"; event: PublicRaceEvent };

export default function RaceEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void getRaceModule()
      .getPublicEvent.execute(slug)
      .then((result) => {
        if (cancelled) return;
        if (result.isOk) setState({ kind: "ready", event: result.value });
        else if (result.error.code === "RACE_NOT_FOUND") setState({ kind: "missing" });
        else setState({ kind: "error", message: result.error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <>
      <RaceHeader />
      <RacePage>
        {state.kind === "loading" ? <RaceSpinner /> : null}
        {state.kind === "missing" ? (
          <div className="mt-10">
            <h1 className="race-display text-5xl">Event not found</h1>
            <p className="mt-3" style={{ color: "var(--race-muted)" }}>
              Check the link you were sent, or contact the organizers.
            </p>
          </div>
        ) : null}
        {state.kind === "error" ? <p className="mt-10">{state.message}</p> : null}
        {state.kind === "ready" ? <EventDetails event={state.event} slug={slug} /> : null}
      </RacePage>
    </>
  );
}

function EventDetails({ event, slug }: { event: PublicRaceEvent; slug: string }) {
  return (
    <div className="mt-6 flex flex-col gap-8">
      <div>
        <p className="race-kicker">{formatEventDate(event.eventDate)}</p>
        <h1 className="race-display mt-2" style={{ fontSize: "clamp(3rem, 15vw, 4.5rem)" }}>{event.name}</h1>
        {event.venue ? <p className="mt-3 text-lg" style={{ color: "var(--race-muted)" }}>{event.venue}</p> : null}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ["9", "Stations"],
          ["3:00", "Per station"],
          ["31:00", "Your race"],
        ].map(([value, label]) => (
          <div key={label} className="race-card race-card--flat min-w-0 px-2 sm:px-5">
            <div className="race-display text-3xl sm:text-4xl">{value}</div>
            <div className="race-label mt-1">{label}</div>
          </div>
        ))}
      </div>

      {event.instructions ? (
        <div className="race-card">
          <p className="race-label mb-2">Before you come</p>
          <p className="whitespace-pre-line">{event.instructions}</p>
        </div>
      ) : null}

      {event.registrationOpen ? (
        <div className="flex flex-col gap-3">
          <a href={`/race/e/${slug}/register`} className="race-btn w-full">
            Register{event.registrationFee > 0 ? ` — ${formatMoney(event.registrationFee, event.currency)}` : ""}
          </a>
          <p className="text-center text-sm" style={{ color: "var(--race-muted)" }}>
            Already registered? Open the link you received after registering to see your race number.
          </p>
        </div>
      ) : (
        <div className="race-notice">
          {event.status === "REGISTRATION_CLOSED" || event.heatsLocked ? "Registration is closed." : "Registration is not open yet."}
        </div>
      )}
    </div>
  );
}
