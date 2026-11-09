import { CommandError } from '@/services/tauri/commands';
import { ProviderError } from '@/services/transcription/TranscriptionProvider';
import type { CleanupService } from '@/services/text-processing/CleanupService';
import { vocabularyFor } from '@/services/text-processing/dictionary';
import type { TranscriptionService } from '@/services/transcription/TranscriptionService';
import { IDLE_SNAPSHOT, type DictationEvent, type DictationSnapshot, type DictationStage } from '@/types/dictation';
import type { DictionaryEntry, HistoryEntry } from '@/types/history';
import type { AudioPort, InsertionPort, Unsubscribe } from '@/types/ports';
import type { Settings } from '@/types/settings';
import { transition } from './dictationMachine';

export interface ControllerDeps {
  audio: AudioPort; transcription: TranscriptionService; cleanup: CleanupService; inserter: InsertionPort;
  getSettings(): Settings; getDictionary(): Promise<DictionaryEntry[]> | DictionaryEntry[];
  addHistory(e: HistoryEntry): Promise<void>; now(): number; newId(): string;
  completedDelayMs?: number; previewDelayMs?: number;
}

const delay = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const t = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

function friendly(e: unknown, stage: DictationStage): { message: string; retryable: boolean } {
  if (e instanceof ProviderError) return { message: e.message, retryable: e.retryable };
  const code = e instanceof CommandError ? e.code : '';
  if (stage === 'record') {
    if (code === 'no_input_device') return { message: 'No microphone found. Connect one and try again.', retryable: false };
    if (code === 'permission_denied') return { message: 'Microphone access is blocked. Allow it in your system settings.', retryable: false };
    if (code === 'already_recording') return { message: 'Another recording is already running.', retryable: false };
    return { message: 'Could not use the microphone. Check your input device.', retryable: false };
  }
  if (stage === 'insert') {
    if (code === 'permission_denied') return { message: "Couldn't paste into the app. Allow Accessibility access in System Settings, then retry. Your text may be on the clipboard.", retryable: true };
    return { message: "Couldn't paste automatically. Your text may be on the clipboard; paste it manually or retry.", retryable: true };
  }
  return { message: 'Something went wrong while processing your dictation. Try again.', retryable: true };
}

export class DictationController {
  private snap: DictationSnapshot = { ...IDLE_SNAPSHOT };
  private listeners = new Set<(s: DictationSnapshot) => void>();
  private abort = new AbortController();
  private wav: Uint8Array | null = null;
  private insertionStarted = new Set<string>();
  private doneTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubs: Unsubscribe[] = [];
  private disposed = false;

  constructor(private readonly deps: ControllerDeps) {
    this.unsubs.push(
      deps.audio.onLevel((rms) => this.dispatch({ type: 'LEVEL', level: rms })),
      deps.audio.onError((e) => void this.onAudioError(e.message)),
      deps.audio.onLimit(() => void this.stop()),
    );
  }

  getSnapshot(): DictationSnapshot { return this.snap; }
  subscribe(cb: (s: DictationSnapshot) => void): Unsubscribe { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  dispose(): void { this.disposed = true; this.abort.abort(); this.clearTimer(); this.unsubs.forEach((u) => u()); this.listeners.clear(); }

  private dispatch(e: DictationEvent): DictationSnapshot {
    const next = transition(this.snap, e);
    if (next !== this.snap && !this.disposed) {
      this.snap = next;
      for (const l of this.listeners) {
        try { l(next); } catch { /* a throwing subscriber must never break the controller */ }
      }
    }
    return this.snap;
  }
  private clearTimer() { if (this.doneTimer) { clearTimeout(this.doneTimer); this.doneTimer = null; } }
  // Re-reads the snapshot so state checks after an `await` are not narrowed by earlier guards.
  private isState(id: string, state: DictationSnapshot['state']) { const s = this.getSnapshot(); return s.sessionId === id && s.state === state; }
  private live(id: string, signal: AbortSignal) { return !signal.aborted && this.snap.sessionId === id && !this.disposed; }
  private fail(stage: DictationStage, e: unknown, forceRetryable?: boolean) {
    const f = friendly(e, stage);
    this.dispatch({ type: 'FAIL', error: { stage, message: f.message, retryable: forceRetryable ?? f.retryable } });
  }

  async toggle(): Promise<void> {
    const s = this.snap.state;
    if (s === 'recording') return this.stop();
    if (s === 'idle' || s === 'completed' || s === 'error') return this.start();
    // processing / inserting: ignore
  }

  async start(): Promise<void> {
    this.clearTimer();
    if (this.snap.state === 'completed' || this.snap.state === 'error') { this.wav = null; this.dispatch({ type: 'RESET' }); }
    if (this.snap.state !== 'idle') return;
    const id = this.deps.newId();
    this.abort = new AbortController();
    this.dispatch({ type: 'START', sessionId: id, at: this.deps.now() });
    try {
      await this.deps.audio.start(this.deps.getSettings().microphoneId);
    } catch (e) {
      if (this.isState(id, 'recording')) {
        this.fail('record', e, false);
        await this.deps.audio.cancel().catch(() => {}); // a half-open device must not stay held
      }
      return;
    }
    // Cancelled (or failed) while the device was opening: release it, unless a newer session is live and recording,
    // in which case that session owns the microphone. A newer session that already failed or was cancelled owns nothing.
    if (!this.isState(id, 'recording') && this.getSnapshot().state !== 'recording') {
      await this.deps.audio.cancel().catch(() => {});
    }
  }

  async stop(): Promise<void> {
    if (this.snap.state !== 'recording') return;
    const id = this.snap.sessionId!;
    this.dispatch({ type: 'STOP' });
    let wav: Uint8Array;
    try { wav = await this.deps.audio.stop(); }
    catch (e) {
      if (this.isState(id, 'processing')) {
        this.fail('record', e, false);
        await this.deps.audio.cancel().catch(() => {}); // only while this session is current: never release a newer one
      }
      return;
    }
    if (!this.isState(id, 'processing')) return; // cancelled meanwhile
    this.wav = wav;
    this.run(id, 'transcribe');
  }

  /** Detached: callers resolve once the transition is applied; the pipeline reports progress through snapshots. */
  private run(id: string, from: 'transcribe' | 'insert'): void {
    void this.process(id, from).catch((e) => {
      if (this.getSnapshot().sessionId === id && !this.disposed) this.fail(from === 'insert' ? 'insert' : 'transcribe', e);
    });
  }

  private async process(id: string, from: 'transcribe' | 'insert'): Promise<void> {
    const signal = this.abort.signal;
    let stage: DictationStage = from === 'insert' ? 'insert' : 'transcribe';
    try {
      const settings = this.deps.getSettings();
      let rawText = this.snap.rawText ?? '';
      let finalText = this.snap.finalText ?? '';
      let durationMs = 0;
      if (from === 'transcribe') {
        const wav = this.wav;
        const dictionary = await this.deps.getDictionary();
        if (!wav || !this.live(id, signal)) return;
        const res = await this.deps.transcription.transcribe(wav, { language: settings.language, vocabulary: vocabularyFor(dictionary), signal });
        if (!this.live(id, signal)) return;
        rawText = res.text; durationMs = res.durationMs ?? 0;
        this.dispatch({ type: 'TRANSCRIBED', rawText });
        stage = 'cleanup';
        const out = await this.deps.cleanup.cleanup(rawText, { cleanup: settings.cleanup, language: settings.language, dictionary, signal });
        if (!this.live(id, signal)) return;
        finalText = out.text;
        this.dispatch({ type: 'CLEANED', finalText });
        if (settings.showPreview) { await delay(this.deps.previewDelayMs ?? 600, signal); if (!this.live(id, signal)) return; }
      }
      stage = 'insert';
      if (this.insertionStarted.has(id)) return; // duplicate-insertion guard
      this.insertionStarted.add(id);
      try { await this.deps.inserter.insert(finalText, settings.restoreClipboard); }
      catch (e) { this.insertionStarted.delete(id); throw e; }
      if (this.live(id, signal)) { this.dispatch({ type: 'INSERTED' }); this.wav = null; }
      // The text was pasted even if the session was cancelled meanwhile, so the history entry is still owed.
      if (settings.history.enabled) {
        try {
          await this.deps.addHistory({ id, createdAt: this.deps.now(), rawText, finalText, language: settings.language, style: settings.cleanup.enabled ? settings.cleanup.style : 'verbatim', durationMs });
        } catch { /* history is best-effort */ }
      }
      if (this.live(id, signal)) {
        this.doneTimer = setTimeout(() => { if (this.snap.sessionId === id) this.dispatch({ type: 'RESET' }); }, this.deps.completedDelayMs ?? 1200);
      }
    } catch (e) {
      if (!this.live(id, signal)) return;
      this.fail(stage, e);
    }
  }

  async retry(): Promise<void> {
    if (this.snap.state !== 'error') return;
    const stage = this.snap.error?.stage;
    const id = this.snap.sessionId!;
    if (stage !== 'insert' && !this.wav) return;
    const before = this.snap;
    if (this.dispatch({ type: 'RETRY' }) === before) return;
    this.run(id, stage === 'insert' ? 'insert' : 'transcribe');
  }

  async cancel(): Promise<void> {
    const s = this.snap.state;
    if (s === 'completed' || s === 'error') return this.dismiss();
    if (s === 'idle') return;
    this.abort.abort(); this.wav = null; this.clearTimer();
    this.dispatch({ type: 'CANCEL' });
    await this.deps.audio.cancel().catch(() => {});
  }

  async dismiss(): Promise<void> {
    this.clearTimer(); this.abort.abort(); this.wav = null;
    if (this.snap.state === 'error') this.dispatch({ type: 'DISMISS' });
    else if (this.snap.state === 'completed') this.dispatch({ type: 'RESET' });
  }

  private async onAudioError(message: string): Promise<void> {
    if (this.snap.state !== 'recording') return;
    this.abort.abort();
    this.dispatch({ type: 'FAIL', error: { stage: 'record', message: message || 'The microphone was disconnected.', retryable: false } });
    await this.deps.audio.cancel().catch(() => {});
  }
}
