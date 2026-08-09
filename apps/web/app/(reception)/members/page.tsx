"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { MemberSearchResult } from "@9thround/reception";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { Button } from "../../../src/components/ui/button";
import { TextField } from "../../../src/components/ui/text-field";

function deriveStatus(status: MemberSearchResult["activeMembershipStatus"], endDate: string | null) {
  if (status === null) return { text: "No membership", className: "text-muted" };
  if (status === "expired" || status === "cancelled") return { text: "Expired", className: "text-red-400" };
  if (endDate) {
    const daysLeft = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return { text: "Expiring Soon", className: "text-red-400" };
  }
  return { text: "Active", className: "text-gold" };
}

/** Members (Phase 5) — the full member list by default, live search by name/phone/member ID once you type; real data only. */
export default function MembersPage() {
  const [allMembers, setAllMembers] = useState<MemberSearchResult[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [checkInFeedback, setCheckInFeedback] = useState<{ memberId: string; text: string; isError: boolean } | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembers.execute();
      setIsLoadingAll(false);
      if (result.isOk) setAllMembers(result.value);
    })();
  }, []);

  const runSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    const result = await getReceptionModule().searchMembers.execute({ query: value });
    setIsSearching(false);
    setHasSearched(true);
    if (result.isOk) setResults(result.value);
  }, []);

  const isFiltering = query.trim().length >= 2;
  const rows = isFiltering ? results : allMembers;

  async function handleCheckIn(memberId: string) {
    setCheckInFeedback(null);
    const result = await getReceptionModule().checkInMember.execute(memberId);
    if (result.isErr) {
      setCheckInFeedback({ memberId, text: translateErrorCode(result.error.code), isError: true });
      return;
    }
    setCheckInFeedback({ memberId, text: "Checked in.", isError: false });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Members</h1>
        <Link href="/members/new">
          <Button>+ Add Member</Button>
        </Link>
      </div>

      <TextField
        label="Search"
        placeholder="Search by name, phone, or member ID — or leave blank to see everyone"
        value={query}
        onChange={(event) => void runSearch(event.target.value)}
        className="mb-6"
      />

      {isFiltering && isSearching ? (
        <p className="text-muted">Searching…</p>
      ) : !isFiltering && isLoadingAll ? (
        <p className="text-muted">Loading…</p>
      ) : rows.length > 0 ? (
        <div className="overflow-x-auto rounded-card border border-white/5">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Member ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => {
                const status = deriveStatus(member.activeMembershipStatus, member.activeMembershipEndDate);
                const feedback = checkInFeedback?.memberId === member.memberId ? checkInFeedback : null;
                return (
                  <tr key={member.memberId} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link href={`/members/${member.memberId}`} className="font-medium text-ink hover:text-gold">
                        {member.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{member.phone}</td>
                    <td className="px-4 py-3 text-muted">{member.memberCode}</td>
                    <td className={`px-4 py-3 font-medium ${status.className}`}>{status.text}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => void handleCheckIn(member.memberId)}
                          className="text-xs font-medium text-gold hover:text-gold-soft"
                        >
                          Check In
                        </button>
                        <Link
                          href={`/members/${member.memberId}?action=renew`}
                          className="text-xs font-medium text-gold hover:text-gold-soft"
                        >
                          Renew
                        </Link>
                      </div>
                      {feedback ? (
                        <p className={`mt-1 text-xs ${feedback.isError ? "text-red-400" : "text-gold"}`}>
                          {feedback.text}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : isFiltering && hasSearched ? (
        <p className="text-muted">No members found.</p>
      ) : (
        <p className="text-muted">No members yet — click + Add Member to register the first one.</p>
      )}
    </div>
  );
}
