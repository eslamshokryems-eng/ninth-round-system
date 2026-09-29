import { RaceHeader, RacePage } from "../../src/components/race/race-ui";

/** /race — brand landing. Events are reached through their own link (/race/e/<slug>). */
export default function RaceHome() {
  return (
    <>
      <RaceHeader />
      <RacePage>
        <p className="race-kicker mt-8">9th Round Fitness Race</p>
        <h1 className="race-display mt-3" style={{ fontSize: "clamp(3rem, 15vw, 6rem)" }}>
          Nine stations.
          <br />
          <span style={{ color: "var(--race-red-hot)" }}>One race.</span>
        </h1>
        <p className="mt-6 max-w-md text-lg" style={{ color: "var(--race-muted)" }}>
          Squat. Push. Punch. Jump. Carry. Kick. Burpee. Row. Thirty-one minutes, every athlete, nine stations — ranked station by station.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a href="/race/login" className="race-btn race-btn--ghost">
            Staff &amp; officials sign in
          </a>
        </div>
        <p className="mt-8 text-sm" style={{ color: "var(--race-muted)" }}>
          Registering? Open the registration link you were sent by the organizers.
        </p>
      </RacePage>
    </>
  );
}
