import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { DashboardRepository } from "../domain/dashboard-repository";
import type { DashboardStats } from "../domain/dashboard-stats";
import type { RegistrationRepository } from "../domain/registration-repository";
import type { RegisterMembershipInput, RegisterMembershipOutput } from "../domain/registration";
import type { MemberSearchRepository } from "../domain/member-search-repository";
import type { MemberSearchResult } from "../domain/member-search-result";
import type { RenewalRepository } from "../domain/renewal-repository";
import type { RenewMembershipInput, RenewMembershipOutput } from "../domain/renewal";
import type { MemberDetailRepository } from "../domain/member-detail-repository";
import type { MemberDetail } from "../domain/member-detail";
import type { UpdateMemberRepository } from "../domain/update-member-repository";
import type { UpdateMemberInput } from "../domain/update-member";
import type { DeleteMemberRepository } from "../domain/delete-member-repository";
import type { CheckInRepository } from "../domain/check-in-repository";
import type { CheckInHistoryEntry, CheckInMemberOutput, RecentCheckInEntry } from "../domain/check-in";
import type { MemberPhotoRepository } from "../domain/member-photo-repository";
import type { UploadMemberPhotoInput, UploadMemberPhotoOutput } from "../domain/member-photo";
import type { ExpenseRepository } from "../domain/expense-repository";
import type { Expense, RecordExpenseInput } from "../domain/expense";
import type { EquipmentSaleRepository } from "../domain/equipment-sale-repository";
import type { EquipmentSale, RecordEquipmentSaleInput } from "../domain/equipment-sale";

export function buildDashboardStats(overrides: Partial<DashboardStats> = {}): DashboardStats {
  return {
    activeMembers: 0,
    newMembersToday: 0,
    expiringToday: 0,
    expiringThisWeek: 0,
    expiredMemberships: 0,
    dailyRevenue: 0,
    monthlyRevenue: 0,
    ...overrides,
  };
}

export class FakeDashboardRepository implements DashboardRepository {
  constructor(private result: Result<DashboardStats>) {}

  async getStats(): Promise<Result<DashboardStats>> {
    return this.result;
  }
}

export function fakeDashboardRepository(stats: Partial<DashboardStats> = {}): FakeDashboardRepository {
  return new FakeDashboardRepository(ok(buildDashboardStats(stats)));
}

export function buildRegisterMembershipInput(
  overrides: Partial<RegisterMembershipInput> = {},
): RegisterMembershipInput {
  return {
    branchId: "branch-1",
    fullName: "Ahmed Test",
    phone: "+201000000001",
    gender: "male",
    dateOfBirth: "1995-01-01",
    nationalId: null,
    membershipTypeId: "type-1",
    receiptNumber: "RCPT-0001",
    price: 500,
    discount: 0,
    startDate: "2026-08-06",
    paymentMethod: "cash",
    notes: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    photoUrl: null,
    coachId: null,
    sessionCount: null,
    ...overrides,
  };
}

export class FakeRegistrationRepository implements RegistrationRepository {
  public lastInput: RegisterMembershipInput | null = null;
  constructor(private result: Result<RegisterMembershipOutput>) {}

  async register(input: RegisterMembershipInput): Promise<Result<RegisterMembershipOutput>> {
    this.lastInput = input;
    return this.result;
  }
}

export function fakeRegistrationRepository(
  output: Partial<RegisterMembershipOutput> = {},
): FakeRegistrationRepository {
  return new FakeRegistrationRepository(
    ok({
      memberId: "member-1",
      membershipId: "membership-1",
      membershipNumber: "9R-000001",
      memberQrCode: "qr-code-1",
      ...output,
    }),
  );
}

export class FakeMemberSearchRepository implements MemberSearchRepository {
  public byQrCode = new Map<string, MemberSearchResult>();

  constructor(private result: Result<MemberSearchResult[]>) {}

  async search(): Promise<Result<MemberSearchResult[]>> {
    return this.result;
  }

  async list(): Promise<Result<MemberSearchResult[]>> {
    return this.result;
  }

  async findByQrCode(qrCode: string): Promise<Result<MemberSearchResult | null>> {
    return ok(this.byQrCode.get(qrCode) ?? null);
  }
}

export function fakeMemberSearchRepository(results: MemberSearchResult[] = []): FakeMemberSearchRepository {
  return new FakeMemberSearchRepository(ok(results));
}

export function buildRenewMembershipInput(overrides: Partial<RenewMembershipInput> = {}): RenewMembershipInput {
  return {
    memberId: "member-1",
    membershipTypeId: "type-1",
    receiptNumber: "RCPT-0002",
    price: 500,
    discount: 0,
    paymentMethod: "cash",
    notes: null,
    coachId: null,
    sessionCount: null,
    ...overrides,
  };
}

export class FakeRenewalRepository implements RenewalRepository {
  public lastInput: RenewMembershipInput | null = null;
  constructor(private result: Result<RenewMembershipOutput>) {}

  async renew(input: RenewMembershipInput): Promise<Result<RenewMembershipOutput>> {
    this.lastInput = input;
    return this.result;
  }
}

export function fakeRenewalRepository(output: Partial<RenewMembershipOutput> = {}): FakeRenewalRepository {
  return new FakeRenewalRepository(
    ok({
      membershipId: "membership-2",
      membershipNumber: "9R-000002",
      startDate: "2026-08-06",
      endDate: "2026-09-05",
      ...output,
    }),
  );
}

export function buildMemberDetail(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    memberId: "member-1",
    memberCode: "01",
    qrCode: "qr-code-1",
    photoUrl: null,
    fullName: "Ahmed Test",
    phone: "+201000000001",
    email: null,
    gender: "male",
    dateOfBirth: "1995-01-01",
    nationalId: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    address: null,
    notes: null,
    membershipHistory: [],
    ...overrides,
  };
}

export class FakeMemberDetailRepository implements MemberDetailRepository {
  public lastMemberId: string | null = null;
  constructor(private result: Result<MemberDetail>) {}

  async getById(memberId: string): Promise<Result<MemberDetail>> {
    this.lastMemberId = memberId;
    return this.result;
  }
}

export function fakeMemberDetailRepository(overrides: Partial<MemberDetail> = {}): FakeMemberDetailRepository {
  return new FakeMemberDetailRepository(ok(buildMemberDetail(overrides)));
}

export function buildUpdateMemberInput(overrides: Partial<UpdateMemberInput> = {}): UpdateMemberInput {
  return {
    memberId: "member-1",
    fullName: "Ahmed Test",
    phone: "+201000000001",
    email: null,
    gender: "male",
    dateOfBirth: "1995-01-01",
    nationalId: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    address: null,
    notes: null,
    ...overrides,
  };
}

export class FakeUpdateMemberRepository implements UpdateMemberRepository {
  public lastInput: UpdateMemberInput | null = null;
  constructor(private result: Result<void> = ok(undefined)) {}

  async update(input: UpdateMemberInput): Promise<Result<void>> {
    this.lastInput = input;
    return this.result;
  }
}

export class FakeDeleteMemberRepository implements DeleteMemberRepository {
  public lastMemberId: string | null = null;
  constructor(private result: Result<void> = ok(undefined)) {}

  async delete(memberId: string): Promise<Result<void>> {
    this.lastMemberId = memberId;
    return this.result;
  }
}

export function fakeDeleteMemberRepository(result: Result<void> = ok(undefined)): FakeDeleteMemberRepository {
  return new FakeDeleteMemberRepository(result);
}

export class FakeCheckInRepository implements CheckInRepository {
  public lastMemberId: string | null = null;
  public history: CheckInHistoryEntry[] = [];
  public recent: RecentCheckInEntry[] = [];
  constructor(private result: Result<CheckInMemberOutput>) {}

  async checkIn(memberId: string): Promise<Result<CheckInMemberOutput>> {
    this.lastMemberId = memberId;
    return this.result;
  }

  async listByMember(memberId: string): Promise<Result<CheckInHistoryEntry[]>> {
    this.lastMemberId = memberId;
    return ok(this.history);
  }

  async listRecent(): Promise<Result<RecentCheckInEntry[]>> {
    return ok(this.recent);
  }
}

export function fakeCheckInRepository(overrides: Partial<CheckInMemberOutput> = {}): FakeCheckInRepository {
  return new FakeCheckInRepository(
    ok({
      checkInId: "check-in-1",
      checkedInAt: "2026-08-06T10:00:00.000Z",
      ...overrides,
    }),
  );
}

export function buildUploadMemberPhotoInput(
  overrides: Partial<UploadMemberPhotoInput> = {},
): UploadMemberPhotoInput {
  return {
    branchId: "branch-1",
    data: new ArrayBuffer(4),
    contentType: "image/jpeg",
    fileExtension: "jpg",
    ...overrides,
  };
}

export class FakeMemberPhotoRepository implements MemberPhotoRepository {
  public lastInput: UploadMemberPhotoInput | null = null;
  constructor(private result: Result<UploadMemberPhotoOutput>) {}

  async upload(input: UploadMemberPhotoInput): Promise<Result<UploadMemberPhotoOutput>> {
    this.lastInput = input;
    return this.result;
  }
}

export function fakeMemberPhotoRepository(
  overrides: Partial<UploadMemberPhotoOutput> = {},
): FakeMemberPhotoRepository {
  return new FakeMemberPhotoRepository(
    ok({
      path: "branch-1/some-photo.jpg",
      signedUrl: "https://example.supabase.co/storage/v1/object/sign/member-photos/branch-1/some-photo.jpg?token=abc",
      ...overrides,
    }),
  );
}

export function buildRecordExpenseInput(overrides: Partial<RecordExpenseInput> = {}): RecordExpenseInput {
  return {
    branchId: "branch-1",
    category: "utilities",
    description: null,
    amount: 1500,
    expenseDate: "2026-08-06",
    paymentMethod: "cash",
    receiptReference: null,
    notes: null,
    ...overrides,
  };
}

export class FakeExpenseRepository implements ExpenseRepository {
  public lastInput: RecordExpenseInput | null = null;
  constructor(private result: Result<Expense> = ok(buildExpense())) {}

  async record(input: RecordExpenseInput): Promise<Result<Expense>> {
    this.lastInput = input;
    return this.result;
  }

  async list(): Promise<Result<Expense[]>> {
    return ok([]);
  }
}

export function buildExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "expense-1",
    category: "utilities",
    description: null,
    amount: 1500,
    expenseDate: "2026-08-06",
    paymentMethod: "cash",
    receiptReference: null,
    notes: null,
    createdAt: "2026-08-06T10:00:00.000Z",
    ...overrides,
  };
}

export function fakeExpenseRepository(overrides: Partial<Expense> = {}): FakeExpenseRepository {
  return new FakeExpenseRepository(ok(buildExpense(overrides)));
}

export function buildRecordEquipmentSaleInput(
  overrides: Partial<RecordEquipmentSaleInput> = {},
): RecordEquipmentSaleInput {
  return {
    branchId: "branch-1",
    itemName: "Boxing Gloves",
    quantity: 1,
    unitPrice: 350,
    paymentMethod: "cash",
    buyerName: null,
    buyerPhone: null,
    notes: null,
    ...overrides,
  };
}

export class FakeEquipmentSaleRepository implements EquipmentSaleRepository {
  public lastInput: RecordEquipmentSaleInput | null = null;
  constructor(private result: Result<EquipmentSale> = ok(buildEquipmentSale())) {}

  async record(input: RecordEquipmentSaleInput): Promise<Result<EquipmentSale>> {
    this.lastInput = input;
    return this.result;
  }

  async list(): Promise<Result<EquipmentSale[]>> {
    return ok([]);
  }
}

export function buildEquipmentSale(overrides: Partial<EquipmentSale> = {}): EquipmentSale {
  return {
    id: "sale-1",
    itemName: "Boxing Gloves",
    quantity: 1,
    unitPrice: 350,
    totalPrice: 350,
    paymentMethod: "cash",
    buyerName: null,
    buyerPhone: null,
    notes: null,
    createdAt: "2026-08-06T10:00:00.000Z",
    ...overrides,
  };
}

export function fakeEquipmentSaleRepository(overrides: Partial<EquipmentSale> = {}): FakeEquipmentSaleRepository {
  return new FakeEquipmentSaleRepository(ok(buildEquipmentSale(overrides)));
}
