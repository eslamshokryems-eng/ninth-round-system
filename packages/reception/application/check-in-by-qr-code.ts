import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MemberSearchRepository } from "../domain/member-search-repository";
import type { CheckInRepository } from "../domain/check-in-repository";

export interface CheckInByQrCodeOutput {
  memberId: string;
  fullName: string;
  checkInId: string;
  checkedInAt: string;
}

/**
 * Scan Check-In: a scanned `members.qr_code` value in, a completed
 * check-in out — the fast path around searching by name/phone when a
 * member has their QR (physical card or shown on their own phone).
 * Two steps, not a new SQL function: qr_code -> member_id is a plain
 * RLS-scoped read every branch-staff role already has (same policy the
 * Members list/search already relies on), and the actual check-in reuses
 * check_in_member() unchanged — its one real business rule (active,
 * unexpired membership) and its own role restriction (reception/
 * branch_manager/super_admin — sales_employee is deliberately excluded,
 * see 20260806000006_check_ins.sql) stay defined in exactly one place.
 */
export class CheckInByQrCodeUseCase implements UseCase<string, CheckInByQrCodeOutput> {
  constructor(
    private readonly members: MemberSearchRepository,
    private readonly checkIns: CheckInRepository,
  ) {}

  async execute(qrCode: string): Promise<Result<CheckInByQrCodeOutput>> {
    const trimmed = qrCode.trim();
    if (!trimmed) {
      return err(domainError("INVALID_QR_CODE", "No QR code was read."));
    }

    const found = await this.members.findByQrCode(trimmed);
    if (found.isErr) return found;
    if (!found.value) {
      return err(domainError("MEMBER_NOT_FOUND", "This QR code doesn't match any member."));
    }

    const member = found.value;
    const checkedIn = await this.checkIns.checkIn(member.memberId);
    if (checkedIn.isErr) return checkedIn;

    return ok({
      memberId: member.memberId,
      fullName: member.fullName,
      checkInId: checkedIn.value.checkInId,
      checkedInAt: checkedIn.value.checkedInAt,
    });
  }
}
