import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { UpdateMemberRepository } from "../domain/update-member-repository";
import type { UpdateMemberInput } from "../domain/update-member";

const UNIQUE_VIOLATION = "23505";

export class SupabaseUpdateMemberRepository implements UpdateMemberRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async update(input: UpdateMemberInput): Promise<Result<void>> {
    const { error } = await this.client
      .from("members")
      .update({
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        gender: input.gender,
        date_of_birth: input.dateOfBirth,
        national_id: input.nationalId,
        emergency_contact_name: input.emergencyContactName,
        emergency_contact_phone: input.emergencyContactPhone,
        address: input.address,
        notes: input.notes,
      })
      .eq("id", input.memberId);

    if (error) {
      if (error.code === UNIQUE_VIOLATION && error.message.includes("uq_members_phone")) {
        return err(domainError("PHONE_ALREADY_REGISTERED", "This phone number is already registered."));
      }
      return err(domainError("MEMBER_UPDATE_FAILED", error.message));
    }

    return ok(undefined);
  }
}
