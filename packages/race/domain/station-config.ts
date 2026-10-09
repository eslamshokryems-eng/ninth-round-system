/** Station & Exercise settings and the private demo workflow. Shapes mirror the database JSON (race_get_station_config etc.). */
import type { Result } from "../kernel";

export type StationCategoryCode = "MEN" | "WOMEN" | "MASTERS";

export interface StationCategoryConfig {
  scoring_type: string;
  higher_is_better?: boolean;
  movement: string;
  equipment: Record<string, unknown>;
  rule: Record<string, unknown>;
  buttons?: string[];
}

export interface StationConfig {
  number: number;
  code: string;
  name: string;
  exercise_name: string | null;
  instructions: string | null;
  equipment_note: string | null;
  template_code: string | null;
  has_technique: boolean;
  requires_ocr: boolean;
  categories: Record<StationCategoryCode, StationCategoryConfig>;
  template_options: string[];
  locked_rule: string | null;
}

export interface ExerciseTemplate {
  code: string;
  label: string;
  description: string;
  supported: boolean;
  unsupported_reason: string | null;
  scoring_type: string | null;
  judge_actions: string[];
  has_technique: boolean;
  requires_ocr: boolean;
  allowed_stations: number[] | null;
}

export interface ConfigVersion {
  version: number;
  created_at: string;
  reason: string | null;
  frozen: boolean;
  created_by: string | null;
}

export interface StationConfigView {
  event: { id: string; slug: string; name: string; status: string; is_demo: boolean };
  locked: boolean;
  lock_reason: string | null;
  can_edit: boolean;
  version: number | null;
  frozen_version: number | null;
  stations: StationConfig[];
  templates: ExerciseTemplate[];
  versions: ConfigVersion[];
}

/** The fields an editor may send for one station (everything else is rejected by the database). */
export interface StationPatch {
  name?: string;
  exercise_name?: string;
  instructions?: string;
  equipment_note?: string;
  template_code?: string;
  categories?: Partial<Record<StationCategoryCode, { movement?: string; equipment?: Record<string, unknown>; rule?: Record<string, unknown> }>>;
  confirm_scoring_change?: boolean;
}

export interface StationPreview {
  valid: boolean;
  errors: string[];
  conflicts: string[];
  warnings: string[];
  template_changed: boolean;
  scoring_changed: boolean;
  station: Record<string, unknown>;
  preview: {
    judge: { header: string; exercise_name: string; instructions: string | null; equipment_note: string | null; has_technique: boolean; categories: Record<string, { movement: string; scoring_type: string; buttons: string[] }> };
    screen: { station_label: string; station_name: string; exercise_name: string };
  };
}

/** What a judge page, a station screen and the Master dashboard show for one station. */
export interface StationDisplay {
  number: number;
  name: string;
  exercise_name: string;
  instructions: string | null;
  equipment_note: string | null;
  template_code: string | null;
  has_technique: boolean;
  requires_ocr: boolean;
  config_version: number | null;
  categories: Record<string, StationCategoryConfig>;
}

export interface MyAccess {
  signed_in: boolean;
  is_super_admin: boolean;
  can_create_events: boolean;
  events: { id: string; slug: string; name: string; status: string; is_demo: boolean; event_date: string; manager: boolean }[];
}

export interface DemoStatus {
  status: string;
  is_demo: boolean;
  started: boolean;
  athletes: number;
  heats: number;
  checked_in: number;
  config_version: number | null;
  config_frozen: boolean;
}

export interface RaceStationConfigRepository {
  myAccess(): Promise<Result<MyAccess>>;
  getConfig(eventId: string): Promise<Result<StationConfigView>>;
  preview(eventId: string, stationNumber: number, patch: StationPatch): Promise<Result<StationPreview>>;
  update(eventId: string, stationNumber: number, patch: StationPatch, reason: string): Promise<Result<{ version: number }>>;
  reset(eventId: string, stationNumber: number, reason: string): Promise<Result<{ version: number }>>;
  display(eventId: string, stationNumber: number): Promise<Result<StationDisplay>>;
  createDemo(name: string, copyFromEventId?: string): Promise<Result<{ id: string; slug: string }>>;
  addDemoAthletes(eventId: string, count: number, heatSize: number): Promise<Result<{ added: number; athletes: number; heats: number }>>;
  lockDemoHeats(eventId: string): Promise<Result<void>>;
  checkInAllDemo(eventId: string): Promise<Result<{ checked_in: number }>>;
  demoStatus(eventId: string): Promise<Result<DemoStatus>>;
}

/**
 * The judge UI decides its buttons from the CONFIGURED scoring type (not the station number): a station switched to a
 * different exercise type gets that type's buttons. Falls back to the station-number mapping when no display data is loaded.
 */
export type JudgeKind = "reps" | "laps" | "hold" | "rowing";
export function judgeKindFromScoring(scoringType: string | undefined, fallback: JudgeKind): JudgeKind {
  switch (scoringType) {
    case "REPS":
    case "CONVERTED_REPS":
      return "reps";
    case "LAPS":
      return "laps";
    case "HOLD_MS":
      return "hold";
    case "DISTANCE_M":
      return "rowing";
    default:
      return fallback;
  }
}
