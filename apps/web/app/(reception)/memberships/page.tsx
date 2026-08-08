"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { MemberSearchResult, MembershipType } from "@9thround/reception";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { Card } from "../../../src/components/ui/card";
import { TextField } from "../../../src/components/ui/text-field";

/** Memberships (Phase 5) — the membership type catalog (real, configurable data) plus a quick search to jump into a member's record and renew there. */
export default function MembershipsPage() {
  const [types, setTypes] = useState<MembershipType[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(true);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await getReceptionModule().listMembershipTypes.execute();
      setIsLoadingTypes(false);
      if (result.isOk) setTypes(result.value);
    })();
  }, []);

  const runSearch = useCallback(async (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    const result = await getReceptionModule().searchMembers.execute({ query: value });
    setIsSearching(false);
    if (result.isOk) setResults(result.value);
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="mb-4 text-2xl font-semibold text-ink">Membership Types</h1>
        {isLoadingTypes ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((type) => (
              <Card key={type.id}>
                <p className="font-semibold text-ink">{type.name}</p>
                <p className="mt-1 text-sm text-muted">{type.durationDays} days</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-ink">Renew a Membership</h2>
        <TextField
          label="Find a member to renew"
          placeholder="Search by name, phone, or member ID"
          value={query}
          onChange={(event) => void runSearch(event.target.value)}
        />
        {isSearching ? (
          <p className="mt-3 text-muted">Searching…</p>
        ) : results.length > 0 ? (
          <div className="mt-3 space-y-2">
            {results.map((member) => (
              <Link
                key={member.memberId}
                href={`/members/${member.memberId}?action=renew`}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-surface px-4 py-3 hover:border-gold/40"
              >
                <span className="text-sm font-medium text-ink">{member.fullName}</span>
                <span className="text-xs text-muted">{member.phone}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
