/** Phase 6 — what Master Control sees and does. Times are RACE milliseconds (0 = the START EVENT press) unless named *At. */

export type StationState = "IDLE" | "WORK" | "TRANSITION";
export type HeatStartMode = "AUTO" | "MANUAL";

export interface RaceClockView {
  started: boolean;
  paused: boolean;
  finished: boolean;
  /** Race time when this snapshot was taken on the server (null before START EVENT). */
  raceMs: number | null;
  /** Bumps on start / pause / resume / finish: a client that sees a new version re-syncs its clock. */
  version: number;
  /** True during the 60-second pre-race countdown (before the first athlete). */
  preRace: boolean;
}

export interface NextAthleteView {
  registrationId: string;
  raceNumber: string;
  fullName: string;
  categoryCode: string;
  heat: number;
  slotIndex: number;
  startMs: number;
  startsInMs: number;
  /** Milliseconds until the voice announcement ("next athlete in 10 seconds"). Negative = already due. */
  announceInMs: number;
}

export interface SkippableSlot {
  slotId: string;
  registrationId: string;
  raceNumber: string;
  fullName: string;
  categoryCode: string;
  heat: number;
  slotIndex: number;
  isOverflow: boolean;
  status: "BOUND" | "STARTED";
  startMs: number;
  startsInMs: number;
}

export interface StationCard {
  number: number;
  name: string;
  state: StationState;
  athlete: { raceNumber: string; fullName: string; categoryCode: string } | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
  scoringEndMs: number | null;
  remainingMs: number | null;
}

export interface HeatSummary {
  number: number;
  status: string;
  anchorMs: number | null;
  plannedSlots: number | null;
  startMode: HeatStartMode;
  roster: number;
  started: number;
  bound: number;
  empty: number;
  skipped: number;
  open: number;
}

export interface AttentionAthlete {
  registrationId: string;
  raceNumber: string;
  fullName: string;
  heat: number | null;
}

export interface ControlState {
  /** Server time when the snapshot was produced (ISO). */
  serverTime: string;
  event: {
    id: string;
    name: string;
    status: string;
    timezone: string;
    firstStartOffsetMs: number;
    startIntervalMs: number;
    workMs: number;
    transitionMs: number;
    announceLeadMs: number;
  };
  clock: RaceClockView;
  nextAthlete: NextAthleteView | null;
  skippable: SkippableSlot[];
  stations: StationCard[];
  heats: HeatSummary[];
  counts: { registered: number; checkedIn: number; racing: number; finished: number; dns: number; dnf: number };
  attention: {
    /** DNS athletes an Event Manager may override. */
    dns: (AttentionAthlete & { wasSkipped: boolean })[];
    /** Late athletes with NO safe slot: an Event Manager may move them to a later heat. */
    noSlot: AttentionAthlete[];
  };
}

export interface StartEventResult {
  startedAt: string;
  firstStartMs: number;
  heatsAnchored: number;
}

export interface PauseResult {
  pausedAt: string;
  pausedRaceMs: number;
}

export interface ResumeResult {
  resumedAt: string;
  pausedMs: number;
  raceMs: number;
}

export interface EngineTick {
  /** Another device was ticking at the same moment — nothing for this one to do. */
  busy: boolean;
  advanced: boolean;
  raceMs: number | null;
  athletesStarted: number;
  athletesFinished: number;
  eventFinished: boolean;
}

export interface SkipResult {
  heatNumber: number;
  slotIndex: number;
  raceNumber: string;
}

export interface NextHeatResult {
  heatNumber: number;
  anchorMs: number;
}

export interface CorrectionResult {
  correctionId: string;
  newCheckInId: string;
  queuePosition: number;
  heatNumber: number;
  /** True when the wrong athlete already held a bound start slot and it was handed to the right one. */
  slotRebound: boolean;
}

export type DnsOverrideOutcome = "ASSIGNED" | "QUEUED" | "NO_SLOT_AVAILABLE";

export interface DnsOverrideResult {
  outcome: DnsOverrideOutcome;
  queuePosition: number | null;
  heatNumber: number;
  slotIndex: number | null;
}

export interface MoveResult {
  heatNumber: number;
  queuePosition: number;
  slotIndex: number | null;
}

export interface CloseHeatResult {
  heatNumber: number;
  /** Athletes of the closed heat who became DNS. */
  athletesDns: number;
  slotsEmptied: number;
  /** Number of the AUTO heat that was waiting behind it and has now been scheduled (null if none). */
  nextHeatAnchored: number | null;
}
