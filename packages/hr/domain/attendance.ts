export interface AttendanceRecord {
  id: string;
  profileId: string;
  profileFullName: string | null;
  branchId: string;
  clockIn: Date;
  clockOut: Date | null;
}
