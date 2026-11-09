import type { HistoryEntry } from '@/types/history';
import type { Settings } from '@/types/settings';
import type { KeyValueStore } from '@/types/ports';
import { Mutex } from './Mutex';

const MAX_ENTRIES = 500;
const DAY = 86_400_000;
type Policy = Settings['history'];

export class HistoryRepository {
  private readonly lock = new Mutex(); // read-modify-write cycles must not interleave
  constructor(private readonly kv: KeyValueStore, private readonly now: () => number = Date.now) {}
  private async all(): Promise<HistoryEntry[]> { return (await this.kv.get<HistoryEntry[]>('entries')) ?? []; }
  private async write(entries: HistoryEntry[]) { await this.kv.set('entries', entries.slice(0, MAX_ENTRIES)); }

  async add(e: HistoryEntry, policy: Policy): Promise<boolean> {
    if (!policy.enabled) return false;
    return this.lock.run(async () => {
      await this.write([e, ...(await this.all())]);
      await this.pruneNow(policy);
      return true;
    });
  }
  async list(query?: string): Promise<HistoryEntry[]> {
    const all = await this.all();
    const q = query?.trim().toLowerCase();
    return q ? all.filter((e) => e.rawText.toLowerCase().includes(q) || e.finalText.toLowerCase().includes(q)) : all;
  }
  delete(id: string): Promise<void> { return this.lock.run(async () => this.write((await this.all()).filter((e) => e.id !== id))); }
  clear(): Promise<void> { return this.lock.run(() => this.kv.delete('entries')); }
  prune(policy: Policy): Promise<number> { return this.lock.run(() => this.pruneNow(policy)); }
  private async pruneNow(policy: Policy): Promise<number> {
    const all = await this.all();
    const cutoff = policy.retentionDays === null ? -Infinity : this.now() - policy.retentionDays * DAY;
    const kept = all.filter((e) => e.createdAt >= cutoff).slice(0, MAX_ENTRIES);
    if (kept.length !== all.length) await this.write(kept);
    return all.length - kept.length;
  }
}
