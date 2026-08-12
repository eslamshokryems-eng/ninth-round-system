import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeaveRequest } from "../domain/leave-request";
import type { LeaveRequestRepository } from "../domain/leave-request-repository";

export interface ReviewLeaveRequestInput {
  requestId: string;
  decision: "approved" | "rejected";
  reviewedBy: string;
}

export class ReviewLeaveRequestUseCase implements UseCase<ReviewLeaveRequestInput, LeaveRequest> {
  constructor(private readonly leaveRequests: LeaveRequestRepository) {}

  async execute(input: ReviewLeaveRequestInput): Promise<Result<LeaveRequest>> {
    if (input.decision !== "approved" && input.decision !== "rejected") {
      return err(domainError("INVALID_LEAVE_DECISION", 'Decision must be "approved" or "rejected".'));
    }
    return this.leaveRequests.updateStatus(input.requestId, input.decision, input.reviewedBy);
  }
}
