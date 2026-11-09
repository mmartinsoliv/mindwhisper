import type { CleanupRequest, LlmProvider, SttProvider, SttRequest, SttResult } from './types';

export class MockSttProvider implements SttProvider {
  readonly name = 'mock';
  async transcribe(req: SttRequest): Promise<SttResult> {
    const durationMs = Math.max(0, Math.round(((req.audio.byteLength - 44) / 32000) * 1000));
    return { text: 'um this is a mock transcript', language: req.language === 'auto' ? null : req.language, durationMs };
  }
}

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';
  async cleanup(req: CleanupRequest): Promise<string> {
    let t = req.text.trim();
    if (req.removeFillers) t = t.replace(/\b(um|uh|hmm|tipo|né)\b[,]?\s*/gi, '').trim();
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (req.autoPunctuation && !/[.!?]$/.test(t)) t += '.';
    return t;
  }
}
