import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { StaffPresenceRepository } from "../domain/staff-presence-repository";
import type { StaffPresence } from "../domain/staff-presence";

export class SupabaseStaffPresenceRepository implements StaffPresenceRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listStaff(): Promise<Result<StaffPresence[]>> {
    const { data, error } = await this.client
      .from("profiles")
      .select("id, full_name, role, branch_id, last_seen_at, employee_code, phone, is_active")
      .neq("role", "member")
      .order("full_name", { ascending: true });

    if (error) {
      return err(domainError("STAFF_PRESENCE_LIST_FAILED", error.message));
    }

    return ok(
      data.map((row) => ({
        profileId: row.id,
        fullName: row.full_name,
        role: row.role,
        branchId: row.branch_id,
        lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : null,
        employeeCode: row.employee_code,
        phone: row.phone,
        isActive: row.is_active,
      })),
    );
  }

  async recordHeartbeat(profileId: string): Promise<Result<void>> {
    const { error } = await this.client
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", profileId);

    if (error) {
      return err(domainError("HEARTBEAT_FAILED", error.message));
    }
    return ok(undefined);
  }
}
