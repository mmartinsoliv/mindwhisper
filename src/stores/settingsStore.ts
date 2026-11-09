import { create } from 'zustand';
import { repositories } from '@/services/storage';
import { emitChange } from '@/services/storage/changeBus';
import { DEFAULT_SETTINGS, mergeSettings, type DeepPartial, type Settings } from '@/types/settings';

interface State { settings: Settings; loaded: boolean; load(): Promise<void>; update(patch: DeepPartial<Settings>): Promise<void> }

// Deliberately no theme/DOM work here: `applyTheme` lives in Task 4's files (another track). Windows subscribe
// to this store and call `applyTheme(settings.theme)` themselves (Tasks 13 and 14).
export const useSettingsStore = create<State>((set, get) => ({
  settings: DEFAULT_SETTINGS, loaded: false,
  async load() { set({ settings: await repositories.settings.load(), loaded: true }); },
  async update(patch) {
    const next = mergeSettings(get().settings, patch);
    await repositories.settings.save(next);
    set({ settings: next });
    await emitChange('settings');
  },
}));
