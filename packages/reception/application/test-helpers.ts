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
      ...output,
    }),
  );
}

export class FakeMemberSearchRepository implements MemberSearchRepository {
  constructor(private result: Result<MemberSearchResult[]>) {}

  async search(): Promise<Result<MemberSearchResult[]>> {
    return this.result;
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
    memberCode: "9RA1B2C3",
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
