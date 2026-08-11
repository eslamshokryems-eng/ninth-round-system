import type { Result, UseCase } from "@9thround/shared-kernel";
import type { StaffPresenceRepository } from "../domain/staff-presence-repository";

export interface RecordHeartbeatInput {
  profileId: string;
}

/** Called periodically by a signed-in staff session (apps/web) so Manage Staff's roster can show who's actively using the system. */
export class RecordHeartbeatUseCase implements UseCase<RecordHeartbeatInput, void> {
  constructor(private readonly presence: StaffPresenceRepository) {}

  async execute(input: RecordHeartbeatInput): Promise<Result<void>> {
    return this.presence.recordHeartbeat(input.profileId);
  }
}
