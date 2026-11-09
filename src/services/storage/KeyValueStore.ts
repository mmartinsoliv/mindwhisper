import { load, type Store } from '@tauri-apps/plugin-store';
import type { KeyValueStore } from '@/types/ports';

export class MemoryKeyValueStore implements KeyValueStore {
  private m = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> { return this.m.has(key) ? (structuredClone(this.m.get(key)) as T) : undefined; }
  async set<T>(key: string, value: T): Promise<void> { this.m.set(key, structuredClone(value)); }
  async delete(key: string): Promise<void> { this.m.delete(key); }
  clearAll(): void { this.m.clear(); }
}

/** JSON file in the app data dir via tauri-plugin-store. Nothing touches Tauri until the first call. */
export class TauriKeyValueStore implements KeyValueStore {
  private store: Promise<Store> | null = null;
  constructor(private readonly file: 'settings.json' | 'history.json' | 'dictionary.json') {}
  private open(): Promise<Store> {
    // Adapt the options object to the installed @tauri-apps/plugin-store typings (`defaults` may be required).
    return (this.store ??= load(this.file, { defaults: {}, autoSave: false }));
  }
  async get<T>(key: string): Promise<T | undefined> { return (await (await this.open()).get<T>(key)) ?? undefined; }
  async set<T>(key: string, value: T): Promise<void> { const s = await this.open(); await s.set(key, value); await s.save(); }
  async delete(key: string): Promise<void> { const s = await this.open(); await s.delete(key); await s.save(); }
}
