import type { DictionaryEntry } from '@/types/history';
import type { CleanupWire } from '@/services/backend/BackendClient';
import type { Language, Settings } from '@/types/settings';
import { applyDictionary } from './dictionary';

export interface CleanupProvider { cleanup(req: CleanupWire, signal?: AbortSignal): Promise<string> }
export interface CleanupContext { cleanup: Settings['cleanup']; language: Language; dictionary: DictionaryEntry[]; signal?: AbortSignal }
export interface CleanupOutcome { text: string; usedLlm: boolean; fellBack: boolean }

export class CleanupService {
  constructor(private readonly provider: CleanupProvider) {}

  async cleanup(text: string, ctx: CleanupContext): Promise<CleanupOutcome> {
    const trimmed = text.trim();
    const { cleanup } = ctx;
    if (!cleanup.enabled || cleanup.style === 'verbatim') {
      return { text: applyDictionary(trimmed, ctx.dictionary), usedLlm: false, fellBack: false };
    }
    try {
      const out = await this.provider.cleanup({
        text: trimmed, language: ctx.language, style: cleanup.style, removeFillers: cleanup.removeFillers, autoPunctuation: cleanup.autoPunctuation,
        dictionary: ctx.dictionary.map((d) => (d.spoken ? { term: d.term, spoken: d.spoken } : { term: d.term })),
      }, ctx.signal);
      return { text: applyDictionary(out, ctx.dictionary), usedLlm: true, fellBack: false };
    } catch (e) {
      if (ctx.signal?.aborted) throw e;
      return { text: applyDictionary(trimmed, ctx.dictionary), usedLlm: false, fellBack: true };
    }
  }
}
