import { emit, listen } from '@tauri-apps/api/event';
import { EVENTS, type DictationCommand, type HotkeyAction } from '@/types/ipc';
import type { DictationSnapshot } from '@/types/dictation';
import type { Unsubscribe } from '@/types/ports';

export const publishSnapshot = (s: DictationSnapshot) => emit(EVENTS.state, s);
export const sendCommand = (c: DictationCommand) => emit(EVENTS.command, c);

async function on<T>(name: string, cb: (p: T) => void): Promise<Unsubscribe> {
  const un = await listen<T>(name, (e) => cb(e.payload));
  return () => un();
}
export const listenSnapshots = (cb: (s: DictationSnapshot) => void) => on<DictationSnapshot>(EVENTS.state, cb);
export const listenCommands = (cb: (c: DictationCommand) => void) => on<DictationCommand>(EVENTS.command, cb);
export const listenHotkeys = (cb: (a: HotkeyAction) => void) => on<{ action: HotkeyAction }>(EVENTS.hotkey, (p) => cb(p.action));
