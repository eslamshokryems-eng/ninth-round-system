/** 0 = Sunday .. 6 = Saturday, matching JS Date.getDay() and the receipts calendar's own weekday indexing. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Shift {
  id: string;
  profileId: string;
  profileFullName: string | null;
  branchId: string;
  dayOfWeek: DayOfWeek;
  /** "HH:MM", 24-hour, e.g. "09:00". */
  startTime: string;
  endTime: string;
}
