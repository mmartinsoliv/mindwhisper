import type { AppError, AudioDevice } from './ipc';

export type Unsubscribe = () => void;

export interface AudioPort {
  listDevices(): Promise<AudioDevice[]>;
  probe(deviceId?: string | null): Promise<void>;
  start(deviceId?: string | null): Promise<void>;
  stop(): Promise<Uint8Array>;
  cancel(): Promise<void>;
  onLevel(cb: (rms: number) => void): Unsubscribe;
  onError(cb: (e: AppError) => void): Unsubscribe;
  onLimit(cb: () => void): Unsubscribe;
}

export interface InsertionPort {
  insert(text: string, restoreClipboard: boolean): Promise<{ clipboardRestored: boolean }>;
}

export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}
