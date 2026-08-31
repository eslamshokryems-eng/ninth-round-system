/**
 * Structure ready for real content — every entry here is a placeholder.
 * No coach names, bios, specialties, or photos have been supplied yet.
 */
export interface Coach {
  id: string;
  name: string;
  role: string;
  bio: string;
  photoUrl: string | null;
}

export const COACHES: Coach[] = [
  {
    id: "coach-1",
    name: "Coach Name — Placeholder",
    role: "Placeholder role (e.g. Head Coach, Boxing)",
    bio: "PLACEHOLDER — real coach bio not yet supplied.",
    photoUrl: null,
  },
  {
    id: "coach-2",
    name: "Coach Name — Placeholder",
    role: "Placeholder role (e.g. Kickboxing / Conditioning)",
    bio: "PLACEHOLDER — real coach bio not yet supplied.",
    photoUrl: null,
  },
];
