import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryKeyValueStore } from './KeyValueStore';
import type { KeyValueStore } from '@/types/ports';
import { SettingsRepository } from './SettingsRepository';
import { HistoryRepository } from './HistoryRepository';
import { DictionaryRepository } from './DictionaryRepository';
import { deleteAllUserData } from './deleteAllUserData';
import { DEFAULT_SETTINGS } from '@/types/settings';
import type { HistoryEntry } from '@/types/history';

const DAY = 86_400_000;
const entry = (id: string, createdAt: number, raw = 'raw ' + id, final = 'Final ' + id): HistoryEntry =>
  ({ id, createdAt, rawText: raw, finalText: final, language: 'en', style: 'minimal', durationMs: 1000 });
const ON = { enabled: true, retentionDays: 30 };

describe('SettingsRepository', () => {
  it('returns defaults when empty and round-trips saves', async () => {
    const repo = new SettingsRepository(new MemoryKeyValueStore());
    expect(await repo.load()).toEqual(DEFAULT_SETTINGS);
    await repo.save({ ...DEFAULT_SETTINGS, language: 'pt-BR' });
    expect((await repo.load()).language).toBe('pt-BR');
    await repo.reset();
    expect(await repo.load()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('HistoryRepository', () => {
  let kv: MemoryKeyValueStore;
  let now = 100 * DAY;
  let repo: HistoryRepository;
  beforeEach(() => { kv = new MemoryKeyValueStore(); now = 100 * DAY; repo = new HistoryRepository(kv, () => now); });

  it('stores newest first and lists them', async () => {
    await repo.add(entry('a', now - 2000), ON);
    await repo.add(entry('b', now - 1000), ON);
    expect((await repo.list()).map((e) => e.id)).toEqual(['b', 'a']);
  });
  it('writes nothing when history is disabled (privacy)', async () => {
    const stored = await repo.add(entry('a', now), { enabled: false, retentionDays: 30 });
    expect(stored).toBe(false);
    expect(await kv.get('entries')).toBeUndefined();
    expect(await repo.list()).toEqual([]);
  });
  it('searches raw and final text case-insensitively', async () => {
    await repo.add(entry('a', now, 'hello kubernetes', 'Hello Kubernetes.'), ON);
    await repo.add(entry('b', now, 'bom dia', 'Bom dia.'), ON);
    expect((await repo.list('KUBERNETES')).map((e) => e.id)).toEqual(['a']);
    expect((await repo.list('  bom ')).map((e) => e.id)).toEqual(['b']);
    expect(await repo.list('zzz')).toEqual([]);
  });
  it('deletes one and clears all', async () => {
    await repo.add(entry('a', now), ON); await repo.add(entry('b', now), ON);
    await repo.delete('a');
    expect((await repo.list()).map((e) => e.id)).toEqual(['b']);
    await repo.clear();
    expect(await repo.list()).toEqual([]);
  });
  it('prunes entries older than the retention window and keeps all when retention is null', async () => {
    await repo.add(entry('old', now - 40 * DAY), { enabled: true, retentionDays: null });
    await repo.add(entry('new', now - 1 * DAY), { enabled: true, retentionDays: null });
    expect(await repo.prune({ enabled: true, retentionDays: null })).toBe(0);
    expect(await repo.prune({ enabled: true, retentionDays: 30 })).toBe(1);
    expect((await repo.list()).map((e) => e.id)).toEqual(['new']);
  });
  it('caps history at 500 entries, dropping the oldest', async () => {
    for (let i = 0; i < 505; i++) await repo.add(entry('e' + i, now - (505 - i)), ON);
    const all = await repo.list();
    expect(all).toHaveLength(500);
    expect(all[0]!.id).toBe('e504');
    expect(all.at(-1)!.id).toBe('e5');
  });
});

describe('DictionaryRepository', () => {
  it('adds, trims, de-duplicates by term (case-insensitive) and removes', async () => {
    const repo = new DictionaryRepository(new MemoryKeyValueStore());
    const a = await repo.add('  Kubernetes ', 'koo ber net ease', 'id1');
    expect(a).toEqual({ id: 'id1', term: 'Kubernetes', spoken: 'koo ber net ease' });
    await repo.add('kubernetes');
    expect(await repo.list()).toHaveLength(1);
    await repo.add('Mindwhisper');
    expect(await repo.list()).toHaveLength(2);
    await repo.remove('id1');
    expect((await repo.list()).map((e) => e.term)).toEqual(['Mindwhisper']);
    await expect(repo.add('   ')).rejects.toThrow(/empty/i);
  });
});

describe('deleteAllUserData', () => {
  it('wipes settings, history and dictionary', async () => {
    const settings = new SettingsRepository(new MemoryKeyValueStore());
    const history = new HistoryRepository(new MemoryKeyValueStore());
    const dictionary = new DictionaryRepository(new MemoryKeyValueStore());
    await settings.save({ ...DEFAULT_SETTINGS, onboardingDone: true, backend: { url: 'x', token: 'secret' } });
    await history.add(entry('a', Date.now()), ON);
    await dictionary.add('Tauri');
    await deleteAllUserData({ settings, history, dictionary });
    expect(await settings.load()).toEqual(DEFAULT_SETTINGS);
    expect(await history.list()).toEqual([]);
    expect(await dictionary.list()).toEqual([]);
  });
});

/** A store whose operations yield to the event loop, so unserialized read-modify-write cycles interleave. */
class SlowKeyValueStore implements KeyValueStore {
  private inner = new MemoryKeyValueStore();
  private tick = () => new Promise<void>((r) => setTimeout(r, 1));
  async get<T>(key: string) { await this.tick(); return this.inner.get<T>(key); }
  async set<T>(key: string, value: T) { await this.tick(); await this.inner.set(key, value); }
  async delete(key: string) { await this.tick(); await this.inner.delete(key); }
}

describe('repository write serialization', () => {
  it('concurrent history adds are all kept', async () => {
    const repo = new HistoryRepository(new SlowKeyValueStore(), () => 100 * DAY);
    await Promise.all(['a', 'b', 'c'].map((id) => repo.add(entry(id, 100 * DAY), ON)));
    expect((await repo.list()).map((e) => e.id).sort()).toEqual(['a', 'b', 'c']);
  });
  it('an add interleaved with a delete neither loses the add nor resurrects the deleted entry', async () => {
    const repo = new HistoryRepository(new SlowKeyValueStore(), () => 100 * DAY);
    await repo.add(entry('a', 100 * DAY), ON);
    await Promise.all([repo.add(entry('b', 100 * DAY), ON), repo.delete('a')]);
    expect((await repo.list()).map((e) => e.id)).toEqual(['b']);
  });
  it('a clear interleaved with an add is applied in call order', async () => {
    const repo = new HistoryRepository(new SlowKeyValueStore(), () => 100 * DAY);
    await repo.add(entry('a', 100 * DAY), ON);
    await Promise.all([repo.clear(), repo.add(entry('b', 100 * DAY), ON)]);
    expect((await repo.list()).map((e) => e.id)).toEqual(['b']);
  });
  it('a failing write does not wedge later writes', async () => {
    let fail = true;
    const kv = new MemoryKeyValueStore();
    const flaky: KeyValueStore = { get: (k) => kv.get(k), delete: (k) => kv.delete(k), set: async (k, v) => { if (fail) { fail = false; throw new Error('disk full'); } await kv.set(k, v); } };
    const repo = new HistoryRepository(flaky, () => 100 * DAY);
    await expect(repo.add(entry('a', 100 * DAY), ON)).rejects.toThrow('disk full');
    await repo.add(entry('b', 100 * DAY), ON);
    expect((await repo.list()).map((e) => e.id)).toEqual(['b']);
  });
  it('concurrent dictionary adds are all kept and removal is not undone', async () => {
    const repo = new DictionaryRepository(new SlowKeyValueStore());
    await Promise.all(['Tauri', 'Vite', 'Zustand'].map((t) => repo.add(t, undefined, t)));
    expect((await repo.list()).map((e) => e.term).sort()).toEqual(['Tauri', 'Vite', 'Zustand']);
    await Promise.all([repo.remove('Vite'), repo.add('Hono', undefined, 'Hono')]);
    expect((await repo.list()).map((e) => e.term).sort()).toEqual(['Hono', 'Tauri', 'Zustand']);
  });
});
