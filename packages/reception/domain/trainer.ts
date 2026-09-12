import type { MembershipStatus } from "./member-search-result";

/** One row of the Trainers page's main list. */
export interface TrainerSummary {
  trainerId: string;
  fullName: string;
  playerCount: number;
}

/** One row of the Trainers page's player table, for a single selected trainer. */
export interface TrainerPlayer {
  membershipId: string;
  memberId: string;
  memberFullName: string;
  memberCode: string;
  startDate: string;
  endDate: string;
  status: MembershipStatus;
}
