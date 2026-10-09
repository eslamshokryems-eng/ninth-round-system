import { domainError, err } from "../kernel";
import type { Result } from "../kernel";
import type { RaceStationConfigRepository, StationDisplay, StationPatch, StationPreview } from "../domain/station-config";

const stationOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 9;
const bad = (m: string) => err(domainError("RACE_CONFIG_INVALID", m));

/** Reads (config, preview, display) and writes (update, reset) of the station configuration. Authorization is enforced by the database. */
export class StationConfigUseCases {
  constructor(private readonly repo: RaceStationConfigRepository) {}
  myAccess() { return this.repo.myAccess(); }
  get(eventId: string) { return this.repo.getConfig(eventId); }
  async display(eventId: string, stationNumber: number): Promise<Result<StationDisplay>> {
    return stationOk(stationNumber) ? this.repo.display(eventId, stationNumber) : bad("Choose a station from 1 to 9.");
  }
  async preview(eventId: string, stationNumber: number, patch: StationPatch): Promise<Result<StationPreview>> {
    return stationOk(stationNumber) ? this.repo.preview(eventId, stationNumber, patch) : bad("Choose a station from 1 to 9.");
  }
  async update(eventId: string, stationNumber: number, patch: StationPatch, reason: string) {
    if (!stationOk(stationNumber)) return bad("Choose a station from 1 to 9.");
    if (reason.trim().length === 0) return err(domainError("RACE_REASON_REQUIRED", "Say what you changed and why."));
    return this.repo.update(eventId, stationNumber, patch, reason.trim());
  }
  async reset(eventId: string, stationNumber: number, reason: string) {
    if (!stationOk(stationNumber)) return bad("Choose a station from 1 to 9.");
    if (reason.trim().length === 0) return err(domainError("RACE_REASON_REQUIRED", "Say why you are resetting this station."));
    return this.repo.reset(eventId, stationNumber, reason.trim());
  }
}

/** The guided private-demo steps. */
export class DemoWorkflowUseCases {
  constructor(private readonly repo: RaceStationConfigRepository) {}
  async create(name: string, copyFromEventId?: string) {
    if (name.trim().length < 2) return err(domainError("RACE_INVALID_NAME", "Give the demo event a name."));
    return this.repo.createDemo(name.trim(), copyFromEventId);
  }
  async addAthletes(eventId: string, count: number, heatSize: number) {
    if (!Number.isInteger(count) || count < 1 || count > 27) return bad("Choose 1 to 27 demo athletes.");
    if (!Number.isInteger(heatSize) || heatSize < 1 || heatSize > 9) return bad("Heat size must be 1 to 9.");
    return this.repo.addDemoAthletes(eventId, count, heatSize);
  }
  lockHeats(eventId: string) { return this.repo.lockDemoHeats(eventId); }
  checkInAll(eventId: string) { return this.repo.checkInAllDemo(eventId); }
  status(eventId: string) { return this.repo.demoStatus(eventId); }
}
