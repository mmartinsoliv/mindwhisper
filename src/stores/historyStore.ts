import { create } from 'zustand';
import { repositories } from '@/services/storage';
import { emitChange } from '@/services/storage/changeBus';
import type { HistoryEntry } from '@/types/history';
import { useSettingsStore } from './settingsStore';

interface State { entries: HistoryEntry[]; query: string; load(): Promise<void>; setQuery(q: string): void; remove(id: string): Promise<void>; clearAll(): Promise<void> }

export const useHistoryStore = create<State>((set, get) => ({
  entries: [], query: '',
  async load() {
    await repositories.history.prune(useSettingsStore.getState().settings.history);
    set({ entries: await repositories.history.list(get().query) });
  },
  setQuery(q) { set({ query: q }); void get().load(); },
  async remove(id) { await repositories.history.delete(id); await get().load(); await emitChange('history'); },
  async clearAll() { await repositories.history.clear(); await get().load(); await emitChange('history'); },
}));
