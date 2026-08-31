import type { Metadata } from "next";
import { Container } from "../../src/components/container";
import { PlaceholderTag } from "../../src/components/placeholder-tag";
import { SCHEDULE } from "../../src/data/schedule";

export const metadata: Metadata = {
  title: "Classes",
  description: "Class schedule at 9th Round Egypt.",
};

/**
 * Public-facing schedule preview only. Deliberately not connected to the
 * internal apps/web scheduling/HR system — wiring a real, live schedule
 * here is a separate, explicitly-approved task.
 */
export default function ClassesPage() {
  return (
    <Container className="py-16">
      <h1 className="text-3xl font-bold sm:text-4xl">Classes</h1>
      <p className="mt-4 max-w-2xl text-muted">
        Structure only — the schedule below is a placeholder, not the real class times.
      </p>
      <div className="mt-3">
        <PlaceholderTag label="real schedule not yet connected" />
      </div>

      <div className="mt-10 overflow-x-auto rounded-card border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Day</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Program</th>
              <th className="px-4 py-3 font-medium">Coach</th>
            </tr>
          </thead>
          <tbody>
            {SCHEDULE.map((session) => (
              <tr key={session.id} className="border-t border-white/5">
                <td className="px-4 py-3 text-ink">{session.day}</td>
                <td className="px-4 py-3 text-muted">{session.time}</td>
                <td className="px-4 py-3 text-muted">{session.program}</td>
                <td className="px-4 py-3 text-muted">{session.coach}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
