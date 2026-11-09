import { BackendClient } from '@/services/backend/BackendClient';
import { TauriAudioPort } from '@/services/audio/TauriAudioPort';
import { DictationController } from '@/services/dictation/DictationController';
import { listenCommands, listenHotkeys, publishSnapshot } from '@/services/dictation/bridge';
import { TauriInsertionService } from '@/services/insertion/TauriInsertionService';
import { repositories } from '@/services/storage';
import { emitChange } from '@/services/storage/changeBus';
import { CleanupService } from '@/services/text-processing/CleanupService';
import { commands, isAppError } from '@/services/tauri/commands';
import { BackendTranscriptionProvider } from '@/services/transcription/BackendTranscriptionProvider';
import { TranscriptionService } from '@/services/transcription/TranscriptionService';
import { useSettingsStore } from '@/stores/settingsStore';
import { initStoreSync } from '@/stores/sync';
import type { DictationSnapshot } from '@/types/dictation';
import type { Settings } from '@/types/settings';

export function overlaySizeFor(s: DictationSnapshot, showPreview: boolean): { width: number; height: number } {
  if (s.state === 'error') return { width: 360, height: 112 };
  const text = s.state === 'inserting' ? s.finalText : s.state === 'processing' ? s.rawText : undefined;
  if (showPreview && text) return { width: 320, height: 100 };
  return { width: 320, height: 64 };
}

export const shortcutChanged = (a: Settings['shortcut'], b: Settings['shortcut']) => a.accelerator !== b.accelerator || a.mode !== b.mode;

interface WireOptions {
  controller: DictationController;
  commands: Pick<typeof commands, 'overlayShow' | 'overlayHide' | 'overlayResize' | 'shortcutSetCancelEnabled'>;
  bridge: { publishSnapshot: typeof publishSnapshot; listenHotkeys: typeof listenHotkeys; listenCommands: typeof listenCommands };
  getShowPreview(): boolean;
}

/** Runs a native/bridge call; a failure is logged by error code only (never snapshot text) and reported as `false`. */
async function safe(what: string, call: () => Promise<unknown>): Promise<boolean> {
  try { await call(); return true; }
  catch (e) { console.warn(`[overlay] ${what} failed (${isAppError(e) ? e.code : 'unknown'})`); return false; }
}

const RETRY_BASE_MS = 500;
const MAX_ATTEMPTS = 5;
const MAX_RETRY_DELAY_MS = 30_000;

interface Reconciler<T> { want(v: T): void; forget(): void; dispose(): void }

/**
 * Drives one native setting (window visible, size, global Escape) towards the latest wanted value.
 * At most one call is in flight; `applied` only ever holds a value the native side confirmed, so a late or
 * failed result can never leave it out of step. A failure is retried with a doubling backoff (not per snapshot)
 * up to MAX_ATTEMPTS (unless `retryForever` says the wanted value must never be given up on, in which case the delay
 * is capped at MAX_RETRY_DELAY_MS); a changed wanted value restarts the backoff.
 */
function reconciler<T>(
  name: string, apply: (v: T) => Promise<unknown>, equals: (a: T, b: T) => boolean, initial?: T, retryForever: (v: T) => boolean = () => false,
): Reconciler<T> {
  let applied = initial; let desired: T | undefined; let inFlight = false; let attempts = 0; let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const settled = () => desired === undefined || (applied !== undefined && equals(desired, applied));
  const clearTimer = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };

  const run = (): void => {
    timer = undefined;
    if (disposed || inFlight || settled()) return;
    const target = desired as T;
    inFlight = true;
    void safe(name, () => apply(target)).then((ok) => {
      inFlight = false;
      if (disposed) return;
      if (ok) { applied = target; attempts = 0; run(); return; } // run() applies a value that changed while the call was in flight
      if (desired !== undefined && !equals(desired, target)) { attempts = 0; run(); return; }
      attempts += 1;
      if (settled() || (attempts >= MAX_ATTEMPTS && !retryForever(desired as T))) return;
      timer = setTimeout(run, Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS));
    });
  };

  return {
    want(v) {
      const changed = desired === undefined || !equals(desired, v);
      desired = v;
      if (changed) { attempts = 0; clearTimer(); run(); }
      else if (timer === undefined && !inFlight && attempts === 0) run();
    },
    forget() { applied = undefined; attempts = 0; clearTimer(); },
    dispose() { disposed = true; clearTimer(); },
  };
}

export async function wireOverlayHost(o: WireOptions): Promise<() => void> {
  type Size = { width: number; height: number };
  const visible = reconciler<boolean>('overlayShow/overlayHide', (v) => (v ? o.commands.overlayShow() : o.commands.overlayHide()), (a, b) => a === b, false);
  const size = reconciler<Size>('overlayResize', (v) => o.commands.overlayResize(v.width, v.height), (a, b) => a.width === b.width && a.height === b.height);
  const cancel = reconciler<boolean>('shortcutSetCancelEnabled', (v) => o.commands.shortcutSetCancelEnabled(v), (a, b) => a === b, false,
    (v) => !v); // a disarm must never be abandoned: an armed global Escape would swallow the key in every app
  let publishFailing = false;

  const unsub = o.controller.subscribe((s) => {
    // Logged once per outage: the next snapshot supersedes a lost one, so there is nothing to retry.
    void o.bridge.publishSnapshot(s).then(
      () => { publishFailing = false; },
      (e: unknown) => { if (!publishFailing) { publishFailing = true; console.warn(`[overlay] publishSnapshot failed (${isAppError(e) ? e.code : 'unknown'})`); } },
    );
    if (s.state === 'idle') {
      size.forget(); // the next session re-applies its size
      visible.want(false);
    } else {
      size.want(overlaySizeFor(s, o.getShowPreview()));
      visible.want(true);
    }
    cancel.want(s.state === 'recording' || s.state === 'processing' || s.state === 'inserting');
  });
  const offHot = await o.bridge.listenHotkeys((a) => {
    if (a === 'toggle') void o.controller.toggle();
    else if (a === 'start') void o.controller.start();
    else if (a === 'stop') void o.controller.stop();
    else void o.controller.cancel();
  });
  const offCmd = await o.bridge.listenCommands((c) => {
    if (c.type === 'toggle') void o.controller.toggle();
    else if (c.type === 'cancel') void o.controller.cancel();
    else if (c.type === 'retry') void o.controller.retry();
    else void o.controller.dismiss();
  });
  return () => { unsub(); offHot(); offCmd(); visible.dispose(); size.dispose(); cancel.dispose(); };
}

export function createController(): DictationController {
  const client = new BackendClient(() => useSettingsStore.getState().settings.backend);
  return new DictationController({
    audio: new TauriAudioPort(),
    transcription: new TranscriptionService(new BackendTranscriptionProvider(client)),
    cleanup: new CleanupService(client),
    inserter: new TauriInsertionService(),
    getSettings: () => useSettingsStore.getState().settings,
    getDictionary: () => repositories.dictionary.list(),
    addHistory: async (e) => { await repositories.history.add(e, useSettingsStore.getState().settings.history); await emitChange('history'); },
    now: Date.now, newId: () => crypto.randomUUID(),
  });
}

export async function startOverlayHost(): Promise<{ controller: DictationController; stop(): void }> {
  const offSync = await initStoreSync(); // loads settings first; keeps them fresh when the main window changes them
  const controller = createController();
  // A conflict the user causes by changing the shortcut is shown in Settings; a failure at startup is only logged (code + message, no user text).
  const register = (sc: Settings['shortcut']) => commands.shortcutRegister(sc.accelerator, sc.mode).catch((e: unknown) => {
    console.warn(`[overlay] shortcut registration failed (${isAppError(e) ? `${e.code}: ${e.message}` : 'unknown'})`);
  });
  await register(useSettingsStore.getState().settings.shortcut);
  const offSettings = useSettingsStore.subscribe((s, prev) => {
    if (shortcutChanged(prev.settings.shortcut, s.settings.shortcut)) void register(s.settings.shortcut);
  });
  const offWire = await wireOverlayHost({
    controller, commands, bridge: { publishSnapshot, listenHotkeys, listenCommands },
    getShowPreview: () => useSettingsStore.getState().settings.showPreview,
  });
  return { controller, stop() { offWire(); offSettings(); offSync(); controller.dispose(); } };
}
