"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ChallengeBranchOption,
  ChallengeCategory,
  ChallengeListItem,
  ChallengeMeasurementType,
  ChallengeScope,
  ChallengeScoringDirection,
  ChallengeSeason,
} from "@9thround/challenges";
import { useAuthStore } from "../../../src/features/auth/store";
import { getChallengesModule } from "../../../src/lib/composition-root";
import { Card } from "../../../src/components/ui/card";
import { Button } from "../../../src/components/ui/button";
import { TextField, TextAreaField } from "../../../src/components/ui/text-field";
import { SelectField } from "../../../src/components/ui/select-field";
import { PageHeader } from "../../../src/components/ui/page-header";
import { SectionHeader } from "../../../src/components/ui/section-header";
import { EmptyState } from "../../../src/components/ui/empty-state";
import { StatusBadge } from "../../../src/components/ui/status-badge";
import { SkeletonTable } from "../../../src/components/ui/loading-skeleton";
import {
  CHALLENGE_CATEGORIES,
  CHALLENGE_MEASUREMENT_TYPES,
  CHALLENGE_SCORING_DIRECTIONS,
  canCreateChallenges,
  challengeStatusTone,
  formatDate,
  humanize,
  scopeLabel,
  toDateTimeLocalValue,
} from "../../../src/features/challenges/presentation";

/**
 * Competitions console.
 *
 * Reads through the Challenges module's own use cases, which are plain
 * selects the row-level policies filter — so this one list is correct for
 * every staff role without the page deciding anything: a coach sees
 * published competitions, a branch manager additionally sees the drafts
 * being built for their branch, a super admin sees everything.
 *
 * Creating is offered only to branch_manager/super_admin because that is
 * what create_challenge() enforces. A branch manager is confined to
 * BRANCH scope in their own branch (also enforced server-side), so the
 * scope picker simply does not offer them the other two.
 */
export default function ChallengesPage() {
  const role = useAuthStore((state) => state.role);
  const branchId = useAuthStore((state) => state.branchId);
  const mayCreate = canCreateChallenges(role);
  const isSuperAdmin = role === "super_admin";

  const [challenges, setChallenges] = useState<ChallengeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [seasons, setSeasons] = useState<ChallengeSeason[]>([]);
  const [branches, setBranches] = useState<ChallengeBranchOption[]>([]);
  const [weightRange, setWeightRange] = useState<{ min: number; max: number }>({ min: 1, max: 15 });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const [form, setForm] = useState(() => {
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const regEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const starts = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const ends = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000);
    return {
      seasonId: "",
      title: "",
      description: "",
      category: "strength" as ChallengeCategory,
      programType: "",
      scope: "BRANCH" as ChallengeScope,
      branchId: "",
      multiBranchIds: [] as string[],
      measurementType: "COUNT" as ChallengeMeasurementType,
      measurementUnit: "reps",
      scoringDirection: "HIGHER_IS_BETTER" as ChallengeScoringDirection,
      weight: "3",
      registrationStartAt: toDateTimeLocalValue(new Date(now.getTime() - 60 * 60 * 1000)),
      registrationEndAt: toDateTimeLocalValue(regEnd),
      startsAt: toDateTimeLocalValue(starts),
      endsAt: toDateTimeLocalValue(ends),
      minAge: "",
      maxAge: "",
      _unusedStart: start,
    };
  });

  const loadChallenges = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await getChallengesModule().listChallenges.execute();
    if (result.isErr) {
      setLoadError(result.error.message);
      setChallenges([]);
    } else {
      setChallenges(result.value);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadChallenges();
  }, [loadChallenges]);

  // Form reference data. Loaded only for the roles that can actually
  // create, so a coach's page makes no pointless requests.
  useEffect(() => {
    if (!mayCreate) return;
    const challengesModule = getChallengesModule();
    void (async () => {
      const [seasonsResult, branchesResult, weightResult] = await Promise.all([
        challengesModule.listChallengeSeasons.execute(),
        challengesModule.listChallengeBranches.execute(),
        challengesModule.getChallengeWeightRange.execute(),
      ]);
      if (seasonsResult.isOk) setSeasons(seasonsResult.value);
      if (branchesResult.isOk) setBranches(branchesResult.value);
      if (weightResult.isOk) setWeightRange(weightResult.value);
    })();
  }, [mayCreate]);

  // A branch manager may only build for their own branch; prefill it so the
  // field cannot be left to chance.
  useEffect(() => {
    if (!isSuperAdmin && branchId) {
      setForm((previous) => (previous.branchId === "" ? { ...previous, branchId } : previous));
    }
  }, [isSuperAdmin, branchId]);

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!form.seasonId) {
      setFormError("Choose a season first. If the list is empty, a Super Admin needs to create one.");
      return;
    }
    if (form.title.trim().length < 3) {
      setFormError("Give the competition a title of at least 3 characters.");
      return;
    }
    if (form.scope === "BRANCH" && !form.branchId) {
      setFormError("A single-branch competition needs a branch.");
      return;
    }
    if (form.scope === "MULTI_BRANCH" && form.multiBranchIds.length === 0) {
      setFormError("Select at least one branch for a multi-branch competition.");
      return;
    }

    const weight = Number(form.weight);
    if (!Number.isFinite(weight) || weight < weightRange.min || weight > weightRange.max) {
      setFormError(`Weight must be between ${weightRange.min} and ${weightRange.max}.`);
      return;
    }

    const eligibilityRules: { ruleType: "min_age" | "max_age"; value: Record<string, unknown> }[] = [];
    if (form.minAge.trim() !== "") eligibilityRules.push({ ruleType: "min_age", value: { age: Number(form.minAge) } });
    if (form.maxAge.trim() !== "") eligibilityRules.push({ ruleType: "max_age", value: { age: Number(form.maxAge) } });

    setIsSaving(true);
    const result = await getChallengesModule().createChallenge.execute({
      seasonId: form.seasonId,
      title: form.title.trim(),
      description: form.description.trim() === "" ? null : form.description.trim(),
      category: form.category,
      programType: form.programType === "" ? null : (form.programType as "ninth_round" | "boxing" | "kickboxing" | "mma"),
      scope: form.scope,
      branchId: form.scope === "BRANCH" ? form.branchId : null,
      branchIds: form.scope === "MULTI_BRANCH" ? form.multiBranchIds : null,
      measurementType: form.measurementType,
      measurementUnit: form.measurementUnit.trim(),
      scoringDirection: form.scoringDirection,
      weight,
      registrationStartAt: new Date(form.registrationStartAt).toISOString(),
      registrationEndAt: new Date(form.registrationEndAt).toISOString(),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
      eligibilityRules,
      weightRange,
    });
    setIsSaving(false);

    if (result.isErr) {
      setFormError(result.error.message);
      return;
    }
    setSuccessMessage(`"${form.title.trim()}" created. It starts as a draft — publish it when you are ready.`);
    setIsFormOpen(false);
    update("title", "");
    update("description", "");
    await loadChallenges();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competitions"
        subtitle="Challenges, participants and result review"
        action={
          mayCreate ? (
            <div className="flex items-center gap-3">
              {isSuperAdmin ? (
                <Link href="/challenges/settings" className="text-sm text-gold underline">
                  Seasons &amp; weight range
                </Link>
              ) : null}
              <Button onClick={() => setIsFormOpen((open) => !open)} variant={isFormOpen ? "secondary" : "primary"}>
                {isFormOpen ? "Cancel" : "New competition"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {successMessage ? (
        <Card className="border-success/40 bg-success/5 p-4 text-sm text-success" role="status">
          {successMessage}
        </Card>
      ) : null}

      {isFormOpen && mayCreate ? (
        <Card className="p-5">
          <SectionHeader
            title="New competition"
            subtitle={
              isSuperAdmin
                ? "A Super Admin can create any scope, including all-branch competitions."
                : "A Branch Manager creates single-branch competitions for their own branch."
            }
          />
          <form className="mt-4 space-y-4" onSubmit={handleCreate}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Season" value={form.seasonId} onChange={(e) => update("seasonId", e.target.value)} required>
                <option value="">Select a season…</option>
                {seasons.map((season) => (
                  <option key={season.seasonId} value={season.seasonId}>
                    {season.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label="Title"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="Push-Up Challenge"
                required
              />
            </div>

            <TextAreaField
              label="Description (optional)"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={2}
              placeholder="What athletes need to know before joining."
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Category" value={form.category} onChange={(e) => update("category", e.target.value as ChallengeCategory)}>
                {CHALLENGE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {humanize(category)}
                  </option>
                ))}
              </SelectField>
              <SelectField label="Program (optional)" value={form.programType} onChange={(e) => update("programType", e.target.value)}>
                <option value="">Any program</option>
                <option value="ninth_round">Ninth Round</option>
                <option value="boxing">Boxing</option>
                <option value="kickboxing">Kickboxing</option>
                <option value="mma">MMA</option>
              </SelectField>
              <SelectField
                label="Scope"
                value={form.scope}
                onChange={(e) => update("scope", e.target.value as ChallengeScope)}
                disabled={!isSuperAdmin}
              >
                <option value="BRANCH">Single branch</option>
                {isSuperAdmin ? <option value="GLOBAL">All branches</option> : null}
                {isSuperAdmin ? <option value="MULTI_BRANCH">Selected branches</option> : null}
              </SelectField>
            </div>

            {form.scope === "BRANCH" ? (
              <SelectField
                label="Branch"
                value={form.branchId}
                onChange={(e) => update("branchId", e.target.value)}
                disabled={!isSuperAdmin}
                required
              >
                <option value="">Select a branch…</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </SelectField>
            ) : null}

            {form.scope === "MULTI_BRANCH" ? (
              <fieldset className="rounded-lg border border-white/10 p-3">
                <legend className="px-1 text-xs uppercase tracking-wide text-muted">Branches</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {branches.map((branch) => (
                    <label key={branch.id} className="flex items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={form.multiBranchIds.includes(branch.id)}
                        onChange={(e) =>
                          update(
                            "multiBranchIds",
                            e.target.checked
                              ? [...form.multiBranchIds, branch.id]
                              : form.multiBranchIds.filter((id) => id !== branch.id),
                          )
                        }
                      />
                      {branch.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-4">
              <SelectField
                label="Measurement"
                value={form.measurementType}
                onChange={(e) => update("measurementType", e.target.value as ChallengeMeasurementType)}
              >
                {CHALLENGE_MEASUREMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </SelectField>
              <TextField label="Unit" value={form.measurementUnit} onChange={(e) => update("measurementUnit", e.target.value)} placeholder="reps" required />
              <SelectField
                label="Best score"
                value={form.scoringDirection}
                onChange={(e) => update("scoringDirection", e.target.value as ChallengeScoringDirection)}
              >
                {CHALLENGE_SCORING_DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {direction === "HIGHER_IS_BETTER" ? "Higher is better" : "Lower is better"}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={`Weight (${weightRange.min}–${weightRange.max})`}
                type="number"
                min={weightRange.min}
                max={weightRange.max}
                value={form.weight}
                onChange={(e) => update("weight", e.target.value)}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Registration opens"
                type="datetime-local"
                value={form.registrationStartAt}
                onChange={(e) => update("registrationStartAt", e.target.value)}
                required
              />
              <TextField
                label="Registration closes"
                type="datetime-local"
                value={form.registrationEndAt}
                onChange={(e) => update("registrationEndAt", e.target.value)}
                required
              />
              <TextField label="Starts" type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} required />
              <TextField label="Ends" type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Minimum age (optional)"
                type="number"
                min={1}
                value={form.minAge}
                onChange={(e) => update("minAge", e.target.value)}
                placeholder="18"
              />
              <TextField
                label="Maximum age (optional)"
                type="number"
                min={1}
                value={form.maxAge}
                onChange={(e) => update("maxAge", e.target.value)}
                placeholder="45"
              />
            </div>

            {formError ? (
              <p className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger" role="alert">
                {formError}
              </p>
            ) : null}

            <div className="flex gap-3">
              <Button type="submit" isLoading={isSaving}>
                Create competition
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="p-5">
        <SectionHeader title="All competitions" subtitle={`${challenges.length} visible to you`} />
        <div className="mt-4">
          {isLoading ? (
            <table className="w-full">
              <tbody>
                {/* SkeletonTable emits bare <tr> rows, so it has to sit
                    inside a table — putting it straight in a <div> is a
                    hydration error. */}
                <SkeletonTable rows={4} columns={5} />
              </tbody>
            </table>
          ) : loadError ? (
            <EmptyState message={loadError} variant="error" actionLabel="Try again" onAction={() => void loadChallenges()} />
          ) : challenges.length === 0 ? (
            <EmptyState
              message={
                mayCreate
                  ? "No competitions yet. Create the first one to get started."
                  : "No competitions have been published yet."
              }
            />
          ) : (
            <ul className="divide-y divide-white/10">
              {challenges.map((challenge) => (
                <li key={challenge.id} className="py-3">
                  <Link
                    href={`/challenges/${challenge.id}`}
                    className="flex flex-col gap-2 rounded-lg px-2 py-2 hover:bg-white/[0.04] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-fg">{challenge.title}</span>
                        <StatusBadge label={humanize(challenge.status)} tone={challengeStatusTone(challenge.status)} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {humanize(challenge.category)} · {scopeLabel(challenge.scope)} · {challenge.measurementUnit} ·
                        weight {challenge.weight}
                      </p>
                    </div>
                    <div className="shrink-0 text-xs text-muted sm:text-right">
                      <div>
                        {formatDate(challenge.startsAt)} – {formatDate(challenge.endsAt)}
                      </div>
                      <div>Registration closes {formatDate(challenge.registrationEndAt)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
