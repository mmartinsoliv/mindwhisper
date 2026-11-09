export type Language = 'auto' | 'en' | 'pt-BR';
export type CleanupStyle = 'verbatim' | 'minimal' | 'professional' | 'casual' | 'concise';

export interface Settings {
  version: 1;
  onboardingDone: boolean;
  shortcut: { accelerator: string; mode: 'toggle' | 'hold' };
  microphoneId: string | null;
  language: Language;
  cleanup: { enabled: boolean; style: CleanupStyle; removeFillers: boolean; autoPunctuation: boolean };
  history: { enabled: boolean; retentionDays: number | null };
  startup: { launchAtLogin: boolean };
  theme: 'system' | 'light' | 'dark';
  restoreClipboard: boolean;
  showPreview: boolean;
  backend: { url: string; token: string };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const LANGUAGES: Language[] = ['auto', 'en', 'pt-BR'];
export const STYLES: CleanupStyle[] = ['verbatim', 'minimal', 'professional', 'casual', 'concise'];

export const DEFAULT_SETTINGS: Settings = {
  version: 1, onboardingDone: false,
  shortcut: { accelerator: 'CommandOrControl+Shift+Space', mode: 'toggle' },
  microphoneId: null, language: 'auto',
  cleanup: { enabled: true, style: 'minimal', removeFillers: true, autoPunctuation: true },
  history: { enabled: true, retentionDays: 30 }, startup: { launchAtLogin: false },
  theme: 'system', restoreClipboard: true, showPreview: true,
  backend: { url: 'http://127.0.0.1:8787', token: '' },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function merge(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) out[k] = merge(base[k], patch[k]);
  return out;
}

export function mergeSettings(base: Settings, patch: DeepPartial<Settings>): Settings {
  return merge(base, patch) as Settings;
}

/** A usable retention is a finite number of at least one day; fractions round down. */
function retentionOr(x: unknown, fallback: number): number {
  return typeof x === 'number' && Number.isFinite(x) && x >= 1 ? Math.floor(x) : fallback;
}

/** Accepts anything stored on disk; invalid fields fall back to defaults. */
export function migrateSettings(raw: unknown): Settings {
  if (!isObj(raw)) return structuredClone(DEFAULT_SETTINGS);
  const d = DEFAULT_SETTINGS;
  const pick = <T,>(v: unknown, ok: (x: unknown) => x is T, fallback: T): T => (ok(v) ? v : fallback);
  const str = (x: unknown): x is string => typeof x === 'string';
  const bool = (x: unknown): x is boolean => typeof x === 'boolean';
  const sub = (k: string) => (isObj(raw[k]) ? (raw[k] as Record<string, unknown>) : {});
  const sc = sub('shortcut'), cl = sub('cleanup'), hi = sub('history'), st = sub('startup'), be = sub('backend');
  return {
    version: 1,
    onboardingDone: pick(raw.onboardingDone, bool, d.onboardingDone),
    shortcut: { accelerator: pick(sc.accelerator, str, d.shortcut.accelerator), mode: sc.mode === 'hold' ? 'hold' : 'toggle' },
    microphoneId: raw.microphoneId === null || str(raw.microphoneId) ? (raw.microphoneId as string | null) : d.microphoneId,
    language: pick(raw.language, (x): x is Language => LANGUAGES.includes(x as Language), d.language),
    cleanup: {
      enabled: pick(cl.enabled, bool, d.cleanup.enabled),
      style: pick(cl.style, (x): x is CleanupStyle => STYLES.includes(x as CleanupStyle), d.cleanup.style),
      removeFillers: pick(cl.removeFillers, bool, d.cleanup.removeFillers),
      autoPunctuation: pick(cl.autoPunctuation, bool, d.cleanup.autoPunctuation),
    },
    history: {
      enabled: pick(hi.enabled, bool, d.history.enabled),
      retentionDays: hi.retentionDays === null ? null : retentionOr(hi.retentionDays, d.history.retentionDays as number),
    },
    startup: { launchAtLogin: pick(st.launchAtLogin, bool, d.startup.launchAtLogin) },
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
    restoreClipboard: pick(raw.restoreClipboard, bool, d.restoreClipboard),
    showPreview: pick(raw.showPreview, bool, d.showPreview),
    backend: { url: pick(be.url, str, d.backend.url), token: pick(be.token, str, d.backend.token) },
  };
}
