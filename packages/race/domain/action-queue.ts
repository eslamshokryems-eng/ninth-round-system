import type { ActionType } from "./judge";

/**
 * The judge device's outbox. Every tap becomes an entry with its OWN client-generated id BEFORE anything is sent, so a lost
 * response, a retry, a reload or a reconnect can only ever re-send the same id — and the server answers a known id with the
 * original row, never a second one. Nothing here decides anything official: it only guarantees "at least once, in order".
 */
export interface QueuedAction {
  clientEventId: string;
  resultId: string;
  type: ActionType;
  value?: number;
  voidsEventId?: string;
  /** Device-local sequence number (1, 2, 3 … for this device), kept for replays. */
  deviceSeq: number;
  recordedAt: string;
  /** The device's own estimate of race time when the judge tapped (used only if the action arrives after the lock). */
  deviceRaceMs: number | null;
  /** Set once a send attempt failed for a NETWORK reason: from then on it goes as OFFLINE_QUEUE. */
  offline: boolean;
  attempts: number;
  /** Permanently refused (permission / validation): kept for the judge to see, never retried. */
  failed?: string;
}

export interface QueueStorage {
  load(): QueuedAction[];
  save(items: QueuedAction[]): void;
  nextSeq(): number;
}

export interface SendOutcome {
  kind: "recorded" | "network-error" | "refused";
  message?: string;
}

export type Sender = (a: QueuedAction) => Promise<SendOutcome>;

export class ActionQueue {
  constructor(
    private readonly storage: QueueStorage,
    private readonly newId: () => string,
    private readonly now: () => string,
  ) {}

  pending(): QueuedAction[] {
    return this.storage.load().filter((a) => a.failed === undefined);
  }
  failed(): QueuedAction[] {
    return this.storage.load().filter((a) => a.failed !== undefined);
  }

  enqueue(input: { resultId: string; type: ActionType; value?: number; voidsEventId?: string; deviceRaceMs: number | null }): QueuedAction {
    const item: QueuedAction = {
      clientEventId: this.newId(),
      resultId: input.resultId,
      type: input.type,
      deviceSeq: this.storage.nextSeq(),
      recordedAt: this.now(),
      deviceRaceMs: input.deviceRaceMs,
      offline: false,
      attempts: 0,
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.voidsEventId !== undefined ? { voidsEventId: input.voidsEventId } : {}),
    };
    this.storage.save([...this.storage.load(), item]);
    return item;
  }

  /**
   * Sends everything in order. A network error stops the flush (order is preserved, the rest waits); a refusal is parked so it
   * cannot block the line. Safe to call as often as you like, from several tabs, after a crash: ids make every send idempotent.
   */
  async flush(send: Sender): Promise<{ sent: number; remaining: number }> {
    let sent = 0;
    for (const original of this.pending()) {
      const current = this.storage.load().find((a) => a.clientEventId === original.clientEventId);
      if (!current || current.failed !== undefined) continue;
      const outcome = await send(current);
      const rest = this.storage.load();
      const idx = rest.findIndex((a) => a.clientEventId === current.clientEventId);
      if (idx < 0) continue;
      if (outcome.kind === "recorded") {
        rest.splice(idx, 1);
        this.storage.save(rest);
        sent += 1;
      } else if (outcome.kind === "refused") {
        rest[idx] = { ...current, attempts: current.attempts + 1, failed: outcome.message ?? "refused" };
        this.storage.save(rest);
      } else {
        rest[idx] = { ...current, attempts: current.attempts + 1, offline: true };
        this.storage.save(rest);
        break;
      }
    }
    return { sent, remaining: this.pending().length };
  }
}
