import { describe, expect, it } from "vitest";
import { toSearchResult } from "./supabase-member-search-repository";

describe("toSearchResult", () => {
  it("surfaces the active membership when one exists, even alongside older history", () => {
    const result = toSearchResult({
      id: "member-1",
      member_code: "ABC123",
      full_name: "Ahmed",
      phone: "0100",
      memberships: [
        { status: "expired", end_date: "2026-01-01" },
        { status: "active", end_date: "2026-12-01" },
      ],
    });
    expect(result.activeMembershipStatus).toBe("active");
    expect(result.activeMembershipEndDate).toBe("2026-12-01");
  });

  it("falls back to the most recent expired membership when there is no active row", () => {
    const result = toSearchResult({
      id: "member-2",
      member_code: "DEF456",
      full_name: "Sara",
      phone: "0101",
      memberships: [
        { status: "expired", end_date: "2026-01-01" },
        { status: "expired", end_date: "2026-03-15" },
      ],
    });
    expect(result.activeMembershipStatus).toBe("expired");
    expect(result.activeMembershipEndDate).toBe("2026-03-15");
  });

  it("returns null status/end date for a member with no membership at all", () => {
    const result = toSearchResult({
      id: "member-3",
      member_code: "GHI789",
      full_name: "Omar",
      phone: "0102",
      memberships: [],
    });
    expect(result.activeMembershipStatus).toBeNull();
    expect(result.activeMembershipEndDate).toBeNull();
  });
});
