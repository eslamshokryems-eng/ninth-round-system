export type FollowupStatus = "pending" | "completed" | "cancelled";

export interface LeadFollowup {
  followupId: string;
  leadId: string;
  leadFullName: string;
  leadPhone: string;
  dueAt: Date;
  note: string | null;
  status: FollowupStatus;
  completedAt: Date | null;
  completedNote: string | null;
  createdAt: Date;
}

export interface CreateFollowupInput {
  leadId: string;
  branchId: string;
  dueAt: string;
  note: string | null;
}
