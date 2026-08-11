import type { Result, UseCase } from "@9thround/shared-kernel";
import type { StaffPresence } from "../domain/staff-presence";
import type { StaffPresenceRepository } from "../domain/staff-presence-repository";

/** Backs Manage Staff's roster — see StaffPresenceRepository's own comment on how "online" is derived (a heartbeat + recency window, not a live socket). */
export class ListStaffPresenceUseCase implements UseCase<Record<string, never>, StaffPresence[]> {
  constructor(private readonly presence: StaffPresenceRepository) {}

  async execute(): Promise<Result<StaffPresence[]>> {
    return this.presence.listStaff();
  }
}
