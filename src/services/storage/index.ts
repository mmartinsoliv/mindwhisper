import { DictionaryRepository } from './DictionaryRepository';
import { HistoryRepository } from './HistoryRepository';
import { TauriKeyValueStore } from './KeyValueStore';
import { SettingsRepository } from './SettingsRepository';

type Repos = { settings: SettingsRepository; history: HistoryRepository; dictionary: DictionaryRepository };
export let repositories: Repos = {
  settings: new SettingsRepository(new TauriKeyValueStore('settings.json')),
  history: new HistoryRepository(new TauriKeyValueStore('history.json')),
  dictionary: new DictionaryRepository(new TauriKeyValueStore('dictionary.json')),
};
export function setRepositories(r: Repos): void { repositories = r; }
export * from './deleteAllUserData';
export { MemoryKeyValueStore, TauriKeyValueStore } from './KeyValueStore';
export { SettingsRepository } from './SettingsRepository';
export { HistoryRepository } from './HistoryRepository';
export { DictionaryRepository } from './DictionaryRepository';
export { emitChange, onChange } from './changeBus';
