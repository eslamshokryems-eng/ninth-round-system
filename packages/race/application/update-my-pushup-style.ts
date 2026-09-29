import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PushupStyle } from "../domain/eligibility";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";

export interface UpdateMyPushupStyleInput {
  token: string;
  style: PushupStyle;
}

/** Any athlete may choose Knee; Standard only where it is the category default. Locked once Station 02 starts. */
export class UpdateMyPushupStyleUseCase implements UseCase<UpdateMyPushupStyleInput, PushupStyle> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: UpdateMyPushupStyleInput): Promise<Result<PushupStyle>> {
    if (input.token.trim().length < 32) {
      return err(domainError("RACE_NOT_FOUND", "This link is not valid."));
    }
    return this.registrations.updateMyPushupStyle(input.token.trim(), input.style);
  }
}
