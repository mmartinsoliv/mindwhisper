import { describe, expect, it, vi } from 'vitest';
import { CleanupService, type CleanupProvider } from './CleanupService';
import { applyDictionary, vocabularyFor } from './dictionary';
import type { DictionaryEntry } from '@/types/history';
import { DEFAULT_SETTINGS } from '@/types/settings';

const d = (term: string, spoken?: string): DictionaryEntry => ({ id: term, term, ...(spoken ? { spoken } : {}) });
const ctx = (over: Partial<typeof DEFAULT_SETTINGS.cleanup> = {}, dictionary: DictionaryEntry[] = [], language: 'auto' | 'en' | 'pt-BR' = 'en') =>
  ({ cleanup: { ...DEFAULT_SETTINGS.cleanup, ...over }, language, dictionary });

describe('applyDictionary', () => {
  it('replaces spoken forms with the preferred spelling (case-insensitive, whole words)', () => {
    expect(applyDictionary('open mind whisper now', [d('Mindwhisper', 'mind whisper')])).toBe('open Mindwhisper now');
    expect(applyDictionary('a kubernetes cluster', [d('Kubernetes')])).toBe('a Kubernetes cluster');
  });
  it('does not touch substrings inside other words', () => {
    expect(applyDictionary('the cat scattered', [d('CAT', 'cat')])).toBe('the CAT scattered');
  });
  it('handles accents and regex characters safely', () => {
    expect(applyDictionary('vou usar c++ hoje', [d('C++', 'c++')])).toBe('vou usar C++ hoje');
    expect(applyDictionary('o João chegou', [d('João')])).toBe('o João chegou');
  });
  it('prefers longer spoken forms first', () => {
    expect(applyDictionary('ai studio', [d('AI', 'ai'), d('AI Studio', 'ai studio')])).toBe('AI Studio');
  });
  it('is a no-op for an empty dictionary', () => { expect(applyDictionary('hello', [])).toBe('hello'); });
});

describe('vocabularyFor', () => {
  it('lists unique terms, capped at 100, skipping ones over 64 characters', () => {
    const entries = [d('Tauri'), d('tauri'), d('x'.repeat(65)), ...Array.from({ length: 150 }, (_, i) => d('T' + i))];
    const v = vocabularyFor(entries);
    expect(v[0]).toBe('Tauri');
    expect(v).toHaveLength(100);
    expect(v).not.toContain('x'.repeat(65));
    expect(new Set(v.map((s) => s.toLowerCase())).size).toBe(v.length);
  });
});

describe('CleanupService', () => {
  const provider = (impl: CleanupProvider['cleanup']): CleanupProvider & { cleanup: ReturnType<typeof vi.fn> } => ({ cleanup: vi.fn(impl) });

  it('sends the wire request with settings, language and dictionary', async () => {
    const p = provider(async () => 'Hey John.');
    const out = await new CleanupService(p).cleanup(' um hey john ', ctx({ style: 'professional', removeFillers: false, autoPunctuation: false }, [d('John', 'jon')], 'pt-BR'));
    expect(out).toEqual({ text: 'Hey John.', usedLlm: true, fellBack: false });
    expect(p.cleanup.mock.calls[0]![0]).toEqual({ text: 'um hey john', language: 'pt-BR', style: 'professional', removeFillers: false, autoPunctuation: false, dictionary: [{ term: 'John', spoken: 'jon' }] });
  });
  it('never calls the provider when cleanup is disabled or the style is verbatim, but still applies the dictionary', async () => {
    const p = provider(async () => 'nope');
    const svc = new CleanupService(p);
    expect(await svc.cleanup('  hi kubernetes ', ctx({ enabled: false }, [d('Kubernetes')]))).toEqual({ text: 'hi Kubernetes', usedLlm: false, fellBack: false });
    expect((await svc.cleanup('hi', ctx({ style: 'verbatim' }))).usedLlm).toBe(false);
    expect(p.cleanup).not.toHaveBeenCalled();
  });
  it('falls back to the raw transcript (with dictionary) when the provider fails', async () => {
    const out = await new CleanupService(provider(async () => { throw new Error('boom'); })).cleanup('hi kubernetes', ctx({}, [d('Kubernetes')]));
    expect(out).toEqual({ text: 'hi Kubernetes', usedLlm: false, fellBack: true });
  });
  it('rethrows when the signal is aborted instead of falling back', async () => {
    const ac = new AbortController(); ac.abort();
    const svc = new CleanupService(provider(async () => { throw new Error('aborted'); }));
    await expect(svc.cleanup('hi', { ...ctx(), signal: ac.signal })).rejects.toThrow();
  });
  it('applies the dictionary to the LLM output as a safety net', async () => {
    const out = await new CleanupService(provider(async () => 'Use kubernetes.')).cleanup('use kubernetes', ctx({}, [d('Kubernetes')]));
    expect(out.text).toBe('Use Kubernetes.');
  });
});
