import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryKeyValueStore } from '@/services/storage/KeyValueStore';
import { SettingsRepository } from '@/services/storage/SettingsRepository';
import { HistoryRepository } from '@/services/storage/HistoryRepository';
import { DictionaryRepository } from '@/services/storage/DictionaryRepository';
import { setRepositories } from '@/services/storage';
import * as bus from '@/services/storage/changeBus';
import { useSettingsStore } from './settingsStore';
import { useHistoryStore } from './historyStore';
import { useDictionaryStore } from './dictionaryStore';
import { initStoreSync } from './sync';
import { DEFAULT_SETTINGS } from '@/types/settings';

let emit: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  setRepositories({ settings: new SettingsRepository(new MemoryKeyValueStore()), history: new HistoryRepository(new MemoryKeyValueStore()), dictionary: new DictionaryRepository(new MemoryKeyValueStore()) });
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: false });
  useHistoryStore.setState({ entries: [], query: '' });
  useDictionaryStore.setState({ entries: [] });
  emit = vi.spyOn(bus, 'emitChange').mockResolvedValue();
});

describe('settingsStore', () => {
  it('loads defaults, then update merges, persists and notifies', async () => {
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().loaded).toBe(true);
    await useSettingsStore.getState().update({ theme: 'dark', cleanup: { style: 'concise' } });
    expect(useSettingsStore.getState().settings.cleanup.style).toBe('concise');
    expect(useSettingsStore.getState().settings.cleanup.enabled).toBe(true);
    expect(emit).toHaveBeenCalledWith('settings');
    await useSettingsStore.getState().load();
    expect(useSettingsStore.getState().settings.theme).toBe('dark');
  });
});

describe('historyStore', () => {
  it('filters by query, removes and clears, notifying each time', async () => {
    const { repositories } = await import('@/services/storage');
    const on = { enabled: true, retentionDays: 30 };
    const base = { rawText: '', language: 'en' as const, style: 'minimal' as const, durationMs: 1, createdAt: Date.now() };
    await repositories.history.add({ ...base, id: 'a', finalText: 'Alpha note' }, on);
    await repositories.history.add({ ...base, id: 'b', finalText: 'Beta note' }, on);
    await useHistoryStore.getState().load();
    expect(useHistoryStore.getState().entries).toHaveLength(2);
    useHistoryStore.getState().setQuery('alpha');
    await vi.waitFor(() => expect(useHistoryStore.getState().entries.map((e) => e.id)).toEqual(['a']));
    await useHistoryStore.getState().remove('a');
    expect(emit).toHaveBeenCalledWith('history');
    await useHistoryStore.getState().clearAll();
    useHistoryStore.getState().setQuery('');
    await vi.waitFor(() => expect(useHistoryStore.getState().entries).toEqual([]));
  });
});

describe('dictionaryStore', () => {
  it('adds and removes terms and notifies', async () => {
    await useDictionaryStore.getState().add('Tauri', 'tow ree');
    expect(useDictionaryStore.getState().entries).toHaveLength(1);
    expect(emit).toHaveBeenCalledWith('dictionary');
    await useDictionaryStore.getState().remove(useDictionaryStore.getState().entries[0]!.id);
    expect(useDictionaryStore.getState().entries).toEqual([]);
  });
});

describe('initStoreSync', () => {
  it('loads all three stores and reloads history when its change event fires', async () => {
    emit.mockRestore();
    const { repositories } = await import('@/services/storage');
    await repositories.dictionary.add('Tauri');
    const off = await initStoreSync();
    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useDictionaryStore.getState().entries).toHaveLength(1);
    expect(useHistoryStore.getState().entries).toEqual([]);

    await repositories.history.add({ id: 'h', createdAt: Date.now(), rawText: 'r', finalText: 'f', language: 'en', style: 'minimal', durationMs: 1 }, { enabled: true, retentionDays: 30 });
    await bus.emitChange('history');
    await vi.waitFor(() => expect(useHistoryStore.getState().entries.map((e) => e.id)).toEqual(['h']));
    off();
  });
});
