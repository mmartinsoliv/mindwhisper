import { emit as tauriEmit, listen } from '@tauri-apps/api/event';
import { EVENTS } from '@/types/ipc';
import type { Unsubscribe } from '@/types/ports';

export type ChangeName = 'settings' | 'history' | 'dictionary';
const EVENT = { settings: EVENTS.settingsChanged, history: EVENTS.historyChanged, dictionary: EVENTS.dictionaryChanged } as const;
const local = new Map<ChangeName, Set<() => void>>();

export async function emitChange(name: ChangeName): Promise<void> {
  local.get(name)?.forEach((cb) => cb());
  try { await tauriEmit(EVENT[name]); } catch { /* not running inside Tauri (tests, plain browser) */ }
}

export async function onChange(name: ChangeName, cb: () => void): Promise<Unsubscribe> {
  const set = local.get(name) ?? new Set();
  set.add(cb); local.set(name, set);
  let un: (() => void) | undefined;
  try { un = await listen(EVENT[name], () => cb()); } catch { /* not in Tauri */ }
  return () => { set.delete(cb); un?.(); };
}
