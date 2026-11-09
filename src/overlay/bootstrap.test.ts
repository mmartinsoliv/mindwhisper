import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { overlaySizeFor, shortcutChanged, wireOverlayHost } from './bootstrap';
import { DictationController } from '@/services/dictation/DictationController';
import { TranscriptionService } from '@/services/transcription/TranscriptionService';
import { MockTranscriptionProvider } from '@/services/transcription/MockTranscriptionProvider';
import { CleanupService } from '@/services/text-processing/CleanupService';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { IDLE_SNAPSHOT } from '@/types/dictation';
import { ProviderError, type TranscriptionProvider } from '@/services/transcription/TranscriptionProvider';
import type { AudioPort } from '@/types/ports';
import type { HotkeyAction, DictationCommand } from '@/types/ipc';

interface BuildOptions { transcription?: TranscriptionProvider; cleanup?: () => Promise<string>; showPreview?: boolean }

function build(opts: BuildOptions = {}) {
  let levelCb: (rms: number) => void = () => {};
  const audio: AudioPort = { listDevices: async () => [], probe: async () => {}, start: async () => {}, stop: async () => new Uint8Array(44 + 3200), cancel: async () => {}, onLevel: (cb) => { levelCb = cb; return () => {}; }, onError: () => () => {}, onLimit: () => () => {} };
  const inserted: string[] = [];
  const controller = new DictationController({
    audio, transcription: new TranscriptionService(opts.transcription ?? new MockTranscriptionProvider({ text: 'hi' })), cleanup: new CleanupService({ cleanup: opts.cleanup ?? (async () => 'Hi.') }),
    inserter: { insert: async (t) => { inserted.push(t); return { clipboardRestored: true }; } },
    getSettings: () => ({ ...DEFAULT_SETTINGS, showPreview: opts.showPreview ?? false }), getDictionary: () => [], addHistory: async () => {}, now: () => 1, newId: () => 'id', completedDelayMs: 1200,
  });
  let hotkey: (a: HotkeyAction) => void = () => {}; let command: (c: DictationCommand) => void = () => {};
  const commands = { overlayShow: vi.fn(async () => {}), overlayHide: vi.fn(async () => {}), overlayResize: vi.fn(async (_width: number, _height: number) => {}), shortcutSetCancelEnabled: vi.fn(async (_enabled: boolean) => {}) };
  const published: string[] = [];
  const bridge = {
    publishSnapshot: vi.fn(async (s) => { published.push(s.state); }),
    listenHotkeys: vi.fn(async (cb) => { hotkey = cb; return () => {}; }),
    listenCommands: vi.fn(async (cb) => { command = cb; return () => {}; }),
  };
  return { controller, commands, bridge, published, inserted, level: (v: number) => levelCb(v), hotkey: (a: HotkeyAction) => hotkey(a), command: (c: DictationCommand) => command(c) };
}
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('overlaySizeFor', () => {
  it('uses the compact pill by default and grows for preview text and errors', () => {
    expect(overlaySizeFor(IDLE_SNAPSHOT, true)).toEqual({ width: 320, height: 64 });
    expect(overlaySizeFor({ ...IDLE_SNAPSHOT, state: 'recording' }, true)).toEqual({ width: 320, height: 64 });
    expect(overlaySizeFor({ ...IDLE_SNAPSHOT, state: 'processing', rawText: 'x' }, true).height).toBeGreaterThan(64);
    expect(overlaySizeFor({ ...IDLE_SNAPSHOT, state: 'processing', rawText: 'x' }, false).height).toBe(64);
    expect(overlaySizeFor({ ...IDLE_SNAPSHOT, state: 'error', error: { stage: 'transcribe', message: 'm', retryable: true } }, false).height).toBeGreaterThan(64);
  });
});

describe('shortcutChanged', () => {
  it('detects accelerator or mode changes', () => {
    const a = { accelerator: 'Alt+F9', mode: 'toggle' as const };
    expect(shortcutChanged(a, { ...a })).toBe(false);
    expect(shortcutChanged(a, { ...a, mode: 'hold' })).toBe(true);
    expect(shortcutChanged(a, { ...a, accelerator: 'Alt+F8' })).toBe(true);
  });
});

describe('wireOverlayHost', () => {
  it('shows the overlay, arms Escape and publishes snapshots when a hotkey starts recording; hides everything after completion', async () => {
    const t = build();
    const stop = await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush();
    expect(t.commands.overlayShow).toHaveBeenCalled();
    expect(t.commands.shortcutSetCancelEnabled).toHaveBeenLastCalledWith(true);
    t.hotkey('toggle'); await flush();
    expect(t.inserted).toEqual(['Hi.']);
    expect(t.published).toEqual(expect.arrayContaining(['recording', 'processing', 'inserting', 'completed']));
    expect(t.commands.overlayHide).not.toHaveBeenCalled(); // still showing the success state
    await vi.advanceTimersByTimeAsync(1300);
    expect(t.commands.overlayHide).toHaveBeenCalled();
    expect(t.commands.shortcutSetCancelEnabled).toHaveBeenLastCalledWith(false);
    stop();
  });
  it('maps the cancel hotkey and UI commands to the controller', async () => {
    const t = build();
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('start'); await flush();
    expect(t.controller.getSnapshot().state).toBe('recording');
    t.hotkey('cancel'); await flush();
    expect(t.controller.getSnapshot().state).toBe('idle');
    expect(t.commands.overlayHide).toHaveBeenCalled();
    t.command({ type: 'toggle' }); await flush();
    expect(t.controller.getSnapshot().state).toBe('recording');
    t.hotkey('stop'); await flush();
    expect(t.inserted).toEqual(['Hi.']);
  });
  it('resizes to the preview size while text is shown and to the error size on failure', async () => {
    let release: (text: string) => void = () => {};
    const t = build({ showPreview: true, cleanup: () => new Promise<string>((resolve) => { release = resolve; }) });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => true });
    t.hotkey('toggle'); await flush();
    expect(t.commands.overlayResize).toHaveBeenLastCalledWith(320, 64);
    t.hotkey('toggle'); await flush(); await flush();
    expect(t.controller.getSnapshot()).toMatchObject({ state: 'processing', rawText: 'hi' });
    expect(t.commands.overlayResize).toHaveBeenLastCalledWith(320, 100);
    release('Hi.'); await vi.advanceTimersByTimeAsync(2000);
    expect(t.inserted).toEqual(['Hi.']);

    const e = build({ transcription: { transcribe: async () => { throw new ProviderError('The speech service timed out. Try again.', 'timeout', true); } } });
    await wireOverlayHost({ controller: e.controller, commands: e.commands, bridge: e.bridge, getShowPreview: () => true });
    e.hotkey('toggle'); await flush(); e.hotkey('toggle'); await flush(); await flush();
    expect(e.controller.getSnapshot().state).toBe('error');
    expect(e.commands.overlayResize).toHaveBeenLastCalledWith(360, 112);
  });
  it('disarms Escape on error and re-arms it when a retry starts processing again', async () => {
    const transcribe = vi.fn()
      .mockRejectedValueOnce(new ProviderError('The speech service timed out. Try again.', 'timeout', true))
      .mockResolvedValue({ text: 'hi', language: null, durationMs: null, provider: 'mock' });
    const t = build({ transcription: { transcribe } });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    const armed = () => t.commands.shortcutSetCancelEnabled.mock.calls.map((c) => c[0]);
    t.hotkey('toggle'); await flush(); t.hotkey('toggle'); await flush(); await flush();
    expect(t.controller.getSnapshot().state).toBe('error');
    expect(armed()).toEqual([true, false]);
    t.command({ type: 'retry' }); await flush(); await flush();
    expect(armed().slice(0, 3)).toEqual([true, false, true]);
    await vi.advanceTimersByTimeAsync(1300);
    expect(t.inserted).toEqual(['Hi.']);
    expect(armed()).toEqual([true, false, true, false]);
  });
  it('handles a hold-mode release: start then stop inserts', async () => {
    const t = build();
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('start'); await flush();
    expect(t.controller.getSnapshot().state).toBe('recording');
    t.hotkey('stop'); await flush(); await flush();
    expect(t.inserted).toEqual(['Hi.']);
  });
  it('survives native failures: logs only the code and retries show / Escape arming after a backoff, not per snapshot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    t.commands.overlayShow.mockRejectedValueOnce({ code: 'internal', message: 'boom' });
    t.commands.shortcutSetCancelEnabled.mockRejectedValueOnce({ code: 'internal', message: 'boom' });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush();
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(1);
    expect(t.commands.shortcutSetCancelEnabled).toHaveBeenCalledTimes(1);
    t.hotkey('toggle'); await flush(); await flush();
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(1); // a new snapshot alone does not retry
    await vi.advanceTimersByTimeAsync(500);
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(2);
    expect(t.commands.shortcutSetCancelEnabled.mock.calls).toEqual([[true]]); // the session was over before the retry: no stale re-arm, nothing to disarm
    expect(warn).toHaveBeenCalled();
    for (const call of warn.mock.calls) expect(JSON.stringify(call)).not.toMatch(/boom|\\"hi\\"|Hi\\./);
    warn.mockRestore();
  });
  it('does not leak an unhandled rejection when publishing or resizing fails, and retries the resize after a backoff', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    t.bridge.publishSnapshot.mockRejectedValue({ code: 'internal', message: 'x' });
    t.commands.overlayResize.mockRejectedValueOnce({ code: 'internal', message: 'x' });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush();
    t.hotkey('toggle'); await flush(); await flush();
    expect(t.commands.overlayResize).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.commands.overlayResize).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('publishSnapshot'))).toHaveLength(1); // logged once, not per snapshot
    warn.mockRestore();
  });
  it('retries a failed Escape disarm after the last snapshot until it succeeds, then stops', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    let failures = 0;
    t.commands.shortcutSetCancelEnabled.mockImplementation(async (enabled: boolean) => {
      if (!enabled && failures < 2) { failures++; throw { code: 'internal', message: 'x' }; }
    });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush(); t.hotkey('toggle'); await flush(); await flush();
    await vi.advanceTimersByTimeAsync(1300); // completed -> idle: no further snapshots after this
    const disarms = () => t.commands.shortcutSetCancelEnabled.mock.calls.filter((c) => c[0] === false).length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(failures).toBe(2);
    expect(disarms()).toBe(3);
    expect(t.commands.shortcutSetCancelEnabled).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(disarms()).toBe(3);
    warn.mockRestore();
  });
  it('never gives up disarming Escape: backoff is capped at 30 s and retries continue until it succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    let failures = 0;
    t.commands.shortcutSetCancelEnabled.mockImplementation(async (enabled: boolean) => {
      if (!enabled && failures < 8) { failures++; throw { code: 'internal', message: 'x' }; }
    });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush(); t.hotkey('toggle'); await flush(); await flush();
    const disarms = () => t.commands.shortcutSetCancelEnabled.mock.calls.filter((c) => c[0] === false).length;
    await vi.advanceTimersByTimeAsync(500 + 1000 + 2000 + 4000 + 8000 + 16_000 + 30_000 - 1);
    expect(disarms()).toBe(7); // 1 initial + 6 retries so far: the 7th retry waits the capped 30 s
    await vi.advanceTimersByTimeAsync(1);
    expect(disarms()).toBe(8);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(failures).toBe(8);
    expect(disarms()).toBe(9);
    expect(t.commands.shortcutSetCancelEnabled).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(disarms()).toBe(9); // applied: retries stop
    warn.mockRestore();
  });
  it('retries a resize that exhausted its attempts in the next session with the same size', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    let failing = true;
    t.commands.overlayResize.mockImplementation(async () => { if (failing) throw { code: 'internal', message: 'x' }; });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('start'); await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.commands.overlayResize).toHaveBeenCalledTimes(5);
    failing = false;
    t.hotkey('cancel'); await flush();
    t.hotkey('start'); await flush();
    expect(t.commands.overlayResize).toHaveBeenCalledTimes(6);
    expect(t.commands.overlayResize).toHaveBeenLastCalledWith(320, 64);
    warn.mockRestore();
  });
  it('gives up after a bounded number of attempts for a persistently failing call', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    t.commands.overlayShow.mockRejectedValue({ code: 'internal', message: 'x' });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(5);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('overlayShow'))).toHaveLength(5);
    warn.mockRestore();
  });
  it('a failing overlayShow during many level snapshots costs at most one call per backoff step', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    t.commands.overlayShow.mockRejectedValue({ code: 'internal', message: 'x' });
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush();
    for (let i = 0; i < 100; i++) t.level((i % 10) / 10 + 0.01);
    await flush();
    expect(t.published.length).toBeGreaterThan(50);
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('overlayShow'))).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
  it('a late hide failure after a new session started does not make the overlay think it is hidden', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    let rejectHide: (e: unknown) => void = () => {};
    t.commands.overlayHide.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectHide = reject; }));
    await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('start'); await flush();
    t.hotkey('cancel'); await flush(); // idle: hide is now pending
    expect(t.commands.overlayHide).toHaveBeenCalledTimes(1);
    t.hotkey('start'); await flush(); // new session while the hide is still in flight
    rejectHide({ code: 'internal', message: 'x' }); await flush();
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(1); // the window is still shown: no second show
    t.hotkey('cancel'); await flush();
    expect(t.commands.overlayHide).toHaveBeenCalledTimes(2); // and the next idle hides it for real
    warn.mockRestore();
  });
  it('stop() cancels pending retries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = build();
    t.commands.overlayShow.mockRejectedValue({ code: 'internal', message: 'x' });
    const stop = await wireOverlayHost({ controller: t.controller, commands: t.commands, bridge: t.bridge, getShowPreview: () => false });
    t.hotkey('toggle'); await flush();
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(t.commands.overlayShow).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
