"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import type { ChallengeSeason } from "@9thround/challenges";
import { useAuthStore } from "../../../../src/features/auth/store";
import { getChallengesModule } from "../../../../src/lib/composition-root";
import { Card } from "../../../../src/components/ui/card";
import { Button } from "../../../../src/components/ui/button";
import { TextField, TextAreaField } from "../../../../src/components/ui/text-field";
import { PageHeader } from "../../../../src/components/ui/page-header";
import { SectionHeader } from "../../../../src/components/ui/section-header";
import { EmptyState } from "../../../../src/components/ui/empty-state";
import { StatusBadge } from "../../../../src/components/ui/status-badge";
import { formatDate, humanize } from "../../../../src/features/challenges/presentation";

/**
 * Competition settings: seasons and the weight range. Super Admin only.
 *
 * This guard only decides what to RENDER. create_challenge_season() and
 * set_challenge_weight_range() each refuse a non-super-admin themselves, so
 * a branch manager or coach who types this URL sees the notice below and,
 * even if they bypassed this page entirely, would be refused by the database.
 */
export default function ChallengeSettingsPage() {
  const role = useAuthStore((state) => state.role);
  const status = useAuthStore((state) => state.status);
  const maySettings = role === "super_admin";

  const [seasons, setSeasons] = useState<ChallengeSeason[]>([]);
  const [range, setRange] = useState<{ min: number; max: number } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [seasonName, setSeasonName] = useState("");
  const [seasonDescription, setSeasonDescription] = useState("");
  const [seasonStart, setSeasonStart] = useState("");
  const [seasonEnd, setSeasonEnd] = useState("");

  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    const module = getChallengesModule();
    const [seasonResult, rangeResult] = await Promise.all([
      module.listChallengeSeasons.execute(),
      module.getChallengeWeightRange.execute(),
    ]);
    if (seasonResult.isOk) setSeasons(seasonResult.value);
    if (rangeResult.isOk) {
      setRange(rangeResult.value);
      setMinWeight(String(rangeResult.value.min));
      setMaxWeight(String(rangeResult.value.max));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (status === "signedIn" && maySettings) void load();
    else if (status === "signedIn") setIsLoading(false);
  }, [status, maySettings, load]);

  async function createSeason(event: FormEvent) {
    event.preventDefault();
    setBusy("season");
    setError(null);
    setNotice(null);
    const result = await getChallengesModule().createChallengeSeason.execute({
      name: seasonName.trim(),
      description: seasonDescription.trim() === "" ? null : seasonDescription.trim(),
      startsAt: seasonStart,
      endsAt: seasonEnd,
    });
    setBusy(null);
    if (result.isErr) {
      setError(result.error.message);
      return;
    }
    setNotice(`Season "${seasonName.trim()}" created.`);
    setSeasonName("");
    setSeasonDescription("");
    setSeasonStart("");
    setSeasonEnd("");
    await load();
  }

  async function saveRange(event: FormEvent) {
    event.preventDefault();
    setBusy("range");
    setError(null);
    setNotice(null);
    const result = await getChallengesModule().setChallengeWeightRange.execute({
      min: Number(minWeight),
      max: Number(maxWeight),
    });
    setBusy(null);
    if (result.isErr) {
      setError(result.error.message);
      return;
    }
    setNotice(`Weight range saved: ${minWeight}–${maxWeight}. Existing competitions keep the weight they were created with.`);
    await load();
  }

  if (status !== "signedIn") return null;

  if (!maySettings) {
    return (
      <div className="space-y-6">
        <PageHeader title="Competition settings" />
        <Card className="p-5" data-testid="settings-denied">
          <EmptyState message="Only a Super Admin can manage seasons and the weight range." />
        </Card>
        <Link href="/challenges" className="text-sm text-gold underline">
          ← Competitions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Competition settings" subtitle="Seasons and the weight range" />
      <Link href="/challenges" className="inline-block text-sm text-gold underline">
        ← Competitions
      </Link>

      {notice ? (
        <Card className="border-success/40 bg-success/5 p-4 text-sm text-success" role="status">
          {notice}
        </Card>
      ) : null}
      {error ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger" role="alert">
          {error}
        </Card>
      ) : null}

      <Card className="p-5">
        <SectionHeader title="Seasons" subtitle="Points and leaderboards never mix across seasons." />
        <div className="mt-4">
          {isLoading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : seasons.length === 0 ? (
            <EmptyState message="No seasons yet. Create the first one below." />
          ) : (
            <ul className="divide-y divide-white/10" data-testid="season-list">
              {seasons.map((season) => (
                <li key={season.seasonId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-fg">{season.name}</span>
                  <span className="text-xs text-muted">
                    {formatDate(season.startsAt)} – {formatDate(season.endsAt)} <StatusBadge label={humanize(season.status)} tone="neutral" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form className="mt-6 space-y-3 border-t border-white/10 pt-4" onSubmit={createSeason}>
          <h3 className="text-sm font-semibold text-fg">New season</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Season name" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} placeholder="Spring 2027" required />
            <div />
            <TextField label="Starts" type="date" value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} required />
            <TextField label="Ends" type="date" value={seasonEnd} onChange={(e) => setSeasonEnd(e.target.value)} required />
          </div>
          <TextAreaField
            label="Description (optional)"
            value={seasonDescription}
            onChange={(e) => setSeasonDescription(e.target.value)}
            placeholder="What this season is for."
          />
          <Button type="submit" isLoading={busy === "season"}>
            Create season
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <SectionHeader
          title="Weight range"
          subtitle={
            range
              ? `A competition's weight must currently be between ${range.min} and ${range.max}. Changing this never rewrites existing competitions.`
              : "A competition's weight must stay inside this range."
          }
        />
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={saveRange}>
          <TextField label="Minimum weight" type="number" value={minWeight} onChange={(e) => setMinWeight(e.target.value)} required />
          <TextField label="Maximum weight" type="number" value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} required />
          <Button type="submit" isLoading={busy === "range"}>
            Save range
          </Button>
        </form>
      </Card>
    </div>
  );
}
