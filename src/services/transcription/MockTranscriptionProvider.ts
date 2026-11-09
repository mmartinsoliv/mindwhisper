import { ProviderError, type TranscriptionOptions, type TranscriptionProvider, type TranscriptionResult } from './TranscriptionProvider';

interface Opts { text?: string; delayMs?: number; failWith?: ProviderError; results?: string[] }

/** Deterministic provider for unit/integration tests and offline development. */
export class MockTranscriptionProvider implements TranscriptionProvider {
  calls: { options: TranscriptionOptions; bytes: number }[] = [];
  private i = 0;
  constructor(private readonly o: Opts = {}) {}
  async transcribe(audio: Blob, options: TranscriptionOptions): Promise<TranscriptionResult> {
    this.calls.push({ options, bytes: audio.size });
    if (this.o.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.o.delayMs);
        options.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new ProviderError('Cancelled.', 'aborted', false)); }, { once: true });
      });
    }
    if (options.signal?.aborted) throw new ProviderError('Cancelled.', 'aborted', false);
    if (this.o.failWith) throw this.o.failWith;
    const text = this.o.results ? (this.o.results[this.i++] ?? '') : (this.o.text ?? 'um this is a mock transcript');
    return { text, language: options.language === 'auto' ? null : options.language, durationMs: null, provider: 'mock' };
  }
}
