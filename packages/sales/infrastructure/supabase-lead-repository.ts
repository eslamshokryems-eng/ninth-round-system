import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type {
  ConvertLeadInput,
  ConvertLeadOutput,
  CreateLeadInput,
  LeadDetail,
  LeadLostReason,
  LeadSummary,
  UpdateLeadInput,
} from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

const SUMMARY_COLUMNS = `id, full_name, phone, status, source, assigned_to, created_at,
  assigned:profiles!leads_assigned_to_fkey (full_name),
  interested:membership_types (name)`;

interface SummaryRow {
  id: string;
  full_name: string;
  phone: string;
  status: LeadSummary["status"];
  source: LeadSummary["source"];
  assigned_to: string | null;
  created_at: string;
  // Both to-one embeds — see supabase-member-detail-repository.ts's comment
  // on why these are cast rather than trusted from supabase-js's own
  // inference (no Relationships metadata for these FKs yet).
  assigned: { full_name: string | null } | null;
  interested: { name: string } | null;
}

function toSummary(row: SummaryRow): LeadSummary {
  return {
    leadId: row.id,
    fullName: row.full_name,
    phone: row.phone,
    status: row.status,
    source: row.source,
    assignedToId: row.assigned_to,
    assignedToName: row.assigned?.full_name ?? null,
    interestedMembershipTypeName: row.interested?.name ?? null,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseLeadRepository implements LeadRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async search(query: string): Promise<Result<LeadSummary[]>> {
    const escaped = query.replace(/[%,]/g, "");
    const { data, error } = await this.client
      .from("leads")
      .select(SUMMARY_COLUMNS)
      .or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`)
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      return err(domainError("LEAD_SEARCH_FAILED", error.message));
    }
    return ok((data as unknown as SummaryRow[]).map(toSummary));
  }

  async list(): Promise<Result<LeadSummary[]>> {
    // A flat 300-row cap, not real server-side pagination — the Leads page
    // paginates this already-fetched array client-side, same pattern as
    // the Members list (packages/reception's ListMembersUseCase).
    const { data, error } = await this.client
      .from("leads")
      .select(SUMMARY_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      return err(domainError("LEAD_LIST_FAILED", error.message));
    }
    return ok((data as unknown as SummaryRow[]).map(toSummary));
  }

  async findDuplicatesByPhone(branchId: string, phone: string): Promise<Result<LeadSummary[]>> {
    const { data, error } = await this.client
      .from("leads")
      .select(SUMMARY_COLUMNS)
      .eq("branch_id", branchId)
      .eq("phone", phone)
      .limit(10);

    if (error) {
      return err(domainError("LEAD_DUPLICATE_CHECK_FAILED", error.message));
    }
    return ok((data as unknown as SummaryRow[]).map(toSummary));
  }

  async getDetail(leadId: string): Promise<Result<LeadDetail>> {
    const { data, error } = await this.client
      .from("leads")
      .select(
        `id, branch_id, full_name, phone, email, gender, status, source, interested_membership_type_id,
         interest_notes, assigned_to, lost_reason, lost_note, lost_at, converted_member_id, converted_at, created_at,
         assigned:profiles!leads_assigned_to_fkey (full_name),
         interested:membership_types (name)`,
      )
      .eq("id", leadId)
      .maybeSingle();

    if (error) {
      return err(domainError("LEAD_DETAIL_FAILED", error.message));
    }
    if (!data) {
      return err(domainError("LEAD_NOT_FOUND", "Lead not found."));
    }

    const row = data as unknown as {
      id: string;
      branch_id: string;
      full_name: string;
      phone: string;
      email: string | null;
      gender: LeadDetail["gender"];
      status: LeadDetail["status"];
      source: LeadDetail["source"];
      interested_membership_type_id: string | null;
      interest_notes: string | null;
      assigned_to: string | null;
      lost_reason: LeadLostReason | null;
      lost_note: string | null;
      lost_at: string | null;
      converted_member_id: string | null;
      converted_at: string | null;
      created_at: string;
      assigned: { full_name: string | null } | null;
      interested: { name: string } | null;
    };

    return ok({
      leadId: row.id,
      branchId: row.branch_id,
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      gender: row.gender,
      status: row.status,
      source: row.source,
      interestedMembershipTypeId: row.interested_membership_type_id,
      interestedMembershipTypeName: row.interested?.name ?? null,
      interestNotes: row.interest_notes,
      assignedToId: row.assigned_to,
      assignedToName: row.assigned?.full_name ?? null,
      lostReason: row.lost_reason,
      lostNote: row.lost_note,
      lostAt: row.lost_at ? new Date(row.lost_at) : null,
      convertedMemberId: row.converted_member_id,
      convertedAt: row.converted_at ? new Date(row.converted_at) : null,
      createdAt: new Date(row.created_at),
    });
  }

  async create(input: CreateLeadInput): Promise<Result<{ leadId: string }>> {
    const { data, error } = await this.client
      .from("leads")
      .insert({
        branch_id: input.branchId,
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        gender: input.gender,
        source: input.source,
        interested_membership_type_id: input.interestedMembershipTypeId,
        interest_notes: input.interestNotes,
        assigned_to: input.assignedToId,
      })
      .select("id")
      .single();

    if (error) {
      return err(domainError("LEAD_CREATE_FAILED", error.message));
    }
    return ok({ leadId: data.id });
  }

  async update(input: UpdateLeadInput): Promise<Result<void>> {
    const { error } = await this.client
      .from("leads")
      .update({
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        gender: input.gender,
        source: input.source,
        interested_membership_type_id: input.interestedMembershipTypeId,
        interest_notes: input.interestNotes,
      })
      .eq("id", input.leadId);

    if (error) {
      return err(domainError("LEAD_UPDATE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async assign(leadId: string, assignedToId: string | null): Promise<Result<void>> {
    const { error } = await this.client.from("leads").update({ assigned_to: assignedToId }).eq("id", leadId);

    if (error) {
      return err(domainError("LEAD_ASSIGN_FAILED", error.message));
    }
    return ok(undefined);
  }

  async markLost(leadId: string, reason: LeadLostReason, note: string | null): Promise<Result<void>> {
    const { error } = await this.client
      .from("leads")
      .update({ status: "lost", lost_reason: reason, lost_note: note, lost_at: new Date().toISOString() })
      .eq("id", leadId);

    if (error) {
      return err(domainError("LEAD_MARK_LOST_FAILED", error.message));
    }
    return ok(undefined);
  }

  async restore(leadId: string): Promise<Result<void>> {
    const { error } = await this.client
      .from("leads")
      .update({ status: "follow_up", lost_reason: null, lost_note: null, lost_at: null })
      .eq("id", leadId);

    if (error) {
      return err(domainError("LEAD_RESTORE_FAILED", error.message));
    }
    return ok(undefined);
  }

  async convert(input: ConvertLeadInput): Promise<Result<ConvertLeadOutput>> {
    const { data, error } = await this.client
      .rpc("convert_lead_to_member", {
        p_lead_id: input.leadId,
        p_membership_type_id: input.membershipTypeId,
        p_receipt_number: input.receiptNumber,
        p_price: input.price,
        p_discount: input.discount,
        p_start_date: input.startDate,
        p_payment_method: input.paymentMethod,
        p_notes: input.notes,
        p_national_id: input.nationalId,
        p_date_of_birth: input.dateOfBirth,
        p_address: input.address,
        p_emergency_contact_name: input.emergencyContactName,
        p_emergency_contact_phone: input.emergencyContactPhone,
        p_photo_url: input.photoUrl,
        p_coach_id: input.coachId,
        p_session_count: input.sessionCount,
      })
      .single();

    if (error) {
      return err(domainError("LEAD_CONVERT_FAILED", error.message));
    }

    const row = data as { member_id: string; membership_id: string; membership_number: string; member_qr_code: string };
    return ok({
      memberId: row.member_id,
      membershipId: row.membership_id,
      membershipNumber: row.membership_number,
      memberQrCode: row.member_qr_code,
    });
  }
}
