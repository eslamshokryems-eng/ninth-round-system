import { err, ok } from "../kernel";
import type { Result } from "../kernel";
import type { RaceSupabaseClient } from "./race-client";
import type { DemoStatus, MyAccess, RaceStationConfigRepository, StationConfigView, StationDisplay, StationPatch, StationPreview } from "../domain/station-config";
import { toRaceError } from "./supabase-race-registration-repository";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;

/** All calls go through SECURITY DEFINER RPCs that re-check the caller's role in the database. */
export class SupabaseRaceStationConfigRepository implements RaceStationConfigRepository {
  private readonly rpc: Rpc;
  constructor(client: RaceSupabaseClient) {
    this.rpc = (fn, args) => (client as unknown as { rpc: Rpc }).rpc(fn, args);
  }
  private async call<T>(fn: string, args?: Record<string, unknown>): Promise<Result<T>> {
    const { data, error } = await this.rpc(fn, args);
    if (error) return err(toRaceError(error));
    return ok(data as T);
  }
  myAccess() { return this.call<MyAccess>("race_my_access"); }
  getConfig(eventId: string) { return this.call<StationConfigView>("race_get_station_config", { p_event_id: eventId }); }
  preview(eventId: string, n: number, patch: StationPatch) {
    return this.call<StationPreview>("race_preview_station_config", { p_event_id: eventId, p_station_number: n, p_patch: patch });
  }
  update(eventId: string, n: number, patch: StationPatch, reason: string) {
    return this.call<{ version: number }>("race_update_station_config", { p_event_id: eventId, p_station_number: n, p_patch: patch, p_reason: reason });
  }
  reset(eventId: string, n: number, reason: string) {
    return this.call<{ version: number }>("race_reset_station_config", { p_event_id: eventId, p_station_number: n, p_reason: reason });
  }
  display(eventId: string, n: number) { return this.call<StationDisplay>("race_station_display", { p_event_id: eventId, p_station_number: n }); }
  createDemo(name: string, copyFrom?: string) {
    return this.call<{ id: string; slug: string }>("race_create_demo_event", { p_name: name, p_copy_from: copyFrom ?? null });
  }
  addDemoAthletes(eventId: string, count: number, heatSize: number) {
    return this.call<{ added: number; athletes: number; heats: number }>("race_demo_add_athletes", { p_event_id: eventId, p_count: count, p_heat_size: heatSize });
  }
  async lockDemoHeats(eventId: string): Promise<Result<void>> {
    const r = await this.call<unknown>("race_demo_lock_heats", { p_event_id: eventId });
    return r.isErr ? r : ok(undefined);
  }
  checkInAllDemo(eventId: string) { return this.call<{ checked_in: number }>("race_demo_checkin_all", { p_event_id: eventId }); }
  demoStatus(eventId: string) { return this.call<DemoStatus>("race_demo_status", { p_event_id: eventId }); }
}
