import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { CreateLeaveRequestInput, LeaveRequestRepository } from "../domain/leave-request-repository";
import type { LeaveRequest, LeaveRequestStatus } from "../domain/leave-request";

interface LeaveRequestRow {
  id: string;
  profile_id: string;
  branch_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

function toLeaveRequest(row: LeaveRequestRow): LeaveRequest {
  return {
    id: row.id,
    profileId: row.profile_id,
    branchId: row.branch_id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : null,
    createdAt: new Date(row.created_at),
  };
}

const SELECT_COLUMNS =
  "id, profile_id, branch_id, start_date, end_date, reason, status, reviewed_by, reviewed_at, created_at";

export class SupabaseLeaveRequestRepository implements LeaveRequestRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async create(input: CreateLeaveRequestInput): Promise<Result<LeaveRequest>> {
    const { data, error } = await this.client
      .from("leave_requests")
      .insert({
        profile_id: input.profileId,
        branch_id: input.branchId,
        start_date: input.startDate,
        end_date: input.endDate,
        reason: input.reason,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error) return err(domainError("CREATE_LEAVE_REQUEST_FAILED", error.message));
    return ok(toLeaveRequest(data));
  }

  async listForBranch(branchId: string): Promise<Result<LeaveRequest[]>> {
    const { data, error } = await this.client
      .from("leave_requests")
      .select(SELECT_COLUMNS)
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false });

    if (error) return err(domainError("LIST_LEAVE_REQUESTS_FAILED", error.message));
    return ok(data.map(toLeaveRequest));
  }

  async updateStatus(id: string, status: LeaveRequestStatus, reviewedBy: string): Promise<Result<LeaveRequest>> {
    const { data, error } = await this.client
      .from("leave_requests")
      .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .single();

    if (error) return err(domainError("UPDATE_LEAVE_REQUEST_FAILED", error.message));
    return ok(toLeaveRequest(data));
  }
}
