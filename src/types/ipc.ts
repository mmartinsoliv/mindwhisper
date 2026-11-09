export interface AppError { code: string; message: string }
export type HotkeyAction = 'toggle' | 'start' | 'stop' | 'cancel';

export const EVENTS = {
  audioLevel: 'audio://level',
  audioError: 'audio://error',
  audioLimit: 'audio://limit-reached',
  hotkey: 'dictation://hotkey',
  state: 'dictation://state',
  command: 'dictation://command',
  settingsChanged: 'settings://changed',
  historyChanged: 'history://changed',
  shortcutStatus: 'shortcut://status',
  dictionaryChanged: 'dictionary://changed',
} as const;

export type DictationCommand = { type: 'toggle' | 'cancel' | 'retry' | 'dismiss' };
export interface AudioDevice { id: string; name: string; isDefault: boolean }
export interface PermissionStatus { platform: 'macos' | 'windows' | 'linux'; accessibility: 'granted' | 'denied' | 'unsupported' }
