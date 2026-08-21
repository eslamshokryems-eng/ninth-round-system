import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { LeadRepository } from "../domain/lead-repository";
import type {
  ConvertLeadInput,
  ConvertLeadOutput,
  CreateLeadInput,
  LeadDetail,
  LeadLostReason,
  LeadSummary,
  UpdateLeadInput,
} from "../domain/lead";
import type { LeadFollowupRepository } from "../domain/lead-followup-repository";
import type { CreateFollowupInput, LeadFollowup } from "../domain/lead-followup";
import type { LeadTimelineRepository } from "../domain/lead-timeline-repository";
import type { LeadTimelineEntry } from "../domain/lead-timeline-entry";
import type { SalesDashboardRepository } from "../domain/sales-dashboard-repository";
import type { SalesDashboardStats } from "../domain/sales-dashboard-stats";

export function buildCreateLeadInput(overrides: Partial<CreateLeadInput> = {}): CreateLeadInput {
  return {
    branchId: "branch-1",
    fullName: "Sara Test",
    phone: "+201000000010",
    email: null,
    gender: "female",
    source: "walk_in",
    interestedMembershipTypeId: null,
    interestNotes: null,
    assignedToId: null,
    ...overrides,
  };
}

export function buildUpdateLeadInput(overrides: Partial<UpdateLeadInput> = {}): UpdateLeadInput {
  return {
    leadId: "lead-1",
    fullName: "Sara Test",
    phone: "+201000000010",
    email: null,
    gender: "female",
    source: "walk_in",
    interestedMembershipTypeId: null,
    interestNotes: null,
    ...overrides,
  };
}

export function buildLeadSummary(overrides: Partial<LeadSummary> = {}): LeadSummary {
  return {
    leadId: "lead-1",
    fullName: "Sara Test",
    phone: "+201000000010",
    status: "new",
    source: "walk_in",
    assignedToId: null,
    assignedToName: null,
    interestedMembershipTypeName: null,
    createdAt: new Date("2026-08-21T10:00:00.000Z"),
    ...overrides,
  };
}

export function buildLeadDetail(overrides: Partial<LeadDetail> = {}): LeadDetail {
  return {
    leadId: "lead-1",
    branchId: "branch-1",
    fullName: "Sara Test",
    phone: "+201000000010",
    email: null,
    gender: "female",
    status: "new",
    source: "walk_in",
    interestedMembershipTypeId: null,
    interestedMembershipTypeName: null,
    interestNotes: null,
    assignedToId: null,
    assignedToName: null,
    lostReason: null,
    lostNote: null,
    lostAt: null,
    convertedMemberId: null,
    convertedAt: null,
    createdAt: new Date("2026-08-21T10:00:00.000Z"),
    ...overrides,
  };
}

export function buildConvertLeadInput(overrides: Partial<ConvertLeadInput> = {}): ConvertLeadInput {
  return {
    leadId: "lead-1",
    membershipTypeId: "type-1",
    receiptNumber: "RCPT-1000",
    price: 500,
    discount: 0,
    startDate: "2026-08-21",
    paymentMethod: "cash",
    notes: null,
    nationalId: null,
    dateOfBirth: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    photoUrl: null,
    coachId: null,
    sessionCount: null,
    ...overrides,
  };
}

export class FakeLeadRepository implements LeadRepository {
  public lastCreateInput: CreateLeadInput | null = null;
  public lastUpdateInput: UpdateLeadInput | null = null;
  public lastConvertInput: ConvertLeadInput | null = null;
  public lastAssign: { leadId: string; assignedToId: string | null } | null = null;
  public lastMarkLost: { leadId: string; reason: LeadLostReason; note: string | null } | null = null;
  public lastRestoreLeadId: string | null = null;
  public list_: LeadSummary[] = [];
  public duplicates: LeadSummary[] = [];

  constructor(
    private results: {
      create?: Result<{ leadId: string }>;
      update?: Result<void>;
      assign?: Result<void>;
      markLost?: Result<void>;
      restore?: Result<void>;
      convert?: Result<ConvertLeadOutput>;
      detail?: Result<LeadDetail>;
      search?: Result<LeadSummary[]>;
    } = {},
  ) {}

  async search(): Promise<Result<LeadSummary[]>> {
    return this.results.search ?? ok(this.list_);
  }

  async list(): Promise<Result<LeadSummary[]>> {
    return ok(this.list_);
  }

  async getDetail(): Promise<Result<LeadDetail>> {
    return this.results.detail ?? ok(buildLeadDetail());
  }

  async create(input: CreateLeadInput): Promise<Result<{ leadId: string }>> {
    this.lastCreateInput = input;
    return this.results.create ?? ok({ leadId: "lead-1" });
  }

  async update(input: UpdateLeadInput): Promise<Result<void>> {
    this.lastUpdateInput = input;
    return this.results.update ?? ok(undefined);
  }

  async assign(leadId: string, assignedToId: string | null): Promise<Result<void>> {
    this.lastAssign = { leadId, assignedToId };
    return this.results.assign ?? ok(undefined);
  }

  async markLost(leadId: string, reason: LeadLostReason, note: string | null): Promise<Result<void>> {
    this.lastMarkLost = { leadId, reason, note };
    return this.results.markLost ?? ok(undefined);
  }

  async restore(leadId: string): Promise<Result<void>> {
    this.lastRestoreLeadId = leadId;
    return this.results.restore ?? ok(undefined);
  }

  async convert(input: ConvertLeadInput): Promise<Result<ConvertLeadOutput>> {
    this.lastConvertInput = input;
    return (
      this.results.convert ??
      ok({ memberId: "member-1", membershipId: "membership-1", membershipNumber: "9R-000001", memberQrCode: "qr-1" })
    );
  }

  async findDuplicatesByPhone(): Promise<Result<LeadSummary[]>> {
    return ok(this.duplicates);
  }
}

export function fakeLeadRepository(): FakeLeadRepository {
  return new FakeLeadRepository();
}

export function buildCreateFollowupInput(overrides: Partial<CreateFollowupInput> = {}): CreateFollowupInput {
  return {
    leadId: "lead-1",
    branchId: "branch-1",
    dueAt: "2026-08-22T10:00:00.000Z",
    note: null,
    ...overrides,
  };
}

export function buildLeadFollowup(overrides: Partial<LeadFollowup> = {}): LeadFollowup {
  return {
    followupId: "followup-1",
    leadId: "lead-1",
    leadFullName: "Sara Test",
    leadPhone: "+201000000010",
    dueAt: new Date("2026-08-22T10:00:00.000Z"),
    note: null,
    status: "pending",
    completedAt: null,
    completedNote: null,
    createdAt: new Date("2026-08-21T10:00:00.000Z"),
    ...overrides,
  };
}

export class FakeLeadFollowupRepository implements LeadFollowupRepository {
  public lastCreateInput: CreateFollowupInput | null = null;
  public lastComplete: { followupId: string; note: string | null } | null = null;
  public lastReschedule: { followupId: string; dueAt: string } | null = null;
  public lastCancelFollowupId: string | null = null;
  public dueToday: LeadFollowup[] = [];
  public overdue: LeadFollowup[] = [];

  async listForLead(): Promise<Result<LeadFollowup[]>> {
    return ok([]);
  }

  async listDueToday(): Promise<Result<LeadFollowup[]>> {
    return ok(this.dueToday);
  }

  async listOverdue(): Promise<Result<LeadFollowup[]>> {
    return ok(this.overdue);
  }

  async create(input: CreateFollowupInput): Promise<Result<{ followupId: string }>> {
    this.lastCreateInput = input;
    return ok({ followupId: "followup-1" });
  }

  async complete(followupId: string, note: string | null): Promise<Result<void>> {
    this.lastComplete = { followupId, note };
    return ok(undefined);
  }

  async reschedule(followupId: string, dueAt: string): Promise<Result<void>> {
    this.lastReschedule = { followupId, dueAt };
    return ok(undefined);
  }

  async cancel(followupId: string): Promise<Result<void>> {
    this.lastCancelFollowupId = followupId;
    return ok(undefined);
  }
}

export function fakeLeadFollowupRepository(): FakeLeadFollowupRepository {
  return new FakeLeadFollowupRepository();
}

export function buildLeadTimelineEntry(overrides: Partial<LeadTimelineEntry> = {}): LeadTimelineEntry {
  return {
    id: "audit-1",
    action: "create_lead",
    actorRole: "sales_employee",
    actorFullName: "Sara Sales",
    before: null,
    after: null,
    metadata: {},
    occurredAt: new Date("2026-08-21T10:00:00.000Z"),
    ...overrides,
  };
}

export class FakeLeadTimelineRepository implements LeadTimelineRepository {
  constructor(private entries: LeadTimelineEntry[] = []) {}

  async listForLead(): Promise<Result<LeadTimelineEntry[]>> {
    return ok(this.entries);
  }
}

export function fakeLeadTimelineRepository(entries: LeadTimelineEntry[] = []): FakeLeadTimelineRepository {
  return new FakeLeadTimelineRepository(entries);
}

export function buildSalesDashboardStats(overrides: Partial<SalesDashboardStats> = {}): SalesDashboardStats {
  return {
    totalLeads: 0,
    newLeadsToday: 0,
    followUpsDueToday: 0,
    overdueFollowUps: 0,
    convertedThisMonth: 0,
    lostThisMonth: 0,
    conversionRatePercent: 0,
    ...overrides,
  };
}

export class FakeSalesDashboardRepository implements SalesDashboardRepository {
  constructor(private result: Result<SalesDashboardStats> = ok(buildSalesDashboardStats())) {}

  async getStats(): Promise<Result<SalesDashboardStats>> {
    return this.result;
  }
}

export function fakeSalesDashboardRepository(overrides: Partial<SalesDashboardStats> = {}): FakeSalesDashboardRepository {
  return new FakeSalesDashboardRepository(ok(buildSalesDashboardStats(overrides)));
}
