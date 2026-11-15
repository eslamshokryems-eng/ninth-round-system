import { describe, expect, it } from "vitest";
import { ok } from "@9thround/shared-kernel";
import type { LeadWorkspaceRepository } from "../domain/lead-workspace-repository";
import { suggestNextActionAt, telLink, whatsappLink } from "../domain/workspace";
import type { LogInteractionInput } from "../domain/workspace";
import { AddLeadNoteUseCase, AssignLeadsUseCase, LogLeadInteractionUseCase, SetLeadNextActionUseCase } from "./workspace";

function fake() {
  const calls: { name: string; args: unknown[] }[] = [];
  const track = (name: string, value: unknown) => async (...args: unknown[]) => { calls.push({ name, args }); return ok(value); };
  const repo = {
    getWorklist: track("getWorklist", []), getSummary: track("getSummary", {}), logInteraction: track("logInteraction", "activity-1"),
    setNextAction: track("setNextAction", "fu-1"), addNote: track("addNote", "n-1"), setInterest: track("setInterest", undefined),
    assignLeads: track("assignLeads", 2), listActivities: track("listActivities", []), listAssignments: track("listAssignments", []),
  } as unknown as LeadWorkspaceRepository;
  return { repo, calls };
}
const NOW = new Date("2026-11-14T10:00:00Z");
const base: LogInteractionInput = {
  leadId: "l1", kind: "call", outcome: "interested", note: "  good call  ", nextKind: "whatsapp",
  nextAt: new Date("2026-11-15T10:00:00Z"), lostReason: null, interestLevel: null,
};

describe("LogLeadInteractionUseCase — an active lead always leaves with a next action", () => {
  it("forwards a complete interaction, trimming the note", async () => {
    const { repo, calls } = fake();
    const r = await new LogLeadInteractionUseCase(repo, () => NOW).execute(base);
    expect(r.isOk).toBe(true);
    expect((calls[0]!.args[0] as LogInteractionInput).note).toBe("good call");
  });
  it.each([
    ["no next kind", { nextKind: null }],
    ["no next date", { nextAt: null }],
  ])("refuses %s before calling the database", async (_n, patch) => {
    const { repo, calls } = fake();
    const r = await new LogLeadInteractionUseCase(repo, () => NOW).execute({ ...base, ...patch });
    expect(r.isErr && r.error.code).toBe("NEXT_ACTION_REQUIRED");
    expect(calls).toHaveLength(0);
  });
  it("refuses a next action in the past (5 minutes of tolerance)", async () => {
    const { repo, calls } = fake();
    const uc = new LogLeadInteractionUseCase(repo, () => NOW);
    expect((await uc.execute({ ...base, nextAt: new Date("2026-11-13T10:00:00Z") })).isErr).toBe(true);
    expect((await uc.execute({ ...base, nextAt: new Date(NOW.getTime() - 60_000) })).isOk).toBe(true);
    expect(calls).toHaveLength(1);
  });
  it("'not interested' closes the lead: it needs a lost reason and NO next action", async () => {
    const { repo, calls } = fake();
    const uc = new LogLeadInteractionUseCase(repo, () => NOW);
    const noReason = await uc.execute({ ...base, outcome: "not_interested", nextKind: null, nextAt: null });
    expect(noReason.isErr && noReason.error.code).toBe("LOST_REASON_REQUIRED");
    expect((await uc.execute({ ...base, outcome: "not_interested", nextKind: null, nextAt: null, lostReason: "too_expensive" })).isOk).toBe(true);
    expect(calls).toHaveLength(1);
  });
  it("rejects an unknown kind or outcome", async () => {
    const { repo } = fake();
    const uc = new LogLeadInteractionUseCase(repo, () => NOW);
    expect((await uc.execute({ ...base, kind: "telepathy" as never })).isErr).toBe(true);
    expect((await uc.execute({ ...base, outcome: "bogus" as never })).isErr).toBe(true);
  });
});

describe("other workspace use cases", () => {
  it("scheduling a next action must be in the future", async () => {
    const { repo, calls } = fake();
    const uc = new SetLeadNextActionUseCase(repo, () => NOW);
    expect((await uc.execute({ leadId: "l1", kind: "call", at: new Date("2026-11-10T00:00:00Z"), note: null })).isErr).toBe(true);
    expect((await uc.execute({ leadId: "l1", kind: "visit", at: new Date("2026-11-16T00:00:00Z"), note: " trial " })).isOk).toBe(true);
    expect(calls).toHaveLength(1);
    expect((calls[0]!.args[0] as { note: string }).note).toBe("trial");
  });
  it("a note cannot be blank", async () => {
    const { repo, calls } = fake();
    expect((await new AddLeadNoteUseCase(repo).execute({ leadId: "l1", note: "   " })).isErr).toBe(true);
    expect((await new AddLeadNoteUseCase(repo).execute({ leadId: "l1", note: " ok " })).isOk).toBe(true);
    expect(calls[0]!.args).toEqual(["l1", "ok"]);
  });
  it("assigning needs leads, a specific employee and a reason", async () => {
    const { repo, calls } = fake();
    const uc = new AssignLeadsUseCase(repo);
    expect((await uc.execute({ leadIds: [], newOwnerId: "e1", reason: "x" })).isErr).toBe(true);
    expect((await uc.execute({ leadIds: ["l1"], newOwnerId: "", reason: "x" })).isErr).toBe(true);
    expect((await uc.execute({ leadIds: ["l1"], newOwnerId: "e1", reason: "  " })).isErr).toBe(true);
    expect((await uc.execute({ leadIds: ["l1"], newOwnerId: "e1", reason: " balance " })).isOk).toBe(true);
    expect(calls).toHaveLength(1);
    expect((calls[0]!.args[0] as { reason: string }).reason).toBe("balance");
  });
});

describe("suggestions and links (suggestions are editable defaults; WhatsApp is only OPENED)", () => {
  it("suggests editable follow-up dates from the outcome", () => {
    const day = 86_400_000;
    expect(suggestNextActionAt("no_answer", NOW).getTime() - NOW.getTime()).toBe(day);
    expect(suggestNextActionAt("interested", NOW).getTime() - NOW.getTime()).toBe(2 * day);
    expect(suggestNextActionAt("not_ready", NOW).getTime() - NOW.getTime()).toBe(7 * day);
  });
  it("builds wa.me / tel links; refuses numbers that are too short", () => {
    expect(whatsappLink("01012345678")).toBe("https://wa.me/201012345678");
    expect(whatsappLink("+20 101 234 5678")).toBe("https://wa.me/201012345678");
    expect(whatsappLink("0044 7700 900123")).toBe("https://wa.me/447700900123");
    expect(whatsappLink("123")).toBeNull();
    expect(whatsappLink("")).toBeNull();
    expect(telLink("+20 101-234-5678")).toBe("tel:+201012345678");
    expect(telLink("12")).toBeNull();
  });
});

