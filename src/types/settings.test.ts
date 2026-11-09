import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, migrateSettings } from './settings';

describe('settings', () => {
  it('has the documented defaults', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      version: 1, onboardingDone: false, language: 'auto', restoreClipboard: true, showPreview: true, theme: 'system',
      shortcut: { accelerator: 'CommandOrControl+Shift+Space', mode: 'toggle' },
      cleanup: { enabled: true, style: 'minimal', removeFillers: true, autoPunctuation: true },
      history: { enabled: true, retentionDays: 30 }, startup: { launchAtLogin: false },
      backend: { url: 'http://127.0.0.1:8787', token: '' }, microphoneId: null,
    });
  });
  it('mergeSettings deep-merges without mutating the base', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { cleanup: { style: 'professional' }, language: 'pt-BR' });
    expect(merged.cleanup).toEqual({ ...DEFAULT_SETTINGS.cleanup, style: 'professional' });
    expect(merged.language).toBe('pt-BR');
    expect(DEFAULT_SETTINGS.cleanup.style).toBe('minimal');
  });
  it('migrateSettings falls back to defaults for junk and keeps valid stored values', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings({ language: 'fr', cleanup: { style: 'weird' }, history: { retentionDays: 'x' } })).toEqual(DEFAULT_SETTINGS);
    const kept = migrateSettings({ language: 'pt-BR', history: { enabled: false, retentionDays: null }, backend: { url: 'https://x.y', token: 't' } });
    expect(kept.language).toBe('pt-BR');
    expect(kept.history).toEqual({ enabled: false, retentionDays: null });
    expect(kept.backend).toEqual({ url: 'https://x.y', token: 't' });
  });
  it('migrateSettings only accepts a finite retention of at least one day, rounded down', () => {
    const days = (v: unknown) => migrateSettings({ history: { retentionDays: v } }).history.retentionDays;
    expect(days(Infinity)).toBe(30);
    expect(days(NaN)).toBe(30);
    expect(days(0.5)).toBe(30);
    expect(days(-3)).toBe(30);
    expect(days(1.5)).toBe(1);
    expect(days(90)).toBe(90);
  });
});
