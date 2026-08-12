import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeaveRequest } from "../domain/leave-request";
import type { CreateLeaveRequestInput, LeaveRequestRepository } from "../domain/leave-request-repository";

export class RequestLeaveUseCase implements UseCase<CreateLeaveRequestInput, LeaveRequest> {
  constructor(private readonly leaveRequests: LeaveRequestRepository) {}

  async execute(input: CreateLeaveRequestInput): Promise<Result<LeaveRequest>> {
    if (!input.reason.trim()) {
      return err(domainError("LEAVE_REASON_REQUIRED", "Enter a reason for the leave request."));
    }
    if (input.startDate > input.endDate) {
      return err(domainError("INVALID_LEAVE_RANGE", "End date must be on or after the start date."));
    }
    return this.leaveRequests.create(input);
  }
}
