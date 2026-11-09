import type { DictionaryEntry } from '@/types/history';
import type { KeyValueStore } from '@/types/ports';
import { Mutex } from './Mutex';

export class DictionaryRepository {
  private readonly lock = new Mutex(); // read-modify-write cycles must not interleave
  constructor(private readonly kv: KeyValueStore) {}
  async list(): Promise<DictionaryEntry[]> { return (await this.kv.get<DictionaryEntry[]>('entries')) ?? []; }
  add(term: string, spoken?: string, id?: string): Promise<DictionaryEntry> {
    const t = term.trim();
    if (!t) return Promise.reject(new Error('Term cannot be empty'));
    const s = spoken?.trim() || undefined;
    return this.lock.run(async () => {
      const all = await this.list();
      const dup = all.find((e) => e.term.toLowerCase() === t.toLowerCase());
      // Re-adding an existing term keeps its id so callers holding that id stay valid.
      const entryId = id ?? dup?.id ?? crypto.randomUUID();
      const entry: DictionaryEntry = s ? { id: entryId, term: t, spoken: s } : { id: entryId, term: t };
      const rest = all.filter((e) => e.term.toLowerCase() !== t.toLowerCase());
      await this.kv.set('entries', [...rest, entry]);
      return entry;
    });
  }
  remove(id: string): Promise<void> { return this.lock.run(async () => this.kv.set('entries', (await this.list()).filter((e) => e.id !== id))); }
  clear(): Promise<void> { return this.lock.run(() => this.kv.delete('entries')); }
}
