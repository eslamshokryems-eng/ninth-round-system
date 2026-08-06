import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { DashboardRepository } from "../domain/dashboard-repository";
import type { DashboardStats } from "../domain/dashboard-stats";
import type { RegistrationRepository } from "../domain/registration-repository";
import type { RegisterMembershipInput, RegisterMembershipOutput } from "../domain/registration";
import type { MemberSearchRepository } from "../domain/member-search-repository";
import type { MemberSearchResult } from "../domain/member-search-result";

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
