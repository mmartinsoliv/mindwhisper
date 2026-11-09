import { migrateSettings, type Settings } from '@/types/settings';
import type { KeyValueStore } from '@/types/ports';

export class SettingsRepository {
  constructor(private readonly kv: KeyValueStore) {}
  async load(): Promise<Settings> { return migrateSettings(await this.kv.get('settings')); }
  async save(s: Settings): Promise<void> { await this.kv.set('settings', s); }
  async reset(): Promise<void> { await this.kv.delete('settings'); }
}
