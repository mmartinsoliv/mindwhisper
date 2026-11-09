import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictationController, type ControllerDeps } from './DictationController';
import { TranscriptionService } from '@/services/transcription/TranscriptionService';
import { MockTranscriptionProvider } from '@/services/transcription/MockTranscriptionProvider';
import { ProviderError } from '@/services/transcription/TranscriptionProvider';
import { CleanupService, type CleanupProvider } from '@/services/text-processing/CleanupService';
import { CommandError } from '@/services/tauri/commands';
import { DEFAULT_SETTINGS, mergeSettings, type DeepPartial, type Settings } from '@/types/settings';
import type { AudioPort, InsertionPort } from '@/types/ports';
import type { DictionaryEntry, HistoryEntry } from '@/types/history';
import type { DictationSnapshot } from '@/types/dictation';

class FakeAudio implements AudioPort {
  started = 0; cancelled = 0; stopped = 0;
  startImpl: () => Promise<void> = async () => {};
  stopImpl: () => Promise<Uint8Array> = async () => new Uint8Array(44 + 3200);
  private lv: ((r: number) => void)[] = []; private er: ((e: { code: string; message: string }) => void)[] = []; private li: (() => void)[] = [];
  async listDevices() { return []; } async probe() {}
  async start() { this.started++; await this.startImpl(); }
  async stop() { this.stopped++; return this.stopImpl(); }
  async cancel() { this.cancelled++; }
  onLevel(cb: (r: number) => void) { this.lv.push(cb); return () => {}; }
  onError(cb: (e: { code: string; message: string }) => void) { this.er.push(cb); return () => {}; }
  onLimit(cb: () => void) { this.li.push(cb); return () => {}; }
  emitLevel(r: number) { this.lv.forEach((f) => f(r)); } emitError(code: string, message: string) { this.er.forEach((f) => f({ code, message })); } emitLimit() { this.li.forEach((f) => f()); }
}

function setup(over: { settings?: DeepPartial<Settings>; stt?: MockTranscriptionProvider; llm?: CleanupProvider; dictionary?: DictionaryEntry[]; inserter?: InsertionPort; addHistory?: ControllerDeps['addHistory'] } = {}) {
  const audio = new FakeAudio();
  const stt = over.stt ?? new MockTranscriptionProvider({ text: 'um hey john' });
  const llm: CleanupProvider = over.llm ?? { cleanup: async () => 'Hey John.' };
  const inserted: string[] = [];
  const inserter: InsertionPort = over.inserter ?? { insert: async (t) => { inserted.push(t); return { clipboardRestored: true }; } };
  const history: HistoryEntry[] = [];
  let n = 0;
  const settings = mergeSettings(DEFAULT_SETTINGS, { showPreview: false, ...over.settings });
  const deps: ControllerDeps = {
    audio, transcription: new TranscriptionService(stt), cleanup: new CleanupService(llm), inserter,
    getSettings: () => settings, getDictionary: () => over.dictionary ?? [],
    addHistory: over.addHistory ?? (async (e) => { history.push(e); }), now: () => 1_000, newId: () => `s${++n}`, completedDelayMs: 1200, previewDelayMs: 600,
  };
  const c = new DictationController(deps);
  const states: string[] = [];
  c.subscribe((s: DictationSnapshot) => states.push(s.state));
  return { c, audio, stt, inserted, history, states, deps };
}
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('happy path', () => {
  it('records, transcribes, cleans, inserts once, saves history, then returns to idle', async () => {
    const { c, audio, inserted, history, states } = setup();
    await c.toggle();
    expect(c.getSnapshot()).toMatchObject({ state: 'recording', sessionId: 's1' });
    audio.emitLevel(0.7);
    expect(c.getSnapshot().level).toBe(0.7);
    await c.toggle();
    await flush();
    expect(inserted).toEqual(['Hey John.']);
    expect(c.getSnapshot()).toMatchObject({ state: 'completed', rawText: 'um hey john', finalText: 'Hey John.' });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ rawText: 'um hey john', finalText: 'Hey John.', language: 'auto', style: 'minimal' });
    await vi.advanceTimersByTimeAsync(1200);
    expect(c.getSnapshot().state).toBe('idle');
    expect(states).toEqual(['recording', 'recording', 'processing', 'processing', 'inserting', 'completed', 'idle']);
  });
  it('passes language and dictionary vocabulary to transcription', async () => {
    const { c, stt } = setup({ settings: { language: 'pt-BR' }, dictionary: [{ id: '1', term: 'Tauri' }] });
    await c.toggle(); await c.toggle(); await flush();
    expect(stt.calls[0]!.options).toMatchObject({ language: 'pt-BR', vocabulary: ['Tauri'] });
  });
  it('waits for the preview delay before inserting when showPreview is on', async () => {
    const { c, inserted } = setup({ settings: { showPreview: true } });
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot()).toMatchObject({ state: 'inserting', finalText: 'Hey John.' });
    expect(inserted).toEqual([]);
    await vi.advanceTimersByTimeAsync(600);
    expect(inserted).toEqual(['Hey John.']);
  });
  it('skips history when it is disabled (privacy)', async () => {
    const { c, history } = setup({ settings: { history: { enabled: false } } });
    await c.toggle(); await c.toggle(); await flush();
    expect(history).toEqual([]);
  });
  it('inserts the raw transcript with the dictionary applied when cleanup is disabled', async () => {
    const { c, inserted } = setup({ settings: { cleanup: { enabled: false } }, dictionary: [{ id: '1', term: 'John' }] });
    await c.toggle(); await c.toggle(); await flush();
    expect(inserted).toEqual(['um hey John']);
  });
});

describe('no concurrent sessions', () => {
  it('start() while recording or processing does not open a second recording', async () => {
    const { c, audio } = setup({ stt: new MockTranscriptionProvider({ delayMs: 500 }) });
    await c.start(); await c.start();
    expect(audio.started).toBe(1);
    await c.stop();
    await c.start();
    expect(audio.started).toBe(1);
    await c.toggle(); // toggle during processing is ignored
    expect(c.getSnapshot().state).toBe('processing');
  });
  it('a hotkey after completion starts a fresh session immediately', async () => {
    const { c, audio } = setup();
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot().state).toBe('completed');
    await c.toggle();
    expect(c.getSnapshot()).toMatchObject({ state: 'recording', sessionId: 's2' });
    expect(audio.started).toBe(2);
  });
});

describe('failures', () => {
  it('microphone start failure → error(record), not retryable, nothing inserted', async () => {
    const { c, audio, inserted } = setup();
    audio.startImpl = async () => { throw new CommandError('no_input_device', 'No microphone found.'); };
    await c.toggle();
    expect(c.getSnapshot()).toMatchObject({ state: 'error', error: { stage: 'record', retryable: false } });
    expect(c.getSnapshot().error!.message).toMatch(/microphone/i);
    expect(inserted).toEqual([]);
  });
  it('device lost mid-recording → error(record) and the microphone is released', async () => {
    const { c, audio } = setup();
    await c.toggle();
    audio.emitError('device_error', 'The microphone was disconnected.');
    await flush();
    expect(c.getSnapshot()).toMatchObject({ state: 'error', error: { stage: 'record' } });
    expect(audio.cancelled).toBe(1);
  });
  it('recording cap event stops and processes the recording', async () => {
    const { c, audio, inserted } = setup();
    await c.toggle();
    audio.emitLimit();
    await flush();
    expect(inserted).toEqual(['Hey John.']);
  });
  it('transcription failure → retryable error; retry reuses the same audio and inserts exactly once', async () => {
    const stt = new MockTranscriptionProvider({ results: ['', 'hello'] });
    const { c, audio, inserted } = setup({ stt, llm: { cleanup: async (r) => r.text } });
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot()).toMatchObject({ state: 'error', error: { stage: 'transcribe', retryable: true } });
    expect(c.getSnapshot().error!.message).toMatch(/no speech/i);
    await c.retry(); await flush();
    expect(inserted).toEqual(['hello']);
    expect(audio.started).toBe(1);
    expect(stt.calls).toHaveLength(2);
  });
  it('provider outage surfaces the provider message', async () => {
    const stt = new MockTranscriptionProvider({ failWith: new ProviderError('The speech service timed out. Try again.', 'timeout', true) });
    const { c } = setup({ stt });
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot().error).toEqual({ stage: 'transcribe', message: 'The speech service timed out. Try again.', retryable: true });
  });
  it('cleanup failure falls back to the raw transcript and still inserts', async () => {
    const { c, inserted } = setup({ llm: { cleanup: async () => { throw new Error('llm down'); } } });
    await c.toggle(); await c.toggle(); await flush();
    expect(inserted).toEqual(['um hey john']);
    expect(c.getSnapshot().state).toBe('completed');
  });
  it('insertion failure → error(insert); retry inserts the same final text once', async () => {
    let attempts = 0; const pasted: string[] = [];
    const inserter: InsertionPort = { insert: async (t) => { attempts++; if (attempts === 1) throw new CommandError('permission_denied', 'no accessibility'); pasted.push(t); return { clipboardRestored: true }; } };
    const { c } = setup({ inserter });
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot()).toMatchObject({ state: 'error', error: { stage: 'insert', retryable: true }, finalText: 'Hey John.' });
    expect(c.getSnapshot().error!.message).toMatch(/accessibility/i);
    await Promise.all([c.retry(), c.retry()]); await flush(); // double-click on Retry
    expect(pasted).toEqual(['Hey John.']);
    expect(attempts).toBe(2);
  });
});

describe('cancellation', () => {
  it('cancel while recording releases the microphone and returns to idle', async () => {
    const { c, audio, inserted } = setup();
    await c.toggle();
    await c.cancel();
    expect(c.getSnapshot().state).toBe('idle');
    expect(audio.cancelled).toBe(1);
    await c.toggle();
    expect(c.getSnapshot().state).toBe('recording'); // can record again
    expect(inserted).toEqual([]);
  });
  it('cancel while processing aborts the request and never inserts', async () => {
    const stt = new MockTranscriptionProvider({ delayMs: 1000 });
    const { c, inserted } = setup({ stt });
    await c.toggle(); await c.toggle();
    expect(c.getSnapshot().state).toBe('processing');
    await c.cancel();
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.getSnapshot().state).toBe('idle');
    expect(inserted).toEqual([]);
  });
  it('cancel while the microphone is still starting releases it once it opens', async () => {
    const { c, audio } = setup();
    let release: () => void = () => {};
    audio.startImpl = () => new Promise<void>((r) => { release = r; });
    const starting = c.start();
    await c.cancel();
    release(); await starting; await flush();
    expect(c.getSnapshot().state).toBe('idle');
    expect(audio.cancelled).toBeGreaterThanOrEqual(2); // once by cancel(), once after the late open
  });
  it('dismiss clears an error and drops the buffered audio', async () => {
    const stt = new MockTranscriptionProvider({ text: '' });
    const { c } = setup({ stt });
    await c.toggle(); await c.toggle(); await flush();
    await c.dismiss();
    expect(c.getSnapshot().state).toBe('idle');
    await c.retry(); // nothing to retry
    expect(c.getSnapshot().state).toBe('idle');
  });
});

describe('dispose', () => {
  it('stops reacting to audio events and timers', async () => {
    const { c, audio } = setup();
    c.dispose();
    await c.start().catch(() => {});
    audio.emitLevel(1);
    expect(c.getSnapshot().level ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('review round 1: races and containment', () => {
  it('a stale mic-open does not release a newer session', async () => {
    const { c, audio } = setup();
    const releases: (() => void)[] = [];
    audio.startImpl = () => new Promise<void>((r) => { releases.push(r); });
    const first = c.start();
    await c.cancel();
    expect(audio.cancelled).toBe(1);
    const second = c.start();
    expect(c.getSnapshot()).toMatchObject({ state: 'recording', sessionId: 's2' });
    releases[0]!(); await first; await flush();
    expect(audio.cancelled).toBe(1); // the late open of session 1 must not touch session 2's microphone
    expect(c.getSnapshot()).toMatchObject({ state: 'recording', sessionId: 's2' });
    releases[1]!(); await second; await flush();
    expect(audio.cancelled).toBe(1);
    expect(c.getSnapshot().state).toBe('recording');
  });
  it('a late open releases the device when the newer session already failed (no live session owns it)', async () => {
    const { c, audio } = setup();
    const releases: (() => void)[] = [];
    let failSecond: (e: Error) => void = () => {};
    let call = 0;
    audio.startImpl = () => new Promise<void>((resolve, reject) => {
      if (++call === 1) releases.push(resolve); else failSecond = reject;
    });
    const first = c.start();
    await c.cancel();
    const second = c.start();
    failSecond(new CommandError('already_recording', 'busy')); await second;
    expect(c.getSnapshot().state).toBe('error');
    const before = audio.cancelled;
    releases[0]!(); await first; await flush();
    expect(audio.cancelled).toBe(before + 1); // session 1's late open is released: nobody owns the device
    audio.startImpl = async () => {};
    await c.toggle();
    expect(c.getSnapshot()).toMatchObject({ state: 'recording', sessionId: 's3' });
  });
  it('a late open releases the device when the newer session was cancelled too', async () => {
    const { c, audio } = setup();
    const releases: (() => void)[] = [];
    audio.startImpl = () => new Promise<void>((r) => { releases.push(r); });
    const first = c.start();
    await c.cancel();
    const second = c.start();
    await c.cancel();
    expect(c.getSnapshot().state).toBe('idle');
    const before = audio.cancelled;
    releases[0]!(); await first; releases[1]!(); await second; await flush();
    expect(audio.cancelled).toBe(before + 2);
    expect(c.getSnapshot().state).toBe('idle');
  });
  it('audio.start() failure releases the microphone', async () => {
    const { c, audio } = setup();
    audio.startImpl = async () => { throw new CommandError('no_input_device', 'none'); };
    await c.toggle();
    expect(c.getSnapshot()).toMatchObject({ state: 'error', error: { stage: 'record' } });
    expect(audio.cancelled).toBe(1);
  });
  it('audio.stop() failure → error(record) and the microphone is released', async () => {
    const { c, audio, inserted } = setup();
    audio.stopImpl = async () => { throw new CommandError('device_error', 'lost'); };
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot()).toMatchObject({ state: 'error', error: { stage: 'record', retryable: false } });
    expect(audio.cancelled).toBe(1);
    expect(inserted).toEqual([]);
  });
  it('a failing audio.stop() of an old session does not release a newer session', async () => {
    const { c, audio } = setup();
    let reject: (e: Error) => void = () => {};
    audio.stopImpl = () => new Promise<Uint8Array>((_r, rej) => { reject = rej; });
    await c.toggle();
    const stopping = c.toggle(); // audio.stop() stays pending
    await c.cancel();
    expect(audio.cancelled).toBe(1);
    audio.stopImpl = async () => new Uint8Array(44);
    await c.toggle();
    expect(c.getSnapshot()).toMatchObject({ state: 'recording', sessionId: 's2' });
    reject(new Error('late')); await stopping; await flush();
    expect(audio.cancelled).toBe(1);
    expect(c.getSnapshot().state).toBe('recording');
  });
  it('getSettings() throwing inside the pipeline becomes a retryable error, not an unhandled rejection', async () => {
    const { c, deps } = setup();
    await c.toggle();
    deps.getSettings = () => { throw new Error('settings broke'); };
    await c.toggle(); await flush();
    expect(c.getSnapshot()).toMatchObject({ state: 'error', error: { stage: 'transcribe', retryable: true } });
  });
  it('a throwing subscriber never breaks the controller', async () => {
    const { c, inserted } = setup();
    c.subscribe(() => { throw new Error('bad subscriber'); });
    await c.toggle(); await c.toggle(); await flush();
    expect(inserted).toEqual(['Hey John.']);
    expect(c.getSnapshot().state).toBe('completed');
  });
  it('still saves history when the paste finished after a cancel (the text was pasted)', async () => {
    let release: () => void = () => {}; const pasted: string[] = [];
    const inserter: InsertionPort = { insert: (t) => new Promise((r) => { pasted.push(t); release = () => r({ clipboardRestored: true }); }) };
    const { c, history } = setup({ inserter });
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot().state).toBe('inserting');
    await c.cancel();
    release(); await flush();
    expect(pasted).toEqual(['Hey John.']);
    expect(history).toHaveLength(1);
    expect(c.getSnapshot().state).toBe('idle');
  });
  it('does not save history for a late paste when history is disabled', async () => {
    let release: () => void = () => {};
    const inserter: InsertionPort = { insert: () => new Promise((r) => { release = () => r({ clipboardRestored: true }); }) };
    const { c, history } = setup({ inserter, settings: { history: { enabled: false } } });
    await c.toggle(); await c.toggle(); await flush();
    await c.cancel();
    release(); await flush();
    expect(history).toEqual([]);
  });
  it('cancel while the dictionary is loading never calls transcription', async () => {
    const { c, stt, deps } = setup();
    let resolve: (v: DictionaryEntry[]) => void = () => {};
    deps.getDictionary = () => new Promise<DictionaryEntry[]>((r) => { resolve = r; });
    await c.toggle(); await c.toggle(); await flush();
    await c.cancel();
    resolve([]); await flush();
    expect(stt.calls).toHaveLength(0);
    expect(c.getSnapshot().state).toBe('idle');
  });
  it('dispose while history is saving leaves no completion timer behind', async () => {
    let release: () => void = () => {};
    const { c } = setup({ addHistory: () => new Promise<void>((r) => { release = r; }) });
    await c.toggle(); await c.toggle(); await flush();
    expect(c.getSnapshot().state).toBe('completed');
    c.dispose();
    release(); await flush();
    expect(vi.getTimerCount()).toBe(0);
  });
});
