import type { LeadLostReason, LeadSource, LeadStatus } from "./lead";

/** Sales Workspace domain (Release B). The database owns every rule; these types and helpers drive the screens and give early, friendly validation. */

export type InteractionKind = "call" | "whatsapp" | "visit";
export type NextActionKind = "call" | "whatsapp" | "visit" | "other";
export type InteractionOutcome =
  | "no_answer" | "message_sent" | "interested" | "wants_visit" | "ready_to_join"
  | "not_ready" | "attended_visit" | "no_show" | "not_interested" | "other";
export type InterestLevel = "hot" | "warm" | "cold";

export const INTERACTION_KINDS: readonly InteractionKind[] = ["call", "whatsapp", "visit"];
export const NEXT_ACTION_KINDS: readonly NextActionKind[] = ["call", "whatsapp", "visit", "other"];
export const INTERACTION_OUTCOMES: readonly InteractionOutcome[] = [
  "no_answer", "message_sent", "interested", "wants_visit", "ready_to_join", "not_ready", "attended_visit", "no_show", "not_interested", "other",
];

/**
 * One primary bucket per lead, in priority order (the explainable rule from the CRM design): overdue, due today, first contact,
 * ready to convert, hot, awaiting a reply, no next action, scheduled. Priority (hot/warm/cold) never replaces the lead status.
 */
export type WorklistBucket =
  | "overdue" | "due_today" | "first_contact" | "ready_to_convert" | "hot" | "awaiting_response" | "no_next_action" | "scheduled";

export const WORKLIST_BUCKET_ORDER: readonly WorklistBucket[] = [
  "overdue", "due_today", "first_contact", "ready_to_convert", "hot", "awaiting_response", "no_next_action", "scheduled",
];

export interface WorklistItem {
  leadId: string;
  fullName: string;
  phone: string;
  source: LeadSource;
  status: LeadStatus;
  interestLevel: InterestLevel;
  assignedTo: string | null;
  ownerName: string | null;
  lastContactedAt: Date | null;
  daysSinceContact: number | null;
  nextActionKind: NextActionKind | null;
  nextActionAt: Date | null;
  lastOutcome: InteractionOutcome | null;
  bucket: WorklistBucket;
  reason: string;
  branchId: string;
}

export interface WorklistSummary {
  totalActive: number;
  overdue: number;
  dueToday: number;
  newUncontacted: number;
  hot: number;
  noNextAction: number;
  contactedRecently: number;
  awaitingResponse: number;
  readyToConvert: number;
  recentlyConverted: number;
}

export type LeadActivityKind =
  | "call" | "whatsapp" | "visit" | "follow_up" | "note" | "status_change" | "assignment" | "reassignment" | "conversion";

export interface LeadActivity {
  id: string;
  kind: LeadActivityKind;
  outcome: string | null;
  note: string | null;
  nextActionKind: string | null;
  nextActionAt: Date | null;
  detail: Record<string, unknown>;
  actorId: string | null;
  actorName: string | null;
  occurredAt: Date;
}

export interface LeadAssignmentRecord {
  id: string;
  fromOwnerId: string | null;
  toOwnerId: string | null;
  fromName: string | null;
  toName: string | null;
  performedById: string | null;
  performedByName: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface LeadWorkspaceState {
  interestLevel: InterestLevel;
  lastContactedAt: Date | null;
  nextActionKind: NextActionKind | null;
  nextActionAt: Date | null;
}

export interface LogInteractionInput {
  leadId: string;
  kind: InteractionKind;
  outcome: InteractionOutcome;
  note: string | null;
  nextKind: NextActionKind | null;
  nextAt: Date | null;
  lostReason: LeadLostReason | null;
  interestLevel: InterestLevel | null;
}

export interface SetNextActionInput {
  leadId: string;
  kind: NextActionKind;
  at: Date;
  note: string | null;
}

export interface AssignLeadsInput {
  leadIds: string[];
  newOwnerId: string;
  reason: string;
}

/** The outcome that closes the lead (a lost reason is then required and no next action is scheduled). */
export function isTerminalOutcome(outcome: InteractionOutcome): boolean {
  return outcome === "not_interested";
}

/**
 * EDITABLE default for "when should I follow up?" after an outcome — a suggestion, never an enforced interval
 * (customer preference and business policy decide). Returns a Date `now + N days` at 10:00 Cairo is intentionally NOT attempted:
 * the form shows the date and the employee picks the time.
 */
export function suggestNextActionAt(outcome: InteractionOutcome, now: Date = new Date()): Date {
  const days: Record<InteractionOutcome, number> = {
    no_answer: 1, message_sent: 1, interested: 2, wants_visit: 1, ready_to_join: 1,
    not_ready: 7, attended_visit: 2, no_show: 1, not_interested: 0, other: 1,
  };
  return new Date(now.getTime() + days[outcome] * 24 * 60 * 60 * 1000);
}

/** `wa.me` link for an Egyptian/international phone number. It only OPENS WhatsApp — nothing is sent from the system. */
export function whatsappLink(phone: string): string | null {
  let digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `20${digits.slice(1)}`;
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}`;
}

export function telLink(phone: string): string | null {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length >= 6 ? `tel:${cleaned}` : null;
}
