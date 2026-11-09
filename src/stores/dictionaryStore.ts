import { create } from 'zustand';
import { repositories } from '@/services/storage';
import { emitChange } from '@/services/storage/changeBus';
import type { DictionaryEntry } from '@/types/history';

interface State { entries: DictionaryEntry[]; load(): Promise<void>; add(term: string, spoken?: string): Promise<void>; remove(id: string): Promise<void> }

export const useDictionaryStore = create<State>((set, get) => ({
  entries: [],
  async load() { set({ entries: await repositories.dictionary.list() }); },
  async add(term, spoken) { await repositories.dictionary.add(term, spoken); await get().load(); await emitChange('dictionary'); },
  async remove(id) { await repositories.dictionary.remove(id); await get().load(); await emitChange('dictionary'); },
}));
