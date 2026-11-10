"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ChallengeDetail, ChallengeLeaderboardEntry } from "@9thround/challenges";
import { getChallengesModule } from "../../../../src/lib/composition-root";
import { Card } from "../../../../src/components/ui/card";
import { PageHeader } from "../../../../src/components/ui/page-header";
import { SectionHeader } from "../../../../src/components/ui/section-header";
import { EmptyState } from "../../../../src/components/ui/empty-state";
import { StatusBadge } from "../../../../src/components/ui/status-badge";
import { SkeletonTable } from "../../../../src/components/ui/loading-skeleton";
import {
  challengeStatusTone,
  formatDate,
  humanize,
  scopeLabel,
} from "../../../../src/features/challenges/presentation";

/**
 * A competition as an athlete sees it: the rules they are agreeing to, and
 * the standings.
 *
 * The standings come from the leaderboard view, which is the only read
 * path that shows one athlete's performance to another — it projects a
 * display name, a value and a rank, and nothing else. No participant row,
 * eligibility reason or coach assignment reaches this page for anyone but
 * the signed-in athlete themselves.
 */
export default function MemberChallengeDetailPage() {
  const params = useParams<{ challengeId: string }>();
  const challengeId = params?.challengeId ?? "";

  const [detail, setDetail] = useState<ChallengeDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<ChallengeLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!challengeId) return;
    setIsLoading(true);
    setLoadError(null);
    const challengesModule = getChallengesModule();
    const [detailResult, leaderboardResult] = await Promise.all([
      challengesModule.getChallengeDetail.execute(challengeId),
      challengesModule.getChallengeLeaderboard.execute(challengeId),
    ]);
    if (detailResult.isErr) {
      setLoadError(detailResult.error.message);
      setIsLoading(false);
      return;
    }
    setDetail(detailResult.value);
    setLeaderboard(leaderboardResult.isOk ? leaderboardResult.value : []);
    setIsLoading(false);
  }, [challengeId]);

  useEffect(() => {
    void load();
  }, [load]);

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
              <SkeletonTable rows={4} columns={3} />
            </tbody>
          </table>
        </Card>
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div className="space-y-6">
        <PageHeader title="Competition" />
        <Card className="p-5">
          <EmptyState
            message={loadError ?? "This competition is not available to you."}
            variant={loadError ? "error" : "empty"}
            actionLabel={loadError ? "Try again" : undefined}
            onAction={loadError ? () => void load() : undefined}
          />
        </Card>
        <Link href="/my-challenges" className="text-sm text-gold underline">
          ← Back to my competitions
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

      <Link href="/my-challenges" className="inline-block text-sm text-gold underline">
        ← My competitions
      </Link>

      <Card className="p-5">
        <SectionHeader title="The rules" />
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Scored on</dt>
            <dd className="text-fg">
              {humanize(detail.measurementType)} in {detail.measurementUnit} —{" "}
              {detail.scoringDirection === "HIGHER_IS_BETTER" ? "higher is better" : "lower is better"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Runs</dt>
            <dd className="text-fg">
              {formatDate(detail.startsAt)} – {formatDate(detail.endsAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Registration</dt>
            <dd className="text-fg">
              {formatDate(detail.registrationStartAt)} – {formatDate(detail.registrationEndAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Who can enter</dt>
            <dd className="text-fg">
              {detail.eligibilityRules.length === 0
                ? "Open to everyone"
                : detail.eligibilityRules
                    .map((rule) => `${humanize(rule.ruleType)} ${String((rule.value as { age?: number }).age ?? "—")}`)
                    .join(" · ")}
            </dd>
          </div>
        </dl>
        {detail.description ? <p className="mt-4 text-sm text-muted">{detail.description}</p> : null}
        <p className="mt-4 text-xs text-muted">
          Your result is recorded by your assigned coach and then reviewed before it counts.
        </p>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Standings" subtitle="Approved results only" />
        <div className="mt-4">
          {leaderboard.length === 0 ? (
            <EmptyState message="No approved results yet." />
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
