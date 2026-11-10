"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ChallengeBranchOption,
  ChallengeListItem,
  ChallengeParticipantRow,
  ChallengeResultRow,
} from "@9thround/challenges";
import { MAX_DISPLAY_NAME_LENGTH, MIN_DISPLAY_NAME_LENGTH } from "@9thround/challenges";
import { getChallengesModule } from "../../../src/lib/composition-root";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { TextField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { PageHeader } from "../../../src/components/ui/page-header";
import { SectionHeader } from "../../../src/components/ui/section-header";
import { EmptyState } from "../../../src/components/ui/empty-state";
import { StatusBadge } from "../../../src/components/ui/status-badge";
import { SkeletonTable } from "../../../src/components/ui/loading-skeleton";
import {
  challengeStatusTone,
  formatDate,
  humanize,
  isRegistrationOpen,
  participantStatusTone,
  resultStatusTone,
  scopeLabel,
} from "../../../src/features/challenges/presentation";

/**
 * The athlete's own view.
 *
 * Three things, in the order they matter: pick a display name (the
 * competition RPCs refuse to register anyone without one), join a
 * competition that is open, then watch your submissions move through
 * review.
 *
 * Results are deliberately read-only here. A result is entered by the
 * athlete's designated coach — submit_challenge_result() checks that the
 * caller IS that coach — so there is no submission form on this page, and
 * adding one would only produce a button the database always refuses.
 */
export default function MyChallengesPage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameNotice, setNameNotice] = useState<string | null>(null);

  const [challenges, setChallenges] = useState<ChallengeListItem[]>([]);
  const [participations, setParticipations] = useState<ChallengeParticipantRow[]>([]);
  const [results, setResults] = useState<ChallengeResultRow[]>([]);
  const [branches, setBranches] = useState<ChallengeBranchOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState<string | null>(null);
  const [busyChallengeId, setBusyChallengeId] = useState<string | null>(null);
  const [branchChoice, setBranchChoice] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const challengesModule = getChallengesModule();
    const [nameResult, listResult, mineResult, resultsResult, branchesResult] = await Promise.all([
      challengesModule.getOwnChallengeDisplayName.execute(),
      challengesModule.listChallenges.execute(),
      challengesModule.listOwnChallengeParticipations.execute(),
      challengesModule.listOwnChallengeResults.execute(),
      challengesModule.listChallengeBranches.execute(),
    ]);

    if (nameResult.isOk) {
      setDisplayName(nameResult.value?.displayName ?? null);
      setNameDraft(nameResult.value?.displayName ?? "");
    }
    if (listResult.isErr) {
      setLoadError(listResult.error.message);
    } else {
      setChallenges(listResult.value);
    }
    if (mineResult.isOk) setParticipations(mineResult.value);
    if (resultsResult.isOk) setResults(resultsResult.value);
    if (branchesResult.isOk) setBranches(branchesResult.value);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const joinedChallengeIds = useMemo(
    () => new Set(participations.map((participation) => participation.challengeId)),
    [participations],
  );

  const openToJoin = useMemo(
    () => challenges.filter((challenge) => isRegistrationOpen(challenge) && !joinedChallengeIds.has(challenge.id)),
    [challenges, joinedChallengeIds],
  );

  const challengeById = useMemo(
    () => new Map(challenges.map((challenge) => [challenge.id, challenge])),
    [challenges],
  );

  /** Only my own results — the approved rows of other athletes are visible to me too, and belong on the standings, not here. */
  const myResults = useMemo(() => {
    const myProfileIds = new Set(participations.map((p) => p.participantProfileId));
    return results.filter((row) => myProfileIds.has(row.participantProfileId));
  }, [results, participations]);

  async function handleSaveName(event: React.FormEvent) {
    event.preventDefault();
    setNameError(null);
    setNameNotice(null);
    setIsSavingName(true);
    const result = await getChallengesModule().setChallengeDisplayName.execute({ displayName: nameDraft });
    setIsSavingName(false);
    if (result.isErr) {
      setNameError(result.error.message);
      return;
    }
    setNameNotice("Display name saved. This is the name other athletes see on the standings.");
    await load();
  }

  async function handleJoin(challenge: ChallengeListItem) {
    setJoinError(null);
    setJoinNotice(null);
    setBusyChallengeId(challenge.id);

    // GLOBAL competitions take no branch; BRANCH/MULTI_BRANCH do. The RPC
    // validates this against the competition's own scope, so a wrong
    // choice is refused rather than quietly accepted.
    const chosen = challenge.scope === "GLOBAL" ? null : (branchChoice[challenge.id] ?? challenge.branchId ?? null);
    if (challenge.scope !== "GLOBAL" && !chosen) {
      setBusyChallengeId(null);
      setJoinError("Choose which branch you are competing for.");
      return;
    }

    const result = await getChallengesModule().requestChallengeParticipation.execute({
      challengeId: challenge.id,
      branchId: chosen,
    });
    setBusyChallengeId(null);

    if (result.isErr) {
      setJoinError(result.error.message);
      return;
    }
    setJoinNotice(
      result.value.status === "approved"
        ? `You are in "${challenge.title}". A coach will be assigned to record your result.`
        : `Your request for "${challenge.title}" was not accepted: ${result.value.eligibilityReason ?? "you are not eligible."}`,
    );
    await load();
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="My competitions" subtitle="Loading…" />
        <Card className="p-5">
          <table className="w-full">
            <tbody>
              {/* SkeletonTable emits bare <tr> rows, so it has to sit
                  inside a table — putting it straight in a <div> is a
                  hydration error. */}
              <SkeletonTable rows={3} columns={3} />
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My competitions" subtitle="Join a competition and follow your results" />

      {/* ---------------- Display name ---------------- */}
      <Card className="p-5">
        <SectionHeader
          title="Your athlete name"
          subtitle={
            displayName
              ? "This is how you appear on the public standings."
              : "Pick a name before you join — competitions require one."
          }
        />
        <form className="mt-4 space-y-3" onSubmit={handleSaveName}>
          <TextField
            label="Display name"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            minLength={MIN_DISPLAY_NAME_LENGTH}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            placeholder="Iron Fist"
            required
          />
          {nameError ? (
            <p className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger" role="alert">
              {nameError}
            </p>
          ) : null}
          {nameNotice ? (
            <p className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm text-success" role="status">
              {nameNotice}
            </p>
          ) : null}
          <Button type="submit" isLoading={isSavingName} disabled={nameDraft.trim() === ""}>
            {displayName ? "Update name" : "Save name"}
          </Button>
        </form>
      </Card>

      {/* ---------------- Open to join ---------------- */}
      <Card className="p-5">
        <SectionHeader title="Open for registration" subtitle={`${openToJoin.length} competition(s) you can join now`} />
        {joinError ? (
          <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger" role="alert">
            {joinError}
          </p>
        ) : null}
        {joinNotice ? (
          <p className="mt-3 rounded-lg border border-success/40 bg-success/5 p-3 text-sm text-success" role="status">
            {joinNotice}
          </p>
        ) : null}
        <div className="mt-4">
          {loadError ? (
            <EmptyState message={loadError} variant="error" actionLabel="Try again" onAction={() => void load()} />
          ) : openToJoin.length === 0 ? (
            <EmptyState message="Nothing is open for registration right now. Check back soon." />
          ) : (
            <ul className="divide-y divide-white/10">
              {openToJoin.map((challenge) => (
                <li key={challenge.id} className="space-y-3 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/my-challenges/${challenge.id}`} className="font-medium text-fg underline">
                        {challenge.title}
                      </Link>
                      <StatusBadge label={humanize(challenge.status)} tone={challengeStatusTone(challenge.status)} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {humanize(challenge.category)} · {scopeLabel(challenge.scope)} · measured in{" "}
                      {challenge.measurementUnit} · registration closes {formatDate(challenge.registrationEndAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    {challenge.scope !== "GLOBAL" ? (
                      <SelectField
                        label="Competing for"
                        value={branchChoice[challenge.id] ?? challenge.branchId ?? ""}
                        onChange={(e) => setBranchChoice((prev) => ({ ...prev, [challenge.id]: e.target.value }))}
                        disabled={challenge.scope === "BRANCH"}
                      >
                        <option value="">Select a branch…</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </SelectField>
                    ) : (
                      <p className="text-xs text-muted">Open to every branch — no branch to choose.</p>
                    )}
                    <Button
                      type="button"
                      isLoading={busyChallengeId === challenge.id}
                      disabled={!displayName}
                      onClick={() => void handleJoin(challenge)}
                    >
                      {displayName ? "Join" : "Set a name first"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ---------------- My participations ---------------- */}
      <Card className="p-5">
        <SectionHeader title="Joined" subtitle={`${participations.length} competition(s)`} />
        <div className="mt-4">
          {participations.length === 0 ? (
            <EmptyState message="You have not joined a competition yet." />
          ) : (
            <ul className="divide-y divide-white/10">
              {participations.map((participation) => {
                const challenge = challengeById.get(participation.challengeId);
                return (
                  <li key={participation.id} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        {challenge ? (
                          <Link href={`/my-challenges/${challenge.id}`} className="font-medium text-fg underline">
                            {challenge.title}
                          </Link>
                        ) : (
                          <span className="font-medium text-fg">Competition</span>
                        )}
                        <StatusBadge
                          label={humanize(participation.status)}
                          tone={participantStatusTone(participation.status)}
                        />
                      </div>
                      <span className="text-xs text-muted">joined {formatDate(participation.requestedAt)}</span>
                    </div>
                    {participation.eligibilityReason ? (
                      <p className="mt-1 text-xs text-muted">{participation.eligibilityReason}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-muted">
                      {participation.designatedCoachId
                        ? "A coach has been assigned to record your result."
                        : "Waiting for a coach to be assigned — your result is recorded by your coach, not by you."}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      {/* ---------------- My results ---------------- */}
      <Card className="p-5">
        <SectionHeader title="My results" subtitle="Entered by your coach, then reviewed" />
        <div className="mt-4">
          {myResults.length === 0 ? (
            <EmptyState message="No results recorded for you yet." />
          ) : (
            <ul className="divide-y divide-white/10">
              {myResults.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <span className="font-medium text-fg">{row.challengeTitle ?? "Competition"}</span>
                    <StatusBadge label={humanize(row.status)} tone={resultStatusTone(row.status)} />
                    {row.supersededByResultId ? (
                      <span className="ml-2 text-xs text-muted">(superseded by a correction)</span>
                    ) : null}
                  </div>
                  <span className="text-sm text-muted">
                    {row.resultValue} {row.measurementUnit} · {formatDate(row.performedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
