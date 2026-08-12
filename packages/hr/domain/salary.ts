export interface SalaryRecord {
  id: string;
  profileId: string;
  branchId: string;
  monthlyAmount: number;
  /** "YYYY-MM-DD" — when this amount takes effect; a new row per change, history preserved, matching how memberships/payments never mutate old rows. */
  effectiveFrom: string;
  createdAt: Date;
}

/** SalaryRecord joined with the staff member's name/role, for the payroll summary list. */
export interface PayrollEntry extends SalaryRecord {
  fullName: string | null;
  role: string;
}
