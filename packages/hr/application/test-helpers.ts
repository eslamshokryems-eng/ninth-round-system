import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { Shift } from "../domain/shift";
import type { CreateShiftInput, ShiftRepository } from "../domain/shift-repository";
import type { AttendanceRecord } from "../domain/attendance";
import type { AttendanceRepository } from "../domain/attendance-repository";
import type { LeaveRequest, LeaveRequestStatus } from "../domain/leave-request";
import type { CreateLeaveRequestInput, LeaveRequestRepository } from "../domain/leave-request-repository";
import type { PayrollEntry, SalaryRecord } from "../domain/salary";
import type { SetSalaryInput, SalaryRepository } from "../domain/salary-repository";

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export class InMemoryShiftRepository implements ShiftRepository {
  public shifts: Shift[] = [];

  async listForBranch(branchId: string): Promise<Result<Shift[]>> {
    return ok(this.shifts.filter((s) => s.branchId === branchId));
  }

  async create(input: CreateShiftInput): Promise<Result<Shift>> {
    const shift: Shift = { id: nextId("shift"), profileFullName: "Test Employee", ...input };
    this.shifts.push(shift);
    return ok(shift);
  }

  async delete(shiftId: string): Promise<Result<void>> {
    this.shifts = this.shifts.filter((s) => s.id !== shiftId);
    return ok(undefined);
  }
}

export class InMemoryAttendanceRepository implements AttendanceRepository {
  public records: AttendanceRecord[] = [];

  async findOpenForProfile(profileId: string): Promise<Result<AttendanceRecord | null>> {
    return ok(this.records.find((r) => r.profileId === profileId && r.clockOut === null) ?? null);
  }

  async clockIn(profileId: string, branchId: string): Promise<Result<AttendanceRecord>> {
    const record: AttendanceRecord = {
      id: nextId("attendance"),
      profileId,
      profileFullName: "Test Employee",
      branchId,
      clockIn: new Date(),
      clockOut: null,
    };
    this.records.push(record);
    return ok(record);
  }

  async clockOut(recordId: string): Promise<Result<AttendanceRecord>> {
    const record = this.records.find((r) => r.id === recordId);
    if (!record) throw new Error("not found in fake");
    record.clockOut = new Date();
    return ok(record);
  }

  async listForBranch(): Promise<Result<AttendanceRecord[]>> {
    return ok(this.records);
  }
}

export class InMemoryLeaveRequestRepository implements LeaveRequestRepository {
  public requests: LeaveRequest[] = [];

  async create(input: CreateLeaveRequestInput): Promise<Result<LeaveRequest>> {
    const request: LeaveRequest = {
      id: nextId("leave"),
      ...input,
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: new Date(),
    };
    this.requests.push(request);
    return ok(request);
  }

  async listForBranch(branchId: string): Promise<Result<LeaveRequest[]>> {
    return ok(this.requests.filter((r) => r.branchId === branchId));
  }

  async updateStatus(
    id: string,
    status: LeaveRequestStatus,
    reviewedBy: string,
  ): Promise<Result<LeaveRequest>> {
    const request = this.requests.find((r) => r.id === id);
    if (!request) throw new Error("not found in fake");
    request.status = status;
    request.reviewedBy = reviewedBy;
    request.reviewedAt = new Date();
    return ok(request);
  }
}

export class InMemorySalaryRepository implements SalaryRepository {
  public records: SalaryRecord[] = [];

  async setSalary(input: SetSalaryInput): Promise<Result<SalaryRecord>> {
    const record: SalaryRecord = { id: nextId("salary"), ...input, createdAt: new Date() };
    this.records.push(record);
    return ok(record);
  }

  async listCurrentForBranch(): Promise<Result<PayrollEntry[]>> {
    return ok(this.records.map((r) => ({ ...r, fullName: "Test Employee", role: "reception" })));
  }
}
