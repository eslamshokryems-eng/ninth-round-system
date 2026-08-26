import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { ListShiftsUseCase } from "./application/list-shifts";
import { CreateShiftUseCase } from "./application/create-shift";
import { DeleteShiftUseCase } from "./application/delete-shift";
import { ClockInUseCase } from "./application/clock-in";
import { ClockOutUseCase } from "./application/clock-out";
import { GetOpenAttendanceUseCase } from "./application/get-open-attendance";
import { ListAttendanceUseCase } from "./application/list-attendance";
import { RequestLeaveUseCase } from "./application/request-leave";
import { ReviewLeaveRequestUseCase } from "./application/review-leave-request";
import { ListLeaveRequestsUseCase } from "./application/list-leave-requests";
import { SetSalaryUseCase } from "./application/set-salary";
import { ListPayrollUseCase } from "./application/list-payroll";
import { GetBranchLocationUseCase } from "./application/get-branch-location";
import { SetBranchLocationUseCase } from "./application/set-branch-location";
import { SupabaseShiftRepository } from "./infrastructure/supabase-shift-repository";
import { SupabaseAttendanceRepository } from "./infrastructure/supabase-attendance-repository";
import { SupabaseLeaveRequestRepository } from "./infrastructure/supabase-leave-request-repository";
import { SupabaseSalaryRepository } from "./infrastructure/supabase-salary-repository";
import { SupabaseBranchLocationRepository } from "./infrastructure/supabase-branch-location-repository";

export type { Shift, DayOfWeek } from "./domain/shift";
export type { CreateShiftInput } from "./domain/shift-repository";
export type { AttendanceRecord } from "./domain/attendance";
export type { LeaveRequest, LeaveRequestStatus } from "./domain/leave-request";
export type { CreateLeaveRequestInput } from "./domain/leave-request-repository";
export type { SalaryRecord, PayrollEntry } from "./domain/salary";
export type { SetSalaryInput } from "./domain/salary-repository";
export type { BranchLocation } from "./domain/branch-location";
export type { SetBranchLocationInput } from "./domain/branch-location-repository";
export { ListShiftsUseCase } from "./application/list-shifts";
export { CreateShiftUseCase } from "./application/create-shift";
export { DeleteShiftUseCase } from "./application/delete-shift";
export { ClockInUseCase, type ClockInInput } from "./application/clock-in";
export { ClockOutUseCase } from "./application/clock-out";
export { GetOpenAttendanceUseCase } from "./application/get-open-attendance";
export { ListAttendanceUseCase, type ListAttendanceInput } from "./application/list-attendance";
export { RequestLeaveUseCase } from "./application/request-leave";
export {
  ReviewLeaveRequestUseCase,
  type ReviewLeaveRequestInput,
} from "./application/review-leave-request";
export { ListLeaveRequestsUseCase } from "./application/list-leave-requests";
export { SetSalaryUseCase } from "./application/set-salary";
export { ListPayrollUseCase } from "./application/list-payroll";
export { GetBranchLocationUseCase } from "./application/get-branch-location";
export { SetBranchLocationUseCase } from "./application/set-branch-location";

/**
 * The HR context's composition root — same shape/pattern as
 * @9thround/reception and @9thround/identity's createXModule() factories.
 * See docs/13-ddd-architecture.md.
 */
export function createHrModule(client: TypedSupabaseClient) {
  const shiftRepository = new SupabaseShiftRepository(client);
  const attendanceRepository = new SupabaseAttendanceRepository(client);
  const leaveRequestRepository = new SupabaseLeaveRequestRepository(client);
  const salaryRepository = new SupabaseSalaryRepository(client);
  const branchLocationRepository = new SupabaseBranchLocationRepository(client);

  return {
    listShifts: new ListShiftsUseCase(shiftRepository),
    createShift: new CreateShiftUseCase(shiftRepository),
    deleteShift: new DeleteShiftUseCase(shiftRepository),
    clockIn: new ClockInUseCase(attendanceRepository),
    clockOut: new ClockOutUseCase(attendanceRepository),
    getOpenAttendance: new GetOpenAttendanceUseCase(attendanceRepository),
    listAttendance: new ListAttendanceUseCase(attendanceRepository),
    requestLeave: new RequestLeaveUseCase(leaveRequestRepository),
    reviewLeaveRequest: new ReviewLeaveRequestUseCase(leaveRequestRepository),
    listLeaveRequests: new ListLeaveRequestsUseCase(leaveRequestRepository),
    setSalary: new SetSalaryUseCase(salaryRepository),
    listPayroll: new ListPayrollUseCase(salaryRepository),
    getBranchLocation: new GetBranchLocationUseCase(branchLocationRepository),
    setBranchLocation: new SetBranchLocationUseCase(branchLocationRepository),
  };
}
