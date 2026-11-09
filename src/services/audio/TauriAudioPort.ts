import { listen } from '@tauri-apps/api/event';
import { EVENTS, type AppError } from '@/types/ipc';
import type { AudioPort, Unsubscribe } from '@/types/ports';
import { commands } from '@/services/tauri/commands';

function sub<T>(name: string, cb: (payload: T) => void): Unsubscribe {
  const p = listen<T>(name, (e) => cb(e.payload));
  return () => { void p.then((un) => un()); };
}

export class TauriAudioPort implements AudioPort {
  listDevices = () => commands.audioListDevices();
  probe = (id?: string | null) => commands.audioProbe(id);
  start = (id?: string | null) => commands.audioStart(id);
  stop = () => commands.audioStop();
  cancel = () => commands.audioCancel();
  onLevel = (cb: (rms: number) => void) => sub<{ rms: number }>(EVENTS.audioLevel, (p) => cb(p.rms));
  onError = (cb: (e: AppError) => void) => sub<AppError>(EVENTS.audioError, cb);
  onLimit = (cb: () => void) => sub<unknown>(EVENTS.audioLimit, () => cb());
}
