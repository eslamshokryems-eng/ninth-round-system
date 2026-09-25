"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { MemberSearchResult } from "@9thround/reception";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { translateErrorCode } from "../../../src/lib/translate-error";
import { deriveMembershipStatus } from "../../../src/lib/membership-status";
import { Button } from "../../../src/components/ui/button";
import { TextField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { PageHeader } from "../../../src/components/ui/page-header";
import { FilterBar } from "../../../src/components/ui/filter-bar";
import { EmptyState } from "../../../src/components/ui/empty-state";
import { StatusBadge, membershipStatusTone } from "../../../src/components/ui/status-badge";
import { SkeletonTable } from "../../../src/components/ui/loading-skeleton";

const deriveStatus = deriveMembershipStatus;

const PAGE_SIZE = 15;

type StatusFilter = "all" | "Active" | "Expiring Soon" | "Expired" | "No membership";

const STATUS_FILTER_OPTIONS: StatusFilter[] = ["all", "Active", "Expiring Soon", "Expired", "No membership"];

/** Members (Phase 5) — the full member list by default, live search by name/phone/member ID once you type; real data only. */
export default function MembersPage() {
  const [allMembers, setAllMembers] = useState<MemberSearchResult[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [checkInFeedback, setCheckInFeedback] = useState<{ memberId: string; text: string; isError: boolean } | null>(
    null,
  );
  const [page, setPage] = useState(1);

  const loadAll = useCallback(async () => {
    setIsLoadingAll(true);
    setLoadError(null);
    const result = await getReceptionModule().listMembers.execute();
    setIsLoadingAll(false);
    if (result.isErr) {
      setLoadError(translateErrorCode(result.error.code));
      return;
    }
    setAllMembers(result.value);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const runSearch = useCallback(async (value: string) => {
    setQuery(value);
    setPage(1);
    setSearchError(null);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const result = await getReceptionModule().searchMembers.execute({ query: value });
    setIsSearching(false);
    if (result.isErr) {
      setSearchError(translateErrorCode(result.error.code));
      return;
    }
    setResults(result.value);
  }, []);

  const isFiltering = query.trim().length >= 2;
  const baseRows = isFiltering ? results : allMembers;
  const rows = useMemo(() => {
    if (statusFilter === "all") return baseRows;
    return baseRows.filter(
      (member) => deriveStatus(member.activeMembershipStatus, member.activeMembershipEndDate).text === statusFilter,
    );
  }, [baseRows, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const hasActiveFilters = statusFilter !== "all";

  function clearFilters() {
    setStatusFilter("all");
    setPage(1);
  }

  async function handleCheckIn(memberId: string) {
    setCheckInFeedback(null);
    const result = await getReceptionModule().checkInMember.execute(memberId);
    if (result.isErr) {
      setCheckInFeedback({ memberId, text: translateErrorCode(result.error.code), isError: true });
      return;
    }
    setCheckInFeedback({ memberId, text: "Checked in.", isError: false });
  }

  const isLoading = isFiltering ? isSearching : isLoadingAll;
  const currentError = isFiltering ? searchError : loadError;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Members"
        action={
          <Link href="/members/new">
            <Button>+ Add Member</Button>
          </Link>
        }
      />

      <FilterBar hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
        <TextField
          label="Search"
          placeholder="Search by name, phone, or member ID — or leave blank to see everyone"
          value={query}
          onChange={(event) => void runSearch(event.target.value)}
          className="min-w-[16rem] flex-1"
        />
        <SelectField
          label="Status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as StatusFilter);
            setPage(1);
          }}
          className="w-44"
        >
          {STATUS_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "all" ? "All statuses" : option}
            </option>
          ))}
        </SelectField>
      </FilterBar>

      {currentError ? (
        <EmptyState
          variant="error"
          message={currentError}
          actionLabel="Try Again"
          onAction={() => (isFiltering ? void runSearch(query) : void loadAll())}
        />
      ) : isLoading ? (
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
              <SkeletonTable rows={6} columns={5} />
            </tbody>
          </table>
        </div>
      ) : rows.length > 0 ? (
        <>
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
                {pagedRows.map((member) => {
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
                      <td className="px-4 py-3">
                        <StatusBadge label={status.text} tone={membershipStatusTone(status.text)} />
                      </td>
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
                          <p className={`mt-1 text-xs ${feedback.isError ? "text-danger" : "text-gold"}`}>
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
          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted">
                Page {currentPage} of {pageCount} — {rows.length} member{rows.length === 1 ? "" : "s"}
              </p>
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={currentPage >= pageCount}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : isFiltering || hasActiveFilters ? (
        <EmptyState
          message={hasActiveFilters ? "No members match these filters." : "No members found."}
          actionLabel={hasActiveFilters ? "Clear Filters" : undefined}
          onAction={hasActiveFilters ? clearFilters : undefined}
        />
      ) : (
        <EmptyState message="No members yet — click + Add Member to register the first one." />
      )}
    </div>
  );
}
