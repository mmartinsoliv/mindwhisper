import { invoke } from '@tauri-apps/api/core';
import type { AppError, AudioDevice, PermissionStatus } from '@/types/ipc';

export class CommandError extends Error implements AppError {
  constructor(readonly code: string, message: string) { super(message); this.name = 'CommandError'; }
}
export const isAppError = (e: unknown): e is AppError =>
  typeof e === 'object' && e !== null && typeof (e as AppError).code === 'string' && typeof (e as AppError).message === 'string';

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try { return await invoke<T>(cmd, args); }
  catch (e) { throw isAppError(e) ? new CommandError(e.code, e.message) : new CommandError('internal', typeof e === 'string' ? e : 'Unexpected error.'); }
}

export const commands = {
  audioListDevices: () => call<AudioDevice[]>('audio_list_devices'),
  audioProbe: (deviceId?: string | null) => call<void>('audio_probe', { deviceId: deviceId ?? null }),
  audioStart: (deviceId?: string | null) => call<void>('audio_start', { deviceId: deviceId ?? null }),
  audioStop: async () => new Uint8Array(await call<ArrayBuffer>('audio_stop')),
  audioCancel: () => call<void>('audio_cancel'),
  insertText: (text: string, restoreClipboard: boolean) => call<{ clipboardRestored: boolean }>('insert_text', { text, restoreClipboard }),
  checkPermissions: () => call<PermissionStatus>('check_permissions'),
  openSystemSettings: (pane: 'accessibility' | 'microphone') => call<void>('open_system_settings', { pane }),
  shortcutRegister: (accelerator: string, mode: 'toggle' | 'hold') => call<void>('shortcut_register', { accelerator, mode }),
  shortcutUnregister: () => call<void>('shortcut_unregister'),
  shortcutStatus: () => call<AppError | null>('shortcut_status'),
  shortcutSetCancelEnabled: (enabled: boolean) => call<void>('shortcut_set_cancel_enabled', { enabled }),
  overlayShow: () => call<void>('overlay_show'),
  overlayHide: () => call<void>('overlay_hide'),
  overlayResize: (width: number, height: number) => call<void>('overlay_resize', { width, height }),
  mainShow: () => call<void>('main_show'),
};
