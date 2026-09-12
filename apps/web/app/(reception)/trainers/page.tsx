"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrainerPlayer, TrainerSummary } from "@9thround/reception";
import { useAuthStore } from "../../../src/features/auth/store";
import { getReceptionModule } from "../../../src/lib/composition-root";
import { deriveMembershipStatus } from "../../../src/lib/membership-status";
import { Card } from "../../../src/components/ui/card";
import { SelectField } from "../../../src/components/ui/select-field";
import { TextField } from "../../../src/components/ui/text-field";
import { StatCard } from "../../../src/components/ui/stat-card";

type SortMode = "soonest" | "latest" | "name";

function formatDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Trainers (view-only) — reads the existing coach assignment
 * (memberships.coach_id, set at registration/renewal) and the existing
 * membership dates/status. This page creates no new assignment data; the
 * registration/renewal flow remains the only place a coach is assigned.
 */
export default function TrainersPage() {
  const branchId = useAuthStore((state) => state.branchId);

  const [trainers, setTrainers] = useState<TrainerSummary[]>([]);
  const [isLoadingTrainers, setIsLoadingTrainers] = useState(true);
  const [trainersError, setTrainersError] = useState<string | null>(null);

  const [selectedTrainerId, setSelectedTrainerId] = useState<string>("");
  const [players, setPlayers] = useState<TrainerPlayer[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("soonest");

  const loadTrainers = useCallback(async () => {
    if (!branchId) return;
    setIsLoadingTrainers(true);
    setTrainersError(null);
    const result = await getReceptionModule().listTrainers.execute(branchId);
    setIsLoadingTrainers(false);
    if (result.isErr) {
      setTrainersError("Could not load trainers.");
      return;
    }
    setTrainers(result.value);
  }, [branchId]);

  useEffect(() => {
    void loadTrainers();
  }, [loadTrainers]);

  const loadPlayers = useCallback(async () => {
    if (!branchId || !selectedTrainerId) {
      setPlayers([]);
      return;
    }
    setIsLoadingPlayers(true);
    setPlayersError(null);
    const result = await getReceptionModule().listTrainerPlayers.execute({ branchId, trainerId: selectedTrainerId });
    setIsLoadingPlayers(false);
    if (result.isErr) {
      setPlayersError("Could not load this trainer's players.");
      return;
    }
    setPlayers(result.value);
  }, [branchId, selectedTrainerId]);

  useEffect(() => {
    void loadPlayers();
  }, [loadPlayers]);

  useEffect(() => {
    setSearch("");
  }, [selectedTrainerId]);

  const selectedTrainer = trainers.find((t) => t.trainerId === selectedTrainerId) ?? null;

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? players.filter(
          (p) => p.memberFullName.toLowerCase().includes(query) || p.memberCode.toLowerCase().includes(query),
        )
      : players;

    const sorted = [...filtered];
    if (sortMode === "soonest") sorted.sort((a, b) => a.endDate.localeCompare(b.endDate));
    else if (sortMode === "latest") sorted.sort((a, b) => b.endDate.localeCompare(a.endDate));
    else sorted.sort((a, b) => a.memberFullName.localeCompare(b.memberFullName));
    return sorted;
  }, [players, search, sortMode]);

  const summary = useMemo(() => {
    let active = 0;
    let expiringSoon = 0;
    let expired = 0;
    for (const player of players) {
      const status = deriveMembershipStatus(player.status, player.endDate).text;
      if (status === "Expiring Soon") expiringSoon += 1;
      else if (status === "Expired") expired += 1;
      else active += 1;
    }
    return { total: players.length, active, expiringSoon, expired };
  }, [players]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Trainers</h1>

      <Card>
        <SelectField
          label="Select Trainer"
          value={selectedTrainerId}
          onChange={(event) => setSelectedTrainerId(event.target.value)}
        >
          <option value="">— Choose a trainer —</option>
          {trainers.map((trainer) => (
            <option key={trainer.trainerId} value={trainer.trainerId}>
              {trainer.fullName} ({trainer.playerCount} {trainer.playerCount === 1 ? "player" : "players"})
            </option>
          ))}
        </SelectField>
      </Card>

      {!selectedTrainerId ? (
        isLoadingTrainers ? (
          <p className="text-muted">Loading…</p>
        ) : trainersError ? (
          <p className="text-red-400">{trainersError}</p>
        ) : trainers.length === 0 ? (
          <p className="text-muted">No trainers found for this branch.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trainers.map((trainer) => (
              <button
                key={trainer.trainerId}
                type="button"
                onClick={() => setSelectedTrainerId(trainer.trainerId)}
                className="rounded-card border border-white/5 bg-surface p-5 text-left transition-colors hover:border-gold/40"
              >
                <p className="text-lg font-semibold text-ink">{trainer.fullName}</p>
                <p className="mt-1 text-sm text-muted">
                  {trainer.playerCount} {trainer.playerCount === 1 ? "Player" : "Players"}
                </p>
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold text-ink">{selectedTrainer?.fullName ?? "—"}</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Total Players" value={summary.total} />
            <StatCard label="Active" value={summary.active} />
            <StatCard label="Expiring Soon" value={summary.expiringSoon} tone="warning" />
            <StatCard label="Expired" value={summary.expired} tone="warning" />
          </div>

          <Card>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <TextField
                  label="Search"
                  placeholder="Player name or member code"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="sm:w-56">
                <SelectField
                  label="Sort by"
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                >
                  <option value="soonest">Expiring soonest</option>
                  <option value="latest">Latest expiration</option>
                  <option value="name">Player name</option>
                </SelectField>
              </div>
            </div>
          </Card>

          {isLoadingPlayers ? (
            <p className="text-muted">Loading…</p>
          ) : playersError ? (
            <p className="text-red-400">{playersError}</p>
          ) : filteredPlayers.length === 0 ? (
            <p className="text-muted">
              {players.length === 0
                ? "No players are currently assigned to this trainer."
                : "No players match your search."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-white/5">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface text-xs uppercase text-muted">
                  <tr>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Start Date</th>
                    <th className="px-4 py-3">Expiration</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlayers.map((player) => {
                    const status = deriveMembershipStatus(player.status, player.endDate);
                    return (
                      <tr key={player.membershipId} className="border-t border-white/5">
                        <td className="px-4 py-3 text-ink">{player.memberFullName}</td>
                        <td className="px-4 py-3 text-muted">{formatDate(player.startDate)}</td>
                        <td className="px-4 py-3 text-muted">{formatDate(player.endDate)}</td>
                        <td className={`px-4 py-3 font-medium ${status.className}`}>{status.text}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
