import type { BackendClient } from '@/services/backend/BackendClient';
import type { TranscriptionOptions, TranscriptionProvider, TranscriptionResult } from './TranscriptionProvider';

export class BackendTranscriptionProvider implements TranscriptionProvider {
  constructor(private readonly client: BackendClient) {}
  async transcribe(audio: Blob, o: TranscriptionOptions): Promise<TranscriptionResult> {
    return this.client.transcribe(new Uint8Array(await audio.arrayBuffer()), o);
  }
}
