"use client";

import type { EvidenceEntry, EvidenceFile, EvidenceStore } from "@9thround/race";

/**
 * The judge device's evidence outbox, on disk (IndexedDB): the photo itself plus its queue entry. It survives a reload, a crash and a
 * dead connection. Falls back to memory only when IndexedDB is unavailable (the in-memory copy still works for the session).
 */
function open(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("entries", { keyPath: "id" });
      db.createObjectStore("files");
      db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

class MemoryEvidenceStore implements EvidenceStore {
  private entries = new Map<string, EvidenceEntry>();
  private files = new Map<string, EvidenceFile>();
  private seq = 0;
  async list() { return [...this.entries.values()].map((e) => structuredClone(e)); }
  async put(e: EvidenceEntry) { this.entries.set(e.id, structuredClone(e)); }
  async putFile(id: string, f: EvidenceFile) { this.files.set(id, f); }
  async getFile(id: string) { return this.files.get(id) ?? null; }
  async nextSeq() { this.seq += 1; return this.seq; }
}

class IndexedDbEvidenceStore implements EvidenceStore {
  constructor(private readonly db: IDBDatabase) {}
  list() { return tx<EvidenceEntry[]>(this.db, "entries", "readonly", (s) => s.getAll()); }
  async put(e: EvidenceEntry) { await tx(this.db, "entries", "readwrite", (s) => s.put(e)); }
  async putFile(id: string, f: EvidenceFile) { await tx(this.db, "files", "readwrite", (s) => s.put(f, id)); }
  async getFile(id: string) { return (await tx<EvidenceFile | undefined>(this.db, "files", "readonly", (s) => s.get(id))) ?? null; }
  async nextSeq() {
    const cur = (await tx<number | undefined>(this.db, "meta", "readonly", (s) => s.get("seq"))) ?? 0;
    await tx(this.db, "meta", "readwrite", (s) => s.put(cur + 1, "seq"));
    return cur + 1;
  }
}

export async function openEvidenceStore(eventId: string): Promise<EvidenceStore> {
  try {
    if (typeof indexedDB === "undefined") return new MemoryEvidenceStore();
    return new IndexedDbEvidenceStore(await open(`race-evidence-outbox:${eventId}`));
  } catch {
    return new MemoryEvidenceStore();
  }
}
