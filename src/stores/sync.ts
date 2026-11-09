import { onChange } from '@/services/storage/changeBus';
import type { Unsubscribe } from '@/types/ports';
import { useDictionaryStore } from './dictionaryStore';
import { useHistoryStore } from './historyStore';
import { useSettingsStore } from './settingsStore';

export async function initStoreSync(): Promise<Unsubscribe> {
  await useSettingsStore.getState().load(); // settings first: history pruning reads the retention policy
  await Promise.all([useHistoryStore.getState().load(), useDictionaryStore.getState().load()]);
  const offs = await Promise.all([
    onChange('settings', () => void useSettingsStore.getState().load()),
    onChange('history', () => void useHistoryStore.getState().load()),
    onChange('dictionary', () => void useDictionaryStore.getState().load()),
  ]);
  return () => offs.forEach((o) => o());
}
