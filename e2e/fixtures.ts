import type { BrowserContext, Page } from '@playwright/test';
import type { DeepPartial, Settings } from '../src/types/settings';

/**
 * A faithful stand-in for the Tauri runtime, for browser tests against the Vite dev server.
 *
 * The app only reaches Tauri through `window.__TAURI_INTERNALS__` (`invoke`, `transformCallback`,
 * `unregisterCallback`, `metadata`) and `window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener`.
 * Everything below mirrors `@tauri-apps/api/mocks` and the wire protocol of `@tauri-apps/plugin-store`,
 * with two differences that make it usable for a two-window app:
 *  - events emitted in one page reach the listeners of every page in the browser context (BroadcastChannel);
 *  - the key-value store and the call log live in the Node test process (one `Host` per browser context, reached
 *    through a context-level binding), so both pages and page reloads share them. `localStorage` is deliberately not
 *    used for this: Chromium propagates it between renderers asynchronously, so a page that is told "history changed"
 *    can still read the old value and the test flakes.
 */

export interface MockFailure { code: string; message: string; once?: boolean }
export interface MockOptions {
  devices?: { id: string; name: string; isDefault: boolean }[];
  permissions?: { platform: 'macos' | 'windows' | 'linux'; accessibility: 'granted' | 'denied' | 'unsupported' };
  /** Commands that reject with `{ code, message }` (what the Rust side returns). `once` fails only the first call. */
  failures?: Record<string, MockFailure>;
}
export interface RecordedCall { cmd: string; args: Record<string, unknown>; t: number; window: 'main' | 'overlay' }
export interface MockEvents { __mockEmit: (event: string, payload?: unknown) => void; __mockListeners: () => { event: string; id: number }[] }

type HostRequest =
  | { kind: 'call'; cmd: string; args: Record<string, unknown>; window: 'main' | 'overlay' }
  | { kind: 'store'; op: string; file: string; key?: string; value?: unknown };

/** Test-process state shared by every page of one browser context. */
class Host {
  readonly store = new Map<string, Map<string, unknown>>();
  readonly log: RecordedCall[] = [];
  file(name: string): Map<string, unknown> {
    let f = this.store.get(name);
    if (!f) { f = new Map(); this.store.set(name, f); }
    return f;
  }
  handle(r: HostRequest): unknown {
    if (r.kind === 'call') { this.log.push({ cmd: r.cmd, args: r.args, t: Date.now(), window: r.window }); return undefined; }
    const f = this.file(r.file);
    switch (r.op) {
      case 'get': return f.has(r.key!) ? [f.get(r.key!), true] : [null, false];
      case 'set': f.set(r.key!, r.value ?? null); return undefined;
      case 'has': return f.has(r.key!);
      case 'delete': return f.delete(r.key!);
      case 'keys': return [...f.keys()];
      case 'values': return [...f.values()];
      case 'entries': return [...f.entries()];
      case 'length': return f.size;
      case 'clear': case 'reset': f.clear(); return undefined;
      default: return undefined; // save, reload
    }
  }
}
const hosts = new WeakMap<BrowserContext, Host>();
const hostOf = (page: Page): Host => {
  const h = hosts.get(page.context());
  if (!h) throw new Error('installTauriMock(page) must be called before using this helper');
  return h;
};

/** Runs inside the page (serialised by Playwright), so it must not reference anything outside itself. */
function tauriMockScript(opts: MockOptions): void {
  const w = window as unknown as Record<string, unknown>;
  const label = location.pathname.startsWith('/overlay') ? 'overlay' : 'main';
  const devices = opts.devices ?? [{ id: 'mock-mic', name: 'Mock Microphone', isDefault: true }];
  const permissions = opts.permissions ?? { platform: 'macos', accessibility: 'granted' };
  const failures = opts.failures ?? {};
  const failed = new Set<string>();

  // --- callback registry (mirrors @tauri-apps/api/mocks) ---
  const callbacks = new Map<number, (data: unknown) => unknown>();
  const unregisterCallback = (id: number) => { callbacks.delete(id); };
  const transformCallback = (callback?: (data: unknown) => unknown, once = false) => {
    const id = window.crypto.getRandomValues(new Uint32Array(1))[0]!;
    callbacks.set(id, (data) => { if (once) unregisterCallback(id); return callback?.(data); });
    return id;
  };
  const runCallback = (id: number, data: unknown) => {
    const cb = callbacks.get(id);
    if (cb) cb(data); else console.warn(`[tauri-mock] no callback ${id}`);
  };

  // --- events: delivered locally and to every other page through the channel ---
  const listeners = new Map<number, { event: string; handler: number }>();
  let nextEventId = 1;
  const channel = new BroadcastChannel('tauri-mock-events');
  const deliver = (event: string, payload: unknown) => {
    for (const [id, l] of [...listeners]) if (l.event === event) runCallback(l.handler, { event, id, payload });
  };
  const emit = (event: string, payload?: unknown) => {
    deliver(event, payload);
    channel.postMessage({ event, payload: payload ?? null });
  };
  channel.onmessage = (m: MessageEvent<{ event: string; payload: unknown }>) => deliver(m.data.event, m.data.payload);
  w.__mockEmit = emit;
  w.__mockListeners = () => [...listeners].map(([id, l]) => ({ event: l.event, id }));

  const handleEvent = (cmd: string, args: Record<string, unknown>): unknown => {
    switch (cmd) {
      case 'plugin:event|listen': { const id = nextEventId++; listeners.set(id, { event: args.event as string, handler: args.handler as number }); return id; }
      case 'plugin:event|unlisten': listeners.delete(args.eventId as number); return undefined;
      case 'plugin:event|emit': case 'plugin:event|emit_to': emit(args.event as string, args.payload); return undefined;
      default: throw new Error('unmocked command: ' + cmd);
    }
  };

  // --- plugin-store: same wire protocol as @tauri-apps/plugin-store (load → rid, get → [value, exists], ...) ---
  const host = w.__mockHost as (r: unknown) => Promise<unknown>;
  const stores = new Map<number, string>();
  const handleStore = async (cmd: string, args: Record<string, unknown>): Promise<unknown> => {
    const op = cmd.slice('plugin:store|'.length);
    if (op === 'load' || op === 'get_store') {
      const path = args.path as string;
      let rid = [...stores].find(([, f]) => f === path)?.[0];
      if (rid === undefined) { if (op === 'get_store') return null; rid = stores.size + 1; stores.set(rid, path); }
      return rid;
    }
    const file = stores.get(args.rid as number);
    if (file === undefined) throw new Error('mock store: unknown resource ' + String(args.rid));
    return host({ kind: 'store', op, file, key: args.key, value: args.value });
  };

  // --- the call log (kept by the Host, shared by both pages) ---
  const record = (cmd: string, args: Record<string, unknown>) => host({ kind: 'call', cmd, args: JSON.parse(JSON.stringify(args)), window: label });

  const wav = (): ArrayBuffer => {
    const data = 3200; // 100 ms of silence at 16 kHz mono PCM16
    const buf = new ArrayBuffer(44 + data);
    const v = new DataView(buf);
    const tag = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + data, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, data, true);
    return buf;
  };

  // The exact argument names and types the Rust commands take, as the JS wrappers send them (camelCase).
  // A mismatch (missing, extra or mistyped key) rejects, as Tauri itself would.
  const str = (v: unknown) => typeof v === 'string';
  const bool = (v: unknown) => typeof v === 'boolean';
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const nullableStr = (v: unknown) => v === null || typeof v === 'string';
  const oneOf = (...values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
  const shapes: Record<string, Record<string, (v: unknown) => boolean>> = {
    audio_list_devices: {}, audio_stop: {}, audio_cancel: {}, check_permissions: {}, shortcut_unregister: {},
    overlay_show: {}, overlay_hide: {}, main_show: {},
    audio_probe: { deviceId: nullableStr }, audio_start: { deviceId: nullableStr },
    insert_text: { text: str, restoreClipboard: bool },
    open_system_settings: { pane: oneOf('accessibility', 'microphone') },
    shortcut_register: { accelerator: str, mode: oneOf('toggle', 'hold') },
    shortcut_set_cancel_enabled: { enabled: bool },
    overlay_resize: { width: num, height: num },
    'plugin:window|hide': { label: str },
    'plugin:autostart|is_enabled': {}, 'plugin:autostart|enable': {}, 'plugin:autostart|disable': {},
  };
  const checkShape = (cmd: string, args: Record<string, unknown>) => {
    const shape = shapes[cmd];
    if (!shape) throw new Error('unmocked command: ' + cmd);
    const bad = [...new Set([...Object.keys(shape), ...Object.keys(args)])].filter((k) => !(k in shape) || !(k in args) || !shape[k]!(args[k]));
    if (bad.length) throw new Error(`${cmd}: invalid arguments, check ${bad.join(', ')} (got ${JSON.stringify(args)})`);
  };

  const invoke = async (cmd: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    if (cmd.startsWith('plugin:event|')) return handleEvent(cmd, args);
    if (cmd.startsWith('plugin:store|')) return handleStore(cmd, args);
    if (cmd.startsWith('plugin:resources|')) return undefined;
    await record(cmd, args);
    checkShape(cmd, args);
    const failure = failures[cmd];
    if (failure && !(failure.once && failed.has(cmd))) {
      failed.add(cmd);
      throw { code: failure.code, message: failure.message };
    }
    switch (cmd) {
      case 'audio_list_devices': return devices;
      case 'audio_stop': return wav(); // the Rust command returns tauri::ipc::Response, which arrives in JS as an ArrayBuffer
      case 'check_permissions': return permissions;
      case 'insert_text': return { clipboardRestored: true };
      case 'plugin:autostart|is_enabled': return false;
      default: return undefined; // every other allowlisted command returns nothing
    }
  };

  w.__TAURI_INTERNALS__ = {
    invoke, transformCallback, unregisterCallback, runCallback, callbacks,
    metadata: { currentWindow: { label }, currentWebview: { windowLabel: label, label } },
  };
  w.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (_event: string, id: number) => { const l = listeners.get(id); if (l) { unregisterCallback(l.handler); listeners.delete(id); } },
  };
}

export async function installTauriMock(page: Page, opts: MockOptions = {}): Promise<void> {
  const context = page.context();
  if (!hosts.has(context)) {
    const host = new Host();
    hosts.set(context, host);
    await context.exposeBinding('__mockHost', (_source, r: HostRequest) => host.handle(r));
  }
  await page.addInitScript(tauriMockScript, opts);
}

/** Writes `value` under `key` of the mocked plugin-store file (for example `'history.json'`, `'entries'`). Call it after `installTauriMock`. */
export async function seedStore(page: Page, file: string, key: string, value: unknown): Promise<void> {
  hostOf(page).file(file).set(key, structuredClone(value));
}

/** Everything currently in the mocked plugin-store as `file:key`. */
export async function storeKeys(page: Page): Promise<string[]> {
  return [...hostOf(page).store].flatMap(([file, keys]) => [...keys.keys()].map((k) => `${file}:${k}`));
}

export async function readStore<T = unknown>(page: Page, file: string, key: string): Promise<T | undefined> {
  return hostOf(page).file(file).get(key) as T | undefined;
}

/** Every recorded app command (plus plugin window/autostart calls), oldest first, from all pages of the context. */
export async function calls(page: Page): Promise<RecordedCall[]> {
  return [...hostOf(page).log];
}

/** Resolves once `page` has registered a listener for `event` (the overlay host listens after several awaits). */
export async function waitForListener(page: Page, event: string): Promise<void> {
  await page.waitForFunction((e) => (window as unknown as MockEvents).__mockListeners().some((l) => l.event === e), event);
}

export async function emitEvent(page: Page, event: string, payload?: unknown): Promise<void> {
  await page.evaluate(([e, p]) => (window as unknown as MockEvents).__mockEmit(e as string, p), [event, payload] as const);
}

export function settingsSeed(overrides: DeepPartial<Settings> = {}): Settings {
  const base: Settings = {
    version: 1, onboardingDone: true,
    shortcut: { accelerator: 'CommandOrControl+Shift+Space', mode: 'toggle' },
    microphoneId: null, language: 'auto',
    cleanup: { enabled: true, style: 'minimal', removeFillers: true, autoPunctuation: true },
    history: { enabled: true, retentionDays: 30 }, startup: { launchAtLogin: false },
    theme: 'light', restoreClipboard: true, showPreview: false,
    backend: { url: 'http://127.0.0.1:8787', token: 'tok' },
  };
  const merge = (a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) {
      const cur = out[k];
      out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) && cur !== null && typeof cur === 'object' ? merge(cur as Record<string, unknown>, v as Record<string, unknown>) : v;
    }
    return out;
  };
  return merge(base as unknown as Record<string, unknown>, overrides as Record<string, unknown>) as unknown as Settings;
}

export interface TranscribeRequest { authorization: string | undefined; language: string | undefined; vocabulary: string | undefined; audioBytes: number }
export interface CleanupRequest { authorization: string | undefined; body: Record<string, unknown> }
export interface BackendHandlers {
  /** Statuses for the first requests, in order; once used up the default (success) response is returned. */
  transcribeStatuses?: number[];
  cleanupStatuses?: number[];
  transcribe?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
}
export interface MockBackend { requests: { transcribe: TranscribeRequest[]; cleanup: CleanupRequest[] } }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };

/** Answers the Mindwhisper backend (default URL) for a page or a whole browser context, recording what the app sends. */
export async function mockBackend(target: Page | BrowserContext, handlers: BackendHandlers = {}): Promise<MockBackend> {
  const requests: MockBackend['requests'] = { transcribe: [], cleanup: [] };
  const tStatuses = [...(handlers.transcribeStatuses ?? [])];
  const cStatuses = [...(handlers.cleanupStatuses ?? [])];
  const transcribeBody = handlers.transcribe ?? { text: 'um hello world', language: 'en', durationMs: 100, provider: 'mock' };
  const cleanupBody = handlers.cleanup ?? { text: 'Hello world.', provider: 'mock' };
  const json = (status: number, body: unknown) => ({ status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const outcome = (statuses: number[], ok: unknown) => {
    const status = statuses.shift() ?? 200;
    return status === 200 ? json(200, ok) : json(status, { error: { code: status === 504 ? 'provider_timeout' : 'provider_error', message: 'mock failure' } });
  };

  await target.route('http://127.0.0.1:8787/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const authorization = req.headers()['authorization'];
    if (req.method() === 'POST' && path === '/v1/transcribe') {
      const raw = (req.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1');
      const field = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`).exec(raw)?.[1];
      requests.transcribe.push({ authorization, language: field('language'), vocabulary: field('vocabulary'), audioBytes: req.postDataBuffer()?.length ?? 0 });
      return route.fulfill(outcome(tStatuses, transcribeBody));
    }
    if (req.method() === 'POST' && path === '/v1/cleanup') {
      requests.cleanup.push({ authorization, body: (req.postDataJSON() ?? {}) as Record<string, unknown> });
      return route.fulfill(outcome(cStatuses, cleanupBody));
    }
    if (path === '/health') return route.fulfill(json(200, { ok: true }));
    return route.fulfill(json(404, { error: { code: 'not_found', message: 'unmocked route ' + path } }));
  });
  return { requests };
}
