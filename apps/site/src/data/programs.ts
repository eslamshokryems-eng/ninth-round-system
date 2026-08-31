export interface Program {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  isPlaceholder?: boolean;
}

export const PROGRAMS: Program[] = [
  {
    slug: "boxing",
    name: "Boxing",
    tagline: "Fundamentals to fight-ready.",
    description:
      "Stance, footwork, combinations, and heavy-bag work built around real technique — for first-timers and experienced boxers alike.",
  },
  {
    slug: "kickboxing",
    name: "Kickboxing",
    tagline: "Strikes, footwork, conditioning.",
    description:
      "Kicks, knees, and combinations layered onto a high-output conditioning base — one full round, zero wasted time.",
  },
  {
    slug: "fitness",
    name: "Fitness / Conditioning",
    tagline: "Strength meets endurance.",
    description:
      "Functional strength and conditioning stations designed for full-body performance, not just a workout.",
  },
  {
    slug: "adult",
    name: "Adult Program",
    tagline: "Structured training for every level.",
    description: "PLACEHOLDER — confirm exact adult program structure and days before publishing.",
    isPlaceholder: true,
  },
  {
    slug: "kids-junior",
    name: "Kids / Junior",
    tagline: "Discipline, confidence, fun.",
    description: "PLACEHOLDER — confirm age range, format, and days before publishing.",
    isPlaceholder: true,
  },
];
