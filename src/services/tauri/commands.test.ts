import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
const listen = vi.fn();
vi.mock('@tauri-apps/api/event', () => ({ listen: (...a: unknown[]) => listen(...a), emit: vi.fn() }));

import { commands, CommandError, isAppError } from './commands';
import { TauriAudioPort } from '@/services/audio/TauriAudioPort';
import { TauriInsertionService } from '@/services/insertion/TauriInsertionService';
import { EVENTS } from '@/types/ipc';

beforeEach(() => { invoke.mockReset(); listen.mockReset(); });

describe('commands', () => {
  it('uses the exact command names and camelCase argument keys from the spec', async () => {
    invoke.mockResolvedValue(undefined);
    await commands.audioStart('mic-1');
    expect(invoke).toHaveBeenLastCalledWith('audio_start', { deviceId: 'mic-1' });
    await commands.insertText('hi', true);
    expect(invoke).toHaveBeenLastCalledWith('insert_text', { text: 'hi', restoreClipboard: true });
    await commands.shortcutRegister('Alt+F9', 'hold');
    expect(invoke).toHaveBeenLastCalledWith('shortcut_register', { accelerator: 'Alt+F9', mode: 'hold' });
    await commands.shortcutSetCancelEnabled(true);
    expect(invoke).toHaveBeenLastCalledWith('shortcut_set_cancel_enabled', { enabled: true });
    await commands.overlayResize(320, 120);
    expect(invoke).toHaveBeenLastCalledWith('overlay_resize', { width: 320, height: 120 });
    await commands.openSystemSettings('accessibility');
    expect(invoke).toHaveBeenLastCalledWith('open_system_settings', { pane: 'accessibility' });
  });
  it('audioStop returns the WAV bytes as a Uint8Array', async () => {
    invoke.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const out = await commands.audioStop();
    expect(out).toBeInstanceOf(Uint8Array);
    expect([...out]).toEqual([1, 2, 3]);
  });
  it('rethrows Tauri error objects as CommandError and wraps unknown failures', async () => {
    invoke.mockRejectedValueOnce({ code: 'no_input_device', message: 'No microphone found.' });
    const e = await commands.audioStart().catch((x) => x);
    expect(e).toBeInstanceOf(CommandError);
    expect(e).toMatchObject({ code: 'no_input_device', message: 'No microphone found.' });
    expect(isAppError(e)).toBe(true);
    invoke.mockRejectedValueOnce('weird');
    expect(await commands.audioStart().catch((x) => x)).toMatchObject({ code: 'internal' });
  });
});

describe('TauriAudioPort', () => {
  it('subscribes to level/error/limit events and unsubscribes', async () => {
    const off = vi.fn();
    let levelCb: (e: { payload: { rms: number } }) => void = () => {};
    listen.mockImplementation(async (name: string, cb: never) => { if (name === EVENTS.audioLevel) levelCb = cb; return off; });
    const port = new TauriAudioPort();
    const seen: number[] = [];
    const un = port.onLevel((r) => seen.push(r));
    await Promise.resolve();
    levelCb({ payload: { rms: 0.4 } });
    expect(seen).toEqual([0.4]);
    un(); await Promise.resolve();
    expect(off).toHaveBeenCalled();
    port.onError(() => {}); port.onLimit(() => {});
    expect(listen.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining([EVENTS.audioLevel, EVENTS.audioError, EVENTS.audioLimit]));
  });
  it('delegates start/stop/cancel/probe/listDevices to commands', async () => {
    invoke.mockResolvedValue(undefined);
    const port = new TauriAudioPort();
    await port.start('m'); await port.cancel(); await port.probe(); await port.listDevices();
    expect(invoke.mock.calls.map((c) => c[0])).toEqual(['audio_start', 'audio_cancel', 'audio_probe', 'audio_list_devices']);
  });
});

describe('TauriInsertionService', () => {
  it('invokes insert_text and returns the result', async () => {
    invoke.mockResolvedValue({ clipboardRestored: true });
    expect(await new TauriInsertionService().insert('hello', true)).toEqual({ clipboardRestored: true });
  });
});
