import type { DictionaryRepository } from './DictionaryRepository';
import type { HistoryRepository } from './HistoryRepository';
import type { SettingsRepository } from './SettingsRepository';

export async function deleteAllUserData(r: { settings: SettingsRepository; history: HistoryRepository; dictionary: DictionaryRepository }): Promise<void> {
  await Promise.all([r.settings.reset(), r.history.clear(), r.dictionary.clear()]);
}
