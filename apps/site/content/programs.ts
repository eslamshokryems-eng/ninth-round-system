/**
 * Programs — descriptions are built from 9th Round's own project documents
 * (the 9-round circuit structure, the 4 annual training phases, the
 * monthly assessment metrics). No invented claims, schedules, or results.
 *
 * `membershipHint` maps loosely to the internal system's membership_types;
 * it is copy only, not a booking constraint.
 */

export interface Program {
  slug: string;
  name: string;
  short: string;
  who: string;
  /** Section body — plain paragraphs. */
  body: string[];
  /** What the training focuses on — short chips. */
  focus: string[];
  ctaLabel: string;
  /** Pre-fills the trial form's program field. */
  trialValue: string;
}

export const PROGRAMS: Program[] = [
  {
    slug: "fitness",
    name: "The 9-Round Circuit",
    short:
      "Nine stations, three minutes each, roughly thirty minutes of work. Warm-up, strength, boxing, kickboxing, core and conditioning in one continuous round-based session.",
    who: "Anyone who wants an efficient, coached, high-energy workout — beginners included. No combat-sports experience needed.",
    body: [
      "The circuit is built from nine stations. You move to the next one every three minutes, and each station runs three short exercises with brief rests between them. A coach is on the floor the whole time to show the movement and fix your form.",
      "There are no fixed class times. You start at any open station and complete all nine. The final round is always core.",
      "Over a full year the programming moves through four phases — Build, Ignite, Challenge and Master — so the work keeps progressing instead of repeating.",
    ],
    focus: ["Conditioning", "Strength", "Boxing & kickboxing skills", "Core", "Coordination"],
    ctaLabel: "Book a trial",
    trialValue: "The 9-Round Circuit",
  },
  {
    slug: "boxing",
    name: "Boxing",
    short:
      "Real boxing training inside the circuit and in focused sessions — technique, footwork, bag work and conditioning, coached hands-on.",
    who: "Beginners learning to box for the first time, and experienced athletes sharpening technique and engine.",
    body: [
      "Boxing at 9th Round is coached, not just followed. You work stance, guard, the jab and combinations, movement and defence, then apply them on the heavy bag and in conditioning rounds.",
      "You do not need any previous experience. The coach adjusts each round for beginners and works with more advanced members on timing, output and sharpness.",
      "Progress is tracked with simple monthly checkpoints — for example a 30-second jab count — so improvement is visible, not guessed.",
    ],
    focus: ["Technique", "Footwork & movement", "Heavy-bag work", "Conditioning", "Defence"],
    ctaLabel: "Book a boxing trial",
    trialValue: "Boxing",
  },
  {
    slug: "kickboxing",
    name: "Kickboxing",
    short:
      "Striking with hands and legs — kicks, knees, combinations and movement — built on conditioning and coached technique.",
    who: "Members who want striking variety beyond boxing, and anyone after a demanding full-body session.",
    body: [
      "Kickboxing adds kicks, knees and longer striking combinations to the boxing base. Sessions build the technique first, then load it with pad and bag work and conditioning.",
      "Coaching is hands-on throughout — the point is clean, controlled technique that holds up when you're tired, not just throwing hard.",
      "It fits straight into the round-based format, so you get the striking work and the workout in the same session.",
    ],
    focus: ["Striking technique", "Kicks & knees", "Combinations", "Movement", "Fitness"],
    ctaLabel: "Book a kickboxing trial",
    trialValue: "Kickboxing",
  },
  {
    slug: "personal-training",
    name: "Personal Training",
    short:
      "One-to-one coaching with goal-based programming and progress tracking, built around you rather than the group circuit.",
    who: "Members who want individual attention — a specific goal, a faster ramp, or focused work on technique.",
    body: [
      "Personal training is a private session with a coach who builds the programming around your goal, your starting point and your schedule.",
      "You get individual correction every rep, a plan that adjusts as you progress, and simple tracking so you can see what's changing.",
      "It works on its own or alongside the circuit — many members use PT to build a base or break a plateau, then keep training in the group.",
    ],
    focus: ["Individual coaching", "Goal-based programming", "Progress tracking", "Technique work"],
    ctaLabel: "Book a PT consultation",
    trialValue: "Personal Training",
  },
  {
    slug: "kids",
    name: "Kids / Junior",
    short:
      "Structured, coached combat-fitness training for younger members — discipline, coordination, fitness and confidence in a safe format.",
    who: "Junior members. Age range is set by the club — confirm current groups before booking.",
    body: [
      "Junior sessions use the same coached, round-based idea at an appropriate level: movement skills, basic striking technique, coordination and fitness games, run by a coach the whole time.",
      "The focus is on discipline, effort and confidence in a controlled, supervised environment.",
      "Contact the club to confirm the current age groups and session times before booking a trial.",
    ],
    focus: ["Discipline", "Coordination", "Fitness", "Confidence", "Coached & supervised"],
    ctaLabel: "Book a trial",
    trialValue: "Kids / Junior",
  },
];

export const PROGRAM_SLUGS = PROGRAMS.map((p) => p.slug);

export function getProgram(slug: string): Program | undefined {
  return PROGRAMS.find((p) => p.slug === slug);
}

/** Options for the trial form's "preferred program" select. */
export const TRIAL_PROGRAM_OPTIONS = [
  ...PROGRAMS.map((p) => p.trialValue),
  "Not sure — help me choose",
];
