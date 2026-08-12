import type { Result } from "@9thround/shared-kernel";
import type { LeaveRequest, LeaveRequestStatus } from "./leave-request";

export interface CreateLeaveRequestInput {
  profileId: string;
  branchId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface LeaveRequestRepository {
  create(input: CreateLeaveRequestInput): Promise<Result<LeaveRequest>>;
  listForBranch(branchId: string): Promise<Result<LeaveRequest[]>>;
  updateStatus(id: string, status: LeaveRequestStatus, reviewedBy: string): Promise<Result<LeaveRequest>>;
}
