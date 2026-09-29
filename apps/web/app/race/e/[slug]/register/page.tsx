"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { PublicRaceEvent } from "@9thround/race";
import { getRaceModule } from "../../../../../src/lib/composition-root";
import { RegistrationForm } from "../../../../../src/components/race/registration-form";
import { RaceHeader, RacePage, RaceSpinner } from "../../../../../src/components/race/race-ui";

export default function RaceRegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<PublicRaceEvent | null>(null);
  const [status, setStatus] = useState<"loading" | "missing" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;
    void getRaceModule()
      .getPublicEvent.execute(slug)
      .then((result) => {
        if (cancelled) return;
        if (result.isOk) {
          setEvent(result.value);
          setStatus("ready");
        } else setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <>
      <RaceHeader />
      <RacePage>
        {status === "loading" ? <RaceSpinner /> : null}
        {status === "missing" ? <h1 className="race-display mt-10 text-5xl">Event not found</h1> : null}
        {status === "ready" && event ? (
          event.registrationOpen ? (
            <div className="mt-6 flex flex-col gap-6">
              <div>
                <p className="race-kicker">Registration</p>
                <h1 className="race-display mt-2 text-5xl">{event.name}</h1>
              </div>
              <RegistrationForm
                event={event}
                mode="public"
                onRegistered={(confirmation) => {
                  // The token is the athlete's key. It goes in the URL FRAGMENT (never sent to any server or log)
                  // and is remembered on this device so "my registration" survives a refresh.
                  try {
                    window.localStorage.setItem(`race:token:${slug}`, confirmation.accessToken);
                  } catch {
                    /* private mode: the fragment still works */
                  }
                  router.push(`/race/e/${slug}/me#t=${confirmation.accessToken}`);
                }}
              />
            </div>
          ) : (
            <div className="mt-10">
              <h1 className="race-display text-5xl">Registration closed</h1>
              <p className="mt-3" style={{ color: "var(--race-muted)" }}>
                Registration for {event.name} is not open. Contact the organizers.
              </p>
            </div>
          )
        ) : null}
      </RacePage>
    </>
  );
}
