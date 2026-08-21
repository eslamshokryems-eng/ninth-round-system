import type { Result } from "@9thround/shared-kernel";
import type {
  ConvertLeadInput,
  ConvertLeadOutput,
  CreateLeadInput,
  LeadDetail,
  LeadLostReason,
  LeadSummary,
  UpdateLeadInput,
} from "./lead";

export interface LeadRepository {
  /** Matches against phone or full name (case-insensitive, partial). */
  search(query: string): Promise<Result<LeadSummary[]>>;
  /** All leads visible to the caller under RLS, newest first — see list-leads.ts for the size cap's caveat. */
  list(): Promise<Result<LeadSummary[]>>;
  getDetail(leadId: string): Promise<Result<LeadDetail>>;
  create(input: CreateLeadInput): Promise<Result<{ leadId: string }>>;
  update(input: UpdateLeadInput): Promise<Result<void>>;
  assign(leadId: string, assignedToId: string | null): Promise<Result<void>>;
  markLost(leadId: string, reason: LeadLostReason, note: string | null): Promise<Result<void>>;
  restore(leadId: string): Promise<Result<void>>;
  convert(input: ConvertLeadInput): Promise<Result<ConvertLeadOutput>>;
  /** Same-branch leads sharing this phone number — a non-blocking duplicate warning, never a hard reject. */
  findDuplicatesByPhone(branchId: string, phone: string): Promise<Result<LeadSummary[]>>;
}
