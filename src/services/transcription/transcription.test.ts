// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { TranscriptionService } from './TranscriptionService';
import { MockTranscriptionProvider } from './MockTranscriptionProvider';
import { BackendTranscriptionProvider } from './BackendTranscriptionProvider';
import { ProviderError } from './TranscriptionProvider';
import type { BackendClient } from '@/services/backend/BackendClient';

const wav = new Uint8Array(44 + 64);

describe('TranscriptionService', () => {
  it('passes language and vocabulary through to the provider', async () => {
    const p = new MockTranscriptionProvider({ text: 'olá mundo' });
    const r = await new TranscriptionService(p).transcribe(wav, { language: 'pt-BR', vocabulary: ['Tauri'] });
    expect(r.text).toBe('olá mundo');
    expect(p.calls[0]).toMatchObject({ options: { language: 'pt-BR', vocabulary: ['Tauri'] }, bytes: wav.byteLength });
  });
  it('turns an empty transcript into a retryable "no speech" error', async () => {
    const err = await new TranscriptionService(new MockTranscriptionProvider({ text: '   ' })).transcribe(wav, { language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: 'invalid_request', retryable: true });
    expect(err.message).toMatch(/no speech/i);
  });
  it('propagates provider failures unchanged', async () => {
    const boom = new ProviderError('down', 'provider_error', true);
    const err = await new TranscriptionService(new MockTranscriptionProvider({ failWith: boom })).transcribe(wav, { language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toBe(boom);
  });
  it('MockTranscriptionProvider can serve a sequence of results', async () => {
    const p = new MockTranscriptionProvider({ results: ['one', 'two'] });
    expect((await p.transcribe(new Blob([wav]), { language: 'en', vocabulary: [] })).text).toBe('one');
    expect((await p.transcribe(new Blob([wav]), { language: 'en', vocabulary: [] })).text).toBe('two');
  });
  it('MockTranscriptionProvider honours an aborted signal', async () => {
    const ac = new AbortController();
    const p = new MockTranscriptionProvider({ delayMs: 50 });
    const pending = p.transcribe(new Blob([wav]), { language: 'en', vocabulary: [], signal: ac.signal }).catch((e) => e);
    ac.abort();
    expect(await pending).toMatchObject({ code: 'aborted' });
  });
});

describe('BackendTranscriptionProvider', () => {
  it('reads the blob and delegates to the client', async () => {
    const client = { transcribe: vi.fn(async () => ({ text: 'x', language: null, durationMs: null, provider: 'mock' })) } as unknown as BackendClient;
    await new BackendTranscriptionProvider(client).transcribe(new Blob([wav]), { language: 'en', vocabulary: ['a'] });
    const [bytes, opts] = (client.transcribe as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect((bytes as Uint8Array).byteLength).toBe(wav.byteLength);
    expect(opts).toMatchObject({ language: 'en', vocabulary: ['a'] });
  });
});
