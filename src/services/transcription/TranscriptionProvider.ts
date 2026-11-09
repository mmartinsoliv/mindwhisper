import type { Language } from '@/types/settings';

export interface TranscriptionOptions { language: Language; vocabulary: string[]; signal?: AbortSignal }
export interface TranscriptionSegment { text: string; startMs?: number; endMs?: number; confidence?: number }
export interface TranscriptionResult { text: string; language: string | null; durationMs: number | null; provider: string; confidence?: number; segments?: TranscriptionSegment[] }

export type ProviderErrorCode = 'network' | 'unauthorized' | 'rate_limited' | 'invalid_request' | 'provider_error' | 'timeout' | 'aborted';

export class ProviderError extends Error {
  constructor(message: string, readonly code: ProviderErrorCode, readonly retryable: boolean) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type TranscriptionEvent =
  | { type: 'partial'; text: string }
  | { type: 'final'; result: TranscriptionResult }
  | { type: 'error'; error: ProviderError };

export interface TranscriptionProvider {
  transcribe(audio: Blob, options: TranscriptionOptions): Promise<TranscriptionResult>;
  transcribeStream?(audioStream: AsyncIterable<Uint8Array>, options: TranscriptionOptions): AsyncIterable<TranscriptionEvent>;
}
