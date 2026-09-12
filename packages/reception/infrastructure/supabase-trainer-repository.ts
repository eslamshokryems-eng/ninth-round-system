import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { TrainerRepository } from "../domain/trainer-repository";
import type { TrainerPlayer, TrainerSummary } from "../domain/trainer";

interface CoachProfileRow {
  id: string;
  full_name: string | null;
}

interface CoachAssignmentRow {
  coach_id: string;
}

interface TrainerPlayerRow {
  id: string;
  status: TrainerPlayer["status"];
  start_date: string;
  end_date: string;
  // `members` is a to-one embed (memberships.member_id -> members.id is a FK
  // *on* memberships) — same reasoning as every other repository in this
  // module: PostgREST returns a single object here, not an array.
  members: { id: string; full_name: string; member_code: string } | null;
}

/**
 * Reads the existing coach-assignment source of truth (memberships.coach_id,
 * 20260812000002) — no new table, no second assignment system. "Currently
 * assigned" means the member's `active`-status membership row has this
 * coach_id; a renewal with a different (or no) coach creates a new row and
 * flips the old one to `expired`, so this naturally reflects the latest
 * assignment with no extra bookkeeping.
 */
export class SupabaseTrainerRepository implements TrainerRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listTrainers(branchId: string): Promise<Result<TrainerSummary[]>> {
    const [coachesResult, assignmentsResult] = await Promise.all([
      this.client
        .from("profiles")
        .select("id, full_name")
        .eq("branch_id", branchId)
        .eq("role", "coach")
        .eq("is_active", true)
        .order("full_name", { ascending: true }),
      this.client
        .from("memberships")
        .select("coach_id")
        .eq("branch_id", branchId)
        .eq("status", "active")
        .not("coach_id", "is", null),
    ]);

    if (coachesResult.error) {
      return err(domainError("LIST_TRAINERS_FAILED", coachesResult.error.message));
    }
    if (assignmentsResult.error) {
      return err(domainError("LIST_TRAINERS_FAILED", assignmentsResult.error.message));
    }

    const counts = new Map<string, number>();
    for (const row of (assignmentsResult.data ?? []) as CoachAssignmentRow[]) {
      counts.set(row.coach_id, (counts.get(row.coach_id) ?? 0) + 1);
    }

    return ok(
      (coachesResult.data as CoachProfileRow[]).map((row) => ({
        trainerId: row.id,
        fullName: row.full_name ?? "—",
        playerCount: counts.get(row.id) ?? 0,
      })),
    );
  }

  async listPlayersForTrainer(branchId: string, trainerId: string): Promise<Result<TrainerPlayer[]>> {
    const { data, error } = await this.client
      .from("memberships")
      .select("id, status, start_date, end_date, members:member_id (id, full_name, member_code)")
      .eq("branch_id", branchId)
      .eq("coach_id", trainerId)
      .eq("status", "active")
      .order("end_date", { ascending: true });

    if (error) {
      return err(domainError("LIST_TRAINER_PLAYERS_FAILED", error.message));
    }

    return ok(
      (data as unknown as TrainerPlayerRow[]).map((row) => ({
        membershipId: row.id,
        memberId: row.members?.id ?? "",
        memberFullName: row.members?.full_name ?? "—",
        memberCode: row.members?.member_code ?? "—",
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status,
      })),
    );
  }
}
