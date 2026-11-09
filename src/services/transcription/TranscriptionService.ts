import { ProviderError, type TranscriptionOptions, type TranscriptionProvider, type TranscriptionResult } from './TranscriptionProvider';

export class TranscriptionService {
  constructor(private readonly provider: TranscriptionProvider) {}
  async transcribe(wav: Uint8Array, o: TranscriptionOptions): Promise<TranscriptionResult> {
    const result = await this.provider.transcribe(new Blob([wav as BlobPart], { type: 'audio/wav' }), o);
    if (result.text.trim() === '') throw new ProviderError('No speech detected. Try again and speak closer to the microphone.', 'invalid_request', true);
    return result;
  }
}
