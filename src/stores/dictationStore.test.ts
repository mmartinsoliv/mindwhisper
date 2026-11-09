import { beforeEach, describe, expect, it, vi } from 'vitest';

let snapshotCb: (s: unknown) => void = () => {};
const sendCommand = vi.fn(async (_c: unknown) => {});
vi.mock('@/services/dictation/bridge', () => ({
  listenSnapshots: vi.fn(async (cb: (s: unknown) => void) => { snapshotCb = cb; return () => {}; }),
  sendCommand: (c: unknown) => sendCommand(c),
}));

import { useDictationStore } from './dictationStore';
import { IDLE_SNAPSHOT } from '@/types/dictation';

beforeEach(() => { useDictationStore.setState({ snapshot: IDLE_SNAPSHOT }); sendCommand.mockClear(); });

describe('dictationStore', () => {
  it('mirrors snapshots published by the overlay window', async () => {
    const un = await useDictationStore.getState().init();
    snapshotCb({ state: 'recording', sessionId: 's1', level: 0.3 });
    expect(useDictationStore.getState().snapshot).toMatchObject({ state: 'recording', level: 0.3 });
    un();
  });
  it('forwards commands to the overlay window', async () => {
    await useDictationStore.getState().send({ type: 'toggle' });
    expect(sendCommand).toHaveBeenCalledWith({ type: 'toggle' });
  });
});
