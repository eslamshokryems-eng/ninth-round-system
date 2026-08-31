/**
 * Public-facing schedule structure only — deliberately NOT wired to the
 * internal apps/web scheduling/HR system. Every row here is a placeholder;
 * replace with real class times once supplied, or wire this page to a
 * read-only public schedule source later (separate, explicitly approved
 * task).
 */
export interface ClassSession {
  id: string;
  day: string;
  time: string;
  program: string;
  coach: string;
}

export const SCHEDULE: ClassSession[] = [
  { id: "s1", day: "Placeholder day", time: "Placeholder time", program: "Boxing", coach: "Placeholder coach" },
  { id: "s2", day: "Placeholder day", time: "Placeholder time", program: "Kickboxing", coach: "Placeholder coach" },
  { id: "s3", day: "Placeholder day", time: "Placeholder time", program: "Fitness", coach: "Placeholder coach" },
];
