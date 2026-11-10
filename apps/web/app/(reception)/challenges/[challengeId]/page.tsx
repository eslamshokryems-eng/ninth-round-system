"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type {
  ChallengeDetail,
  ChallengeLeaderboardEntry,
  ChallengeParticipantRow,
  ChallengeResultRow, ChallengeResultReviewRow } from "@9thround/challenges";
import type { TrainerSummary } from "@9thround/reception";
import { useAuthStore } from "../../../../src/features/auth/store";
import { getChallengesModule, getReceptionModule } from "../../../../src/lib/composition-root";
import { Card } from "../../../../src/components/ui/card";
import { Button } from "../../../../src/components/ui/button";
import { TextField } from "../../../../src/components/ui/text-field";
import { SelectField } from "../../../../src/components/ui/select-field";
import { PageHeader } from "../../../../src/components/ui/page-header";
import { SectionHeader } from "../../../../src/components/ui/section-header";
import { EmptyState } from "../../../../src/components/ui/empty-state";
import { StatusBadge } from "../../../../src/components/ui/status-badge";
import { SkeletonTable } from "../../../../src/components/ui/loading-skeleton";
import {
  canDesignateCoach,
  canManageChallengeLifecycle,
  challengeStatusActionLabel,
  challengeStatusNeedsConfirmation,
  nextChallengeStatus,
  canReviewResults,
  challengeStatusTone,
  formatDate,
  formatDateTime,
  humanize,
  participantStatusTone,
  resultStatusTone,
  scopeLabel,
  toDateTimeLocalValue,
} from "../../../../src/features/challenges/presentation";

/**
 * One competition: its rules, its roster, the review desk and the
 * standings.
 *
 * Every action here calls the module's use case, which calls the RPC that
 * owns the rule — this page never decides whether something is allowed,
 * it only avoids offering buttons the server would certainly refuse, and
 * surfaces the server's own message when it does refuse. That is why a
 * failed action shows the database's wording rather than a generic
 * "something went wrong".
 */
export default function ChallengeDetailPage() {
  const params = useParams<{ challengeId: string }>();
  const challengeId = params?.challengeId ?? "";
  const role = useAuthStore((state) => state.role);
  const profileId = useAuthStore((state) => state.profileId);
  const branchId = useAuthStore((state) => state.branchId);

  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [participants, setParticipants] = useState<ChallengeParticipantRow[]>([]);
  const [results, setResults] = useState<ChallengeResultRow[]>([]);
  const [reviews, setReviews] = useState<ChallengeResultReviewRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<ChallengeLeaderboardEntry[]>([]);
  const [coaches, setCoaches] = useState<TrainerSummary[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const mayReview = canReviewResults(role, detail?.scope ?? "BRANCH");
  const mayDesignate = canDesignateCoach(role);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [statusReason, setStatusReason] = useState("");

  const load = useCallback(async () => {
    if (!challengeId) return;
    setIsLoading(true);
    setLoadError(null);
    const challengesModule = getChallengesModule();
    const [detailResult, participantsResult, resultsResult, leaderboardResult, reviewsResult] = await Promise.all([
      challengesModule.getChallengeDetail.execute(challengeId),
      challengesModule.listChallengeParticipants.execute(challengeId),
      challengesModule.listChallengeResults.execute(challengeId),
      challengesModule.getChallengeLeaderboard.execute(challengeId),
      challengesModule.listChallengeResultReviews.execute(challengeId),
    ]);

    if (detailResult.isErr) {
      setLoadError(detailResult.error.message);
      setIsLoading(false);
      return;
    }
    setDetail(detailResult.value);
    setParticipants(participantsResult.isOk ? participantsResult.value : []);
    setResults(resultsResult.isOk ? resultsResult.value : []);
    setReviews(reviewsResult.isOk ? reviewsResult.value : []);
    setLeaderboard(leaderboardResult.isOk ? leaderboardResult.value : []);
    setIsLoading(false);
  }, [challengeId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Coach options for designation come from the existing Reception trainers
  // read (coaches at a branch) — no second source of coach data.
  useEffect(() => {
    if (!mayDesignate) return;
    const targetBranch = detail?.branchId ?? branchId;
    if (!targetBranch) return;
    void (async () => {
      const result = await getReceptionModule().listTrainers.execute(targetBranch);
      if (result.isOk) setCoaches(result.value);
    })();
  }, [mayDesignate, detail?.branchId, branchId]);

  const pendingResults = useMemo(() => results.filter((r) => r.status === "pending"), [results]);
  const pendingCorrections = useMemo(() => results.filter((r) => r.status === "correction_pending"), [results]);

  async function run(key: string, action: () => Promise<{ isErr: boolean; error?: { message: string } }>, successText: string) {
    setBusyKey(key);
    setActionError(null);
    setActionNotice(null);
    const result = await action();
    setBusyKey(null);
    if (result.isErr) {
      setActionError(result.error?.message ?? "The action was refused.");
      return;
    }
    setActionNotice(successText);
    await load();
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Competition" subtitle="Loading…" />
        <Card className="p-5">
          <table className="w-full">
            <tbody>
              {/* SkeletonTable emits bare <tr> rows, so it has to sit
                  inside a table — putting it straight in a <div> is a
                  hydration error. */}
              <SkeletonTable rows={5} columns={4} />
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Competition" />
        <Card className="p-5">
          <EmptyState message={loadError} variant="error" actionLabel="Try again" onAction={() => void load()} />
        </Card>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-6">
        <PageHeader title="Competition" />
        <Card className="p-5">
          <EmptyState message="This competition does not exist, or it is a draft you do not have access to." />
        </Card>
        <Link href="/challenges" className="text-sm text-gold underline">
          Back to competitions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={detail.title}
        subtitle={`${humanize(detail.category)} · ${scopeLabel(detail.scope)}`}
        action={<StatusBadge label={humanize(detail.status)} tone={challengeStatusTone(detail.status)} />}
      />

      <Link href="/challenges" className="inline-block text-sm text-gold underline">
        ← All competitions
      </Link>

      {actionNotice ? (
        <Card className="border-success/40 bg-success/5 p-4 text-sm text-success" role="status">
          {actionNotice}
        </Card>
      ) : null}
      {actionError ? (
        <Card className="border-danger/40 bg-danger/5 p-4 text-sm text-danger" role="alert">
          {actionError}
        </Card>
      ) : null}

      {/* ---------------- Lifecycle ---------------- */}
      {detail && canManageChallengeLifecycle(role, detail, branchId) && nextChallengeStatus(detail.status) ? (
        (() => {
          const next = nextChallengeStatus(detail.status)!;
          const needsConfirm = challengeStatusNeedsConfirmation(next);
          return (
            <Card className="p-5" data-testid="lifecycle-card">
              <SectionHeader
                title="Lifecycle"
                subtitle={`Currently ${humanize(detail.status)}. The next step is ${humanize(next)}; a competition only moves forward, one step at a time.`}
              />
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-muted">
                  Note (optional)
                  <input
                    className="rounded-md border border-white/10 bg-bg px-3 py-2 text-sm text-fg"
                    value={statusReason}
                    onChange={(event) => setStatusReason(event.target.value)}
                    placeholder="Why now? Recorded in the audit log."
                  />
                </label>
                {needsConfirm && !confirmingStatus ? (
                  <Button onClick={() => setConfirmingStatus(true)}>{challengeStatusActionLabel(next)}</Button>
                ) : (
                  <>
                    <Button
                      isLoading={busyKey === "status"}
                      onClick={() =>
                        void run(
                          "status",
                          () =>
                            getChallengesModule().setChallengeStatus.execute({
                              challengeId: detail.id,
                              currentStatus: detail.status,
                              nextStatus: next,
                              reason: statusReason,
                            }),
                          `Competition is now ${humanize(next)}.`,
                        ).then(() => {
                          setConfirmingStatus(false);
                          setStatusReason("");
                        })
                      }
                    >
                      {needsConfirm ? `Confirm: ${challengeStatusActionLabel(next)}` : challengeStatusActionLabel(next)}
                    </Button>
                    {needsConfirm ? (
                      <Button variant="ghost" onClick={() => setConfirmingStatus(false)}>
                        Cancel
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
              {needsConfirm ? (
                <p className="mt-3 text-xs text-muted">
                  {next === "active" && "Starting the competition closes registration and lets coaches record results."}
                  {next === "completed" && "Completing the competition finalises the standings and recomputes every athlete's points. It cannot be reopened."}
                  {next === "archived" && "Archiving is final and removes the competition from the active lists."}
                </p>
              ) : null}
            </Card>
          );
        })()
      ) : null}

      {/* ---------------- Eligibility rules (before registration only) ---------------- */}
      {detail && canManageChallengeLifecycle(role, detail, branchId) && (detail.status === "draft" || detail.status === "published") ? (
        <EligibilityRulesCard
          rules={detail.eligibilityRules}
          busyKey={busyKey}
          onAdd={(ruleType, age) => {
            const other = detail.eligibilityRules.find((r) => r.ruleType !== ruleType);
            const otherAge = other && typeof other.value.age === "number" ? other.value.age : null;
            return run(
              "rule-add",
              () => getChallengesModule().addChallengeEligibilityRule.execute({ challengeId: detail.id, ruleType, age, otherAge }),
              "Eligibility rule added.",
            );
          }}
          onRemove={(ruleId) =>
            run(`rule-remove-${ruleId}`, () => getChallengesModule().removeChallengeEligibilityRule.execute(ruleId), "Eligibility rule removed.")
          }
        />
      ) : null}

      {/* ---------------- Rules & dates ---------------- */}
      <Card className="p-5">
        <SectionHeader title="Details" />
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Measurement</dt>
            <dd className="text-fg">
              {humanize(detail.measurementType)} in {detail.measurementUnit} ·{" "}
              {detail.scoringDirection === "HIGHER_IS_BETTER" ? "higher is better" : "lower is better"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Weight</dt>
            <dd className="text-fg">{detail.weight}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Registration</dt>
            <dd className="text-fg">
              {formatDate(detail.registrationStartAt)} – {formatDate(detail.registrationEndAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Runs</dt>
            <dd className="text-fg">
              {formatDate(detail.startsAt)} – {formatDate(detail.endsAt)}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted">Eligibility</dt>
            <dd className="text-fg">
              {detail.eligibilityRules.length === 0
                ? "Open to everyone"
                : detail.eligibilityRules
                    .map((rule) => `${humanize(rule.ruleType)}: ${String((rule.value as { age?: number }).age ?? "—")}`)
                    .join(" · ")}
            </dd>
          </div>
        </dl>
        {detail.description ? <p className="mt-4 text-sm text-muted">{detail.description}</p> : null}
      </Card>

      {/* ---------------- Review desk ---------------- */}
      <Card className="p-5">
        <SectionHeader
          title="Review desk"
          subtitle={
            mayReview
              ? `${pendingResults.length} result(s) and ${pendingCorrections.length} correction(s) awaiting a decision`
              : detail.scope === "GLOBAL"
                ? "Only a Branch Manager or Super Admin may review results in an all-branch competition."
                : "Your role cannot review results."
          }
        />
        <div className="mt-4 space-y-3">
          {pendingResults.length === 0 && pendingCorrections.length === 0 ? (
            <EmptyState message="Nothing is awaiting review." />
          ) : (
            [...pendingResults, ...pendingCorrections].map((row) => {
              const isCorrection = row.status === "correction_pending";
              const isOwnSubmission = row.enteredByProfileId === profileId;
              return (
                <div key={row.id} className="rounded-lg border border-white/10 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-fg">{row.displayName ?? "Unnamed athlete"}</span>
                      <span className="ml-2 text-sm text-muted">
                        {row.resultValue} {row.measurementUnit}
                      </span>
                      <StatusBadge label={humanize(row.status)} tone={resultStatusTone(row.status)} />
                      {row.correctsResultId === null && results.some((r) => r.participantProfileId === row.participantProfileId && r.correctsResultId === null && r.status === "rejected") ? (
                        <span className="ml-2 text-xs text-warning" data-testid="resubmission-tag">Resubmitted after a rejection</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted">{formatDateTime(row.performedAt)}</span>
                  </div>

                  {isOwnSubmission ? (
                    <p className="mt-2 text-xs text-warning">
                      You submitted this result, so you cannot review it — someone else must decide.
                    </p>
                  ) : mayReview ? (
                    <ReviewControls
                      busyKey={busyKey}
                      resultId={row.id}
                      isCorrection={isCorrection}
                      onApprove={(notes) =>
                        run(
                          `approve-${row.id}`,
                          () =>
                            isCorrection
                              ? getChallengesModule().approveChallengeResultCorrection.execute({
                                  resultId: row.id,
                                  notes,
                                  reviewerProfileId: profileId ?? "",
                                  correctionRequestedByProfileId: row.enteredByProfileId,
                                })
                              : getChallengesModule().approveChallengeResult.execute({
                                  resultId: row.id,
                                  notes,
                                  reviewerProfileId: profileId ?? "",
                                  resultAuthorProfileId: row.enteredByProfileId,
                                }),
                          "Approved. Points and standings were recomputed.",
                        )
                      }
                      onReject={(notes) =>
                        run(
                          `reject-${row.id}`,
                          () =>
                            isCorrection
                              ? getChallengesModule().rejectChallengeResultCorrection.execute({
                                  resultId: row.id,
                                  notes,
                                  reviewerProfileId: profileId ?? "",
                                  correctionRequestedByProfileId: row.enteredByProfileId,
                                })
                              : getChallengesModule().rejectChallengeResult.execute({
                                  resultId: row.id,
                                  notes,
                                  reviewerProfileId: profileId ?? "",
                                  resultAuthorProfileId: row.enteredByProfileId,
                                }),
                          "Rejected. The reason was recorded.",
                        )
                      }
                    />
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* ---------------- Roster ---------------- */}
      <Card className="p-5">
        <SectionHeader title="Participants" subtitle={`${participants.length} on the roster`} />
        <div className="mt-4">
          {participants.length === 0 ? (
            <EmptyState message="Nobody has joined yet." />
          ) : (
            <ul className="divide-y divide-white/10">
              {participants.map((participant) => (
                <li key={participant.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-fg">{participant.displayName ?? "No display name yet"}</span>
                      <StatusBadge label={humanize(participant.status)} tone={participantStatusTone(participant.status)} />
                      {participant.eligibilityReason ? (
                        <p className="mt-1 text-xs text-muted">{participant.eligibilityReason}</p>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted">joined {formatDate(participant.requestedAt)}</span>
                  </div>

                  {participant.status === "approved" ? (
                    <ParticipantCoachRow
                      designatedToViewer={participant.designatedCoachId === profileId}
                      resultState={resultStateFor(participant.participantProfileId, results, reviews)}
                      participant={participant}
                      coaches={coaches}
                      mayDesignate={mayDesignate}
                      busyKey={busyKey}
                      onDesignate={(coachId, reason) =>
                        run(
                          `designate-${participant.id}`,
                          () =>
                            getChallengesModule().designateChallengeCoach.execute({
                              participantId: participant.id,
                              coachId,
                              reason,
                            }),
                          "Coach designated. The reason was recorded in the audit log.",
                        )
                      }
                      canSubmitForThem={role === "coach" && participant.designatedCoachId === profileId && resultStateFor(participant.participantProfileId, results, reviews).kind !== "live"}
                      onSubmitResult={(value, unit, performedAt) =>
                        run(
                          `submit-${participant.id}`,
                          () =>
                            getChallengesModule().submitChallengeResult.execute({
                              challengeId: detail.id,
                              participantProfileId: participant.participantProfileId,
                              resultValue: value,
                              measurementUnit: unit,
                              performedAt,
                              enteredByProfileId: profileId ?? "",
                              designatedCoachId: participant.designatedCoachId,
                            }),
                          "Result submitted. It is now awaiting review.",
                        )
                      }
                      measurementUnit={detail.measurementUnit}
                    />
                  ) : null}

                  {role === "coach" && participant.designatedCoachId === profileId
                    ? (() => {
                        const current = results.find(
                          (r) => r.participantProfileId === participant.participantProfileId && r.status === "approved" && r.supersededByResultId === null,
                        );
                        const pending = results.find(
                          (r) => r.participantProfileId === participant.participantProfileId && r.status === "correction_pending",
                        );
                        const pendingOriginal = results.find(
                          (r) => r.participantProfileId === participant.participantProfileId && r.status === "pending" && r.correctsResultId === null,
                        );
                        if (pendingOriginal) {
                          return (
                            <p className="mt-2 text-xs text-warning" data-testid="result-pending-note">
                              Your result of {pendingOriginal.resultValue} {pendingOriginal.measurementUnit} is awaiting review.
                            </p>
                          );
                        }
                        if (pending) {
                          return (
                            <p className="mt-2 text-xs text-warning" data-testid="correction-pending-note">
                              A correction to {pending.resultValue} {pending.measurementUnit} is awaiting review.
                            </p>
                          );
                        }
                        if (!current) return null;
                        return (
                          <CorrectionRequest
                            current={current}
                            busy={busyKey === `correct-${current.id}`}
                            onRequest={(value, performedAt) =>
                              run(
                                `correct-${current.id}`,
                                () =>
                                  getChallengesModule().requestChallengeResultCorrection.execute({
                                    correctsResultId: current.id,
                                    resultValue: value,
                                    measurementUnit: current.measurementUnit,
                                    performedAt,
                                    requestedByProfileId: profileId ?? "",
                                    designatedCoachId: participant.designatedCoachId,
                                  }),
                                "Correction requested. It replaces the current result only if someone else approves it.",
                              )
                            }
                          />
                        );
                      })()
                    : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* ---------------- Standings ---------------- */}
      <Card className="p-5">
        <SectionHeader title="Standings" subtitle="Approved results only, ranked" />
        <div className="mt-4">
          {leaderboard.length === 0 ? (
            <EmptyState message="No approved results yet, so there is nothing to rank." />
          ) : (
            <ol className="divide-y divide-white/10">
              {leaderboard.map((entry) => (
                <li key={entry.resultId} className="flex items-center justify-between py-2">
                  <span className="flex items-center gap-3">
                    <span className="w-8 text-right font-mono text-gold">{entry.overallRank}</span>
                    <span className="text-fg">{entry.displayName}</span>
                  </span>
                  <span className="text-sm text-muted">
                    {entry.resultValue} {detail.measurementUnit}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Approve/reject with the notes field the reject path requires. */
function ReviewControls({
  resultId,
  isCorrection,
  busyKey,
  onApprove,
  onReject,
}: {
  resultId: string;
  isCorrection: boolean;
  busyKey: string | null;
  onApprove: (notes: string | null) => void;
  onReject: (notes: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const approveBusy = busyKey === `approve-${resultId}`;
  const rejectBusy = busyKey === `reject-${resultId}`;

  return (
    <div className="mt-3 space-y-2">
      <TextField
        id={`review-note-${resultId}`}
        label={isCorrection ? "Review note (required to reject a correction)" : "Review note (required to reject)"}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Why are you rejecting this?"
      />
      <div className="flex gap-2">
        <Button type="button" isLoading={approveBusy} onClick={() => onApprove(notes.trim() === "" ? null : notes.trim())}>
          Approve
        </Button>
        <Button
          type="button"
          variant="danger"
          isLoading={rejectBusy}
          disabled={notes.trim() === ""}
          onClick={() => onReject(notes.trim())}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

/** Coach designation plus, for that coach only, the result-submission form. */
function ParticipantCoachRow({
  designatedToViewer,
  resultState,
  participant,
  coaches,
  mayDesignate,
  busyKey,
  onDesignate,
  canSubmitForThem,
  onSubmitResult,
  measurementUnit,
}: {
  /** True when the signed-in user is this athlete's designated coach (so we can say "you" instead of showing an id). */
  designatedToViewer: boolean;
  resultState: ResultState;
  participant: ChallengeParticipantRow;
  coaches: TrainerSummary[];
  mayDesignate: boolean;
  busyKey: string | null;
  onDesignate: (coachId: string, reason: string) => void;
  canSubmitForThem: boolean;
  onSubmitResult: (value: number, unit: string, performedAt: string) => void;
  measurementUnit: string;
}) {
  const [coachId, setCoachId] = useState(participant.designatedCoachId ?? "");
  const [reason, setReason] = useState("");
  const [value, setValue] = useState("");
  const [performedAt, setPerformedAt] = useState(() => toDateTimeLocalValue(new Date()));

  const designateBusy = busyKey === `designate-${participant.id}`;
  const submitBusy = busyKey === `submit-${participant.id}`;
  const coachName = coaches.find((coach) => coach.trainerId === participant.designatedCoachId)?.fullName;

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-white/[0.02] p-3">
      <p className="text-xs text-muted">
        Coach:{" "}
        {participant.designatedCoachId ? (
          <span className="text-fg">{coachName ?? (designatedToViewer ? "you" : "an assigned coach")}</span>
        ) : (
          <span className="text-warning">not designated yet — results cannot be submitted until one is</span>
        )}
      </p>

      {mayDesignate ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <SelectField id={`designate-${participant.id}`} label="Designate coach" value={coachId} onChange={(e) => setCoachId(e.target.value)}>
            <option value="">Select a coach…</option>
            {coaches.map((coach) => (
              <option key={coach.trainerId} value={coach.trainerId}>
                {coach.fullName}
              </option>
            ))}
          </SelectField>
          <TextField
            id={`designate-reason-${participant.id}`}
            label="Reason (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Assigning this athlete's coach."
          />
          <Button
            type="button"
            isLoading={designateBusy}
            disabled={coachId === "" || reason.trim() === ""}
            onClick={() => onDesignate(coachId, reason.trim())}
          >
            Save
          </Button>
        </div>
      ) : null}

      {canSubmitForThem && resultState.kind === "rejected" ? (
        <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm" data-testid="rejection-note">
          <p className="text-danger">
            Your result of {resultState.value} {measurementUnit} was rejected
            {resultState.notes ? <>: <span className="text-fg">“{resultState.notes}”</span></> : "."}
          </p>
          <p className="mt-1 text-xs text-muted">Submit a corrected result below. The rejected one stays on record.</p>
        </div>
      ) : null}

      {canSubmitForThem ? (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField
            id={`result-value-${participant.id}`}
            label={`Result (${measurementUnit})`}
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <TextField
            id={`result-performed-${participant.id}`}
            label="Performed at"
            type="datetime-local"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
          />
          <Button
            type="button"
            isLoading={submitBusy}
            disabled={value.trim() === "" || !Number.isFinite(Number(value))}
            onClick={() => onSubmitResult(Number(value), measurementUnit, new Date(performedAt).toISOString())}
          >
            {resultState.kind === "rejected" ? "Resubmit result" : "Submit result"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Add / remove min_age and max_age rules while the competition is still before registration. */
function EligibilityRulesCard({
  rules,
  busyKey,
  onAdd,
  onRemove,
}: {
  rules: { id: string; ruleType: "min_age" | "max_age"; value: Record<string, unknown> }[];
  busyKey: string | null;
  onAdd: (ruleType: "min_age" | "max_age", age: number) => Promise<void>;
  onRemove: (ruleId: string) => Promise<void>;
}) {
  const [ruleType, setRuleType] = useState<"min_age" | "max_age">("min_age");
  const [age, setAge] = useState("");
  const taken = new Set(rules.map((r) => r.ruleType));
  const available = (["min_age", "max_age"] as const).filter((type) => !taken.has(type));
  const effectiveType = available.includes(ruleType) ? ruleType : (available[0] ?? ruleType);
  const parsedAge = Number(age);
  const ageValid = age.trim() !== "" && Number.isInteger(parsedAge) && parsedAge >= 0 && parsedAge <= 120;

  return (
    <Card className="p-5" data-testid="eligibility-card">
      <SectionHeader
        title="Eligibility rules"
        subtitle="Rules can only be changed before registration opens, so every athlete is judged under the rules they joined under."
      />
      <ul className="mt-4 divide-y divide-white/10">
        {rules.length === 0 ? <li className="py-2 text-sm text-muted">No rules — open to everyone.</li> : null}
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center justify-between py-2 text-sm">
            <span className="text-fg">
              {rule.ruleType === "min_age" ? "Minimum age" : "Maximum age"}: {String(rule.value.age ?? "—")}
            </span>
            <Button variant="ghost" isLoading={busyKey === `rule-remove-${rule.id}`} onClick={() => void onRemove(rule.id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {available.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <SelectField label="Rule" value={effectiveType} onChange={(e) => setRuleType(e.target.value as "min_age" | "max_age")}>
            {available.map((type) => (
              <option key={type} value={type}>
                {type === "min_age" ? "Minimum age" : "Maximum age"}
              </option>
            ))}
          </SelectField>
          <TextField label="Age" type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="16" />
          <Button
            isLoading={busyKey === "rule-add"}
            disabled={!ageValid}
            onClick={() => void onAdd(effectiveType, parsedAge).then(() => setAge(""))}
          >
            Add rule
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">Both a minimum and a maximum age are set. Remove one to change it.</p>
      )}
    </Card>
  );
}

/** A coach proposes a replacement for an approved result. It never edits it: someone else must approve the new row. */
function CorrectionRequest({
  current,
  busy,
  onRequest,
}: {
  current: { id: string; resultValue: number; measurementUnit: string; performedAt: string };
  busy: boolean;
  onRequest: (value: number, performedAt: string) => void;
}) {
  const [value, setValue] = useState("");
  const [performedAt, setPerformedAt] = useState(() => toDateTimeLocalValue(new Date()));
  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-white/10 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="correction-form">
      <TextField
        id={`correct-value-${current.id}`}
        label={`Correct approved result (now ${current.resultValue} ${current.measurementUnit})`}
        type="number"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <TextField id={`correct-performed-${current.id}`} label="Performed at" type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} />
      <Button
        type="button"
        variant="secondary"
        isLoading={busy}
        disabled={value.trim() === "" || !Number.isFinite(Number(value))}
        onClick={() => onRequest(Number(value), new Date(performedAt).toISOString())}
      >
        Request correction
      </Button>
    </div>
  );
}

type ResultState =
  | { kind: "none" }
  | { kind: "live" }
  | { kind: "rejected"; value: number; notes: string | null };

/**
 * Where an athlete stands in the ORIGINAL-result chain, which decides what the
 * coach is offered: nothing yet (first submission), a live original pending or
 * approved (no new original is possible — corrections only), or only a
 * rejected one (a corrected resubmission is allowed, and the reason is shown).
 * The database makes the same decision; this only avoids offering a form it
 * would refuse.
 */
function resultStateFor(participantProfileId: string, results: ChallengeResultRow[], reviews: ChallengeResultReviewRow[]): ResultState {
  const originals = results.filter((r) => r.participantProfileId === participantProfileId && r.correctsResultId === null);
  if (originals.some((r) => r.status === "pending" || r.status === "approved")) return { kind: "live" };
  const rejected = originals.filter((r) => r.status === "rejected").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!rejected) return { kind: "none" };
  const review = reviews.filter((v) => v.resultId === rejected.id && v.decision === "rejected").at(-1);
  return { kind: "rejected", value: rejected.resultValue, notes: review?.notes ?? null };
}
