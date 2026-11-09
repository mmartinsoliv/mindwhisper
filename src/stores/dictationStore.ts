import { create } from 'zustand';
import { listenSnapshots, sendCommand } from '@/services/dictation/bridge';
import { IDLE_SNAPSHOT, type DictationSnapshot } from '@/types/dictation';
import type { DictationCommand } from '@/types/ipc';
import type { Unsubscribe } from '@/types/ports';

interface State { snapshot: DictationSnapshot; init(): Promise<Unsubscribe>; send(c: DictationCommand): Promise<void> }

export const useDictationStore = create<State>((set) => ({
  snapshot: IDLE_SNAPSHOT,
  init: () => listenSnapshots((snapshot) => set({ snapshot })),
  send: (c) => sendCommand(c),
}));
