/** Sales Manager Dashboard (Release C part 1): read-only team metrics. Every definition is stated next to the number on screen and in the migration. */
export interface TeamPeriod {
  /** null = every branch (Super Admin only; the database refuses it for a manager). */
  branchId: string | null;
  /** Africa/Cairo calendar days, inclusive. Omitted = the current month so far. */
  startDate?: string | undefined;
  endDate?: string | undefined;
}

export interface TeamSummary {
  activeLeads: number;
  unassignedLeads: number;
  newInPeriod: number;
  dueToday: number;
  /** distinct LEADS with a pending follow-up due before now */
  overdueLeads: number;
  hotLeads: number;
  noNextAction: number;
  /** active leads whose last contact (or creation, if never contacted) is more than 7 days ago */
  noRecentContact: number;
  interactionsInPeriod: number;
  convertedInPeriod: number;
  lostInPeriod: number;
  /** converted ÷ (converted + lost) among leads DECIDED in the period; null when nothing was decided */
  conversionRateDecided: number | null;
  /** converted ÷ leads created in the period; null when none were created */
  conversionRateCohort: number | null;
}

export interface TeamEmployeeRow {
  /** null = the unassigned manager inbox */
  employeeId: string | null;
  employeeName: string;
  branchId: string | null;
  activeLeads: number;
  overdueLeads: number;
  dueToday: number;
  hotLeads: number;
  noNextAction: number;
  noRecentContact: number;
  newInPeriod: number;
  interactionsInPeriod: number;
  convertedInPeriod: number;
  lostInPeriod: number;
}

export type AttentionKind = "overdue" | "no_next_action" | "no_recent_contact" | "unassigned";

export interface AttentionLead {
  leadId: string;
  fullName: string;
  phone: string;
  status: string;
  interestLevel: string;
  assignedTo: string | null;
  ownerName: string | null;
  lastContactedAt: Date | null;
  nextActionAt: Date | null;
  daysSinceContact: number | null;
  createdAt: Date;
  branchId: string;
  source: string;
}

export interface AttentionQuery extends TeamPeriod {
  kind: AttentionKind;
  ownerId?: string | null;
  limit?: number;
  offset?: number;
}

/** "Needs support" signal for the manager screen: an explainable rule, not a score. */
export function needsSupport(row: TeamEmployeeRow): string[] {
  const reasons: string[] = [];
  if (row.activeLeads > 0 && row.overdueLeads / row.activeLeads >= 0.3) reasons.push("30% or more of their leads are overdue");
  if (row.activeLeads > 0 && row.noNextAction / row.activeLeads >= 0.5) reasons.push("half or more of their leads have no next action");
  if (row.activeLeads > 0 && row.interactionsInPeriod === 0) reasons.push("no contact recorded in the period");
  return reasons;
}
