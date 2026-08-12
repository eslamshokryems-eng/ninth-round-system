import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeaveRequest } from "../domain/leave-request";
import type { LeaveRequestRepository } from "../domain/leave-request-repository";

export class ListLeaveRequestsUseCase implements UseCase<string, LeaveRequest[]> {
  constructor(private readonly leaveRequests: LeaveRequestRepository) {}

  async execute(branchId: string): Promise<Result<LeaveRequest[]>> {
    return this.leaveRequests.listForBranch(branchId);
  }
}
