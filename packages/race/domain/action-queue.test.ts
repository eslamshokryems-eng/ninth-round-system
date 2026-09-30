import { describe, expect, it } from "vitest";
import { ActionQueue } from "./action-queue";
import type { QueueStorage, QueuedAction, SendOutcome } from "./action-queue";

function memory(): QueueStorage & { items: QueuedAction[] } {
  const m = { items: [] as QueuedAction[], seq: 0, load() { return this.items.map((i) => ({ ...i })); }, save(x: QueuedAction[]) { this.items = x.map((i) => ({ ...i })); }, nextSeq() { return ++this.seq; } };
  return m;
}
let n = 0;
const mk = (s = memory()) => ({ s, q: new ActionQueue(s, () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, () => "2026-12-21T07:00:00Z") });
const tap = (q: ActionQueue, type: "REP" | "NO_REP" = "REP") => q.enqueue({ resultId: "res", type, deviceRaceMs: 1000 });

describe("ActionQueue", () => {
  it("gives every tap its own id and a device sequence BEFORE anything is sent", () => {
    const { q, s } = mk();
    const a = tap(q); const b = tap(q);
    expect(a.clientEventId).not.toBe(b.clientEventId);
    expect([a.deviceSeq, b.deviceSeq]).toEqual([1, 2]);
    expect(s.items).toHaveLength(2);
  });

  it("removes an entry only after the server confirmed it, and sends in order", async () => {
    const { q } = mk();
    const a = tap(q); const b = tap(q);
    const order: string[] = [];
    const r = await q.flush(async (x) => { order.push(x.clientEventId); return { kind: "recorded" }; });
    expect(order).toEqual([a.clientEventId, b.clientEventId]);
    expect(r).toEqual({ sent: 2, remaining: 0 });
  });

  it("a network error keeps the entry, marks it offline and STOPS the flush so order is preserved", async () => {
    const { q } = mk();
    const a = tap(q); tap(q);
    const seen: string[] = [];
    const r = await q.flush(async (x) => { seen.push(x.clientEventId); return { kind: "network-error" }; });
    expect(seen).toEqual([a.clientEventId]);
    expect(r).toEqual({ sent: 0, remaining: 2 });
    expect(q.pending()[0]!.offline).toBe(true);
    expect(q.pending()[1]!.offline).toBe(false);
  });

  it("re-sending after a lost response re-sends the SAME id (that is what makes the server idempotent)", async () => {
    const { q } = mk();
    const a = tap(q);
    const ids: string[] = [];
    await q.flush(async (x) => { ids.push(x.clientEventId); return { kind: "network-error" }; });
    await q.flush(async (x) => { ids.push(x.clientEventId); return { kind: "network-error" }; });
    await q.flush(async (x) => { ids.push(x.clientEventId); return { kind: "recorded" }; });
    expect(new Set(ids)).toEqual(new Set([a.clientEventId]));
    expect(ids).toHaveLength(3);
    expect(q.pending()).toHaveLength(0);
  });

  it("a refusal is parked, does not block the line, and is never retried", async () => {
    const { q } = mk();
    const a = tap(q); const b = tap(q);
    const outcomes: Record<string, SendOutcome> = { [a.clientEventId]: { kind: "refused", message: "not your station" }, [b.clientEventId]: { kind: "recorded" } };
    const r = await q.flush(async (x) => outcomes[x.clientEventId]!);
    expect(r).toEqual({ sent: 1, remaining: 0 });
    expect(q.failed().map((f) => f.failed)).toEqual(["not your station"]);
    let calls = 0;
    await q.flush(async () => { calls += 1; return { kind: "recorded" }; });
    expect(calls).toBe(0);
  });

  it("survives a reload: a new queue over the same storage continues where the old one stopped", async () => {
    const s = memory();
    const first = mk(s).q; const a = tap(first);
    const second = mk(s).q;
    const sent: string[] = [];
    await second.flush(async (x) => { sent.push(x.clientEventId); return { kind: "recorded" }; });
    expect(sent).toEqual([a.clientEventId]);
  });
});
