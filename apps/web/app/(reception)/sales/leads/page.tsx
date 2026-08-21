"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { LeadSource, LeadStatus, LeadSummary } from "@9thround/sales";
import { useAuthStore } from "../../../../src/features/auth/store";
import { getSalesModule } from "../../../../src/lib/composition-root";
import { translateErrorCode } from "../../../../src/lib/translate-error";
import { Button } from "../../../../src/components/ui/button";
import { Card } from "../../../../src/components/ui/card";
import { TextField } from "../../../../src/components/ui/text-field";
import { SelectField } from "../../../../src/components/ui/select-field";
import { SALES_ROLES } from "../../../../src/lib/staff-roles";

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow-up",
  converted: "Converted",
  lost: "Lost",
};

const STATUS_TONE: Record<LeadStatus, string> = {
  new: "text-gold",
  contacted: "text-ink",
  follow_up: "text-ink",
  converted: "text-green-400",
  lost: "text-red-400",
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  walk_in: "Walk-in",
  phone: "Phone",
  facebook: "Facebook",
  instagram: "Instagram",
  referral: "Referral",
  website: "Website",
  other: "Other",
};

type SortKey = "newest" | "oldest" | "name";
const PAGE_SIZE = 15;

/** Leads (Phase 6) — search/filter/sort/paginate, mirrors the Members list's pattern exactly (packages/reception's ListMembersUseCase / MembersPage). */
export default function LeadsPage() {
  const role = useAuthStore((state) => state.role);

  const [allLeads, setAllLeads] = useState<LeadSummary[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadSummary[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "">("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setIsLoadingAll(true);
    setLoadError(null);
    const result = await getSalesModule().listLeads.execute();
    setIsLoadingAll(false);
    if (result.isErr) {
      setLoadError(translateErrorCode(result.error.code));
      return;
    }
    setAllLeads(result.value);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runSearch = useCallback(async (value: string) => {
    setQuery(value);
    setPage(1);
    if (value.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    const result = await getSalesModule().searchLeads.execute({ query: value });
    setIsSearching(false);
    setHasSearched(true);
    if (result.isOk) setResults(result.value);
  }, []);

  const isFiltering = query.trim().length >= 2;
  let rows = isFiltering ? results : allLeads;
  if (statusFilter) rows = rows.filter((lead) => lead.status === statusFilter);
  if (sourceFilter) rows = rows.filter((lead) => lead.source === sourceFilter);
  rows = [...rows].sort((a, b) => {
    if (sort === "name") return a.fullName.localeCompare(b.fullName);
    if (sort === "oldest") return a.createdAt.getTime() - b.createdAt.getTime();
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!role || !SALES_ROLES.has(role)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <p className="text-ink">Sales is only available to Sales, Branch Manager, and Super Admin accounts.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">Leads</h1>
        <Link href="/sales/leads/new">
          <Button>+ New Lead</Button>
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <TextField
          label="Search"
          placeholder="Search by name or phone"
          value={query}
          onChange={(event) => void runSearch(event.target.value)}
          className="sm:col-span-2"
        />
        <SelectField label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "")}>
          <option value="">All statuses</option>
          {(Object.keys(STATUS_LABEL) as LeadStatus[]).map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </SelectField>
        <SelectField label="Sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name (A–Z)</option>
        </SelectField>
        <SelectField label="Source" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as LeadSource | "")}>
          <option value="">All sources</option>
          {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABEL[source]}
            </option>
          ))}
        </SelectField>
      </div>

      {isFiltering && isSearching ? (
        <p className="text-muted">Searching…</p>
      ) : !isFiltering && isLoadingAll ? (
        <p className="text-muted">Loading…</p>
      ) : loadError ? (
        <p className="text-red-400">{loadError}</p>
      ) : rows.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-card border border-white/5">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Interested In</th>
                  <th className="px-4 py-3">Assigned To</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((lead) => (
                  <tr key={lead.leadId} className="border-t border-white/5 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link href={`/sales/leads/${lead.leadId}`} className="font-medium text-ink hover:text-gold">
                        {lead.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted">{lead.phone}</td>
                    <td className={`px-4 py-3 font-medium ${STATUS_TONE[lead.status]}`}>{STATUS_LABEL[lead.status]}</td>
                    <td className="px-4 py-3 text-muted">{SOURCE_LABEL[lead.source]}</td>
                    <td className="px-4 py-3 text-muted">{lead.interestedMembershipTypeName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{lead.assignedToName ?? "Unassigned"}</td>
                    <td className="px-4 py-3 text-muted">{lead.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 ? (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted">
                Page {currentPage} of {pageCount} — {rows.length} lead{rows.length === 1 ? "" : "s"}
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}>
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
      ) : isFiltering && hasSearched ? (
        <p className="text-muted">No leads found.</p>
      ) : (
        <p className="text-muted">No leads yet — click + New Lead to add the first one.</p>
      )}
    </div>
  );
}
