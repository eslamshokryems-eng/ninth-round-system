"use client";

import { useCallback, useState } from "react";
import type { StaffCandidate } from "@9thround/identity";
import { getIdentityModule } from "../lib/composition-root";
import { TextField } from "./ui/text-field";

interface StaffPickerProps {
  selected: StaffCandidate | null;
  onSelect: (candidate: StaffCandidate | null) => void;
  /** Narrows results to a single role — e.g. "coach" when assigning a member's coach at registration/renewal. */
  roleFilter?: StaffCandidate["role"];
  label?: string;
}

/** Search-by-name staff picker, reused by the HR Schedule/Payroll tabs and Add Member/Renew's coach assignment (packages/identity's SearchStaffCandidatesUseCase, same one Manage Staff uses). */
export function StaffPicker({ selected, onSelect, roleFilter, label = "Employee" }: StaffPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StaffCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const runSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (value.trim().length < 2) {
        setResults([]);
        return;
      }
      setIsSearching(true);
      const result = await getIdentityModule().searchStaffCandidates.execute({ query: value });
      setIsSearching(false);
      if (result.isOk) {
        setResults(roleFilter ? result.value.filter((c) => c.role === roleFilter) : result.value);
      }
    },
    [roleFilter],
  );

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm">
        <span className="text-ink">
          {selected.fullName ?? "—"} <span className="text-muted capitalize">({selected.role.replace("_", " ")})</span>
        </span>
        <button type="button" onClick={() => onSelect(null)} className="text-xs text-gold hover:text-gold-soft">
          Change
        </button>
      </div>
    );
  }

  return (
    <div>
      <TextField
        label={label}
        placeholder="Search by name"
        value={query}
        onChange={(event) => void runSearch(event.target.value)}
      />
      {isSearching ? (
        <p className="mt-2 text-xs text-muted">Searching…</p>
      ) : results.length > 0 ? (
        <div className="mt-2 space-y-1">
          {results.map((candidate) => (
            <button
              key={candidate.profileId}
              type="button"
              onClick={() => {
                onSelect(candidate);
                setQuery("");
                setResults([]);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-white/[0.06]"
            >
              {candidate.fullName ?? "—"} <span className="text-muted capitalize">({candidate.role.replace("_", " ")})</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
