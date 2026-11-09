// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { BackendClient, type CleanupWire } from './BackendClient';
import { ProviderError } from '@/services/transcription/TranscriptionProvider';

const cfg = { url: 'http://127.0.0.1:8787/', token: 'tok' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const wav = new Uint8Array(44 + 100);

describe('BackendClient.transcribe', () => {
  it('posts multipart with bearer token, language and vocabulary, and trims the base URL', async () => {
    const f = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => json({ text: 'hi', language: 'en', durationMs: 10, provider: 'mock' }));
    const r = await new BackendClient(() => cfg, f).transcribe(wav, { language: 'pt-BR', vocabulary: ['Tauri'] });
    expect(r).toEqual({ text: 'hi', language: 'en', durationMs: 10, provider: 'mock' });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:8787/v1/transcribe');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const fd = init!.body as FormData;
    expect(fd.get('language')).toBe('pt-BR');
    expect(fd.get('vocabulary')).toBe('["Tauri"]');
    expect(fd.get('audio')).toBeInstanceOf(Blob);
  });
  it('fails fast without a token (non-retryable unauthorized)', async () => {
    const f = vi.fn();
    const err = await new BackendClient(() => ({ url: 'x', token: '' }), f as never).transcribe(wav, { language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ code: 'unauthorized', retryable: false });
    expect(f).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'unauthorized', false], [403, 'unauthorized', false], [429, 'rate_limited', true], [400, 'invalid_request', false],
    [413, 'invalid_request', false], [504, 'timeout', true], [502, 'provider_error', true], [500, 'provider_error', true],
  ])('maps HTTP %i to %s (retryable=%s)', async (status, code, retryable) => {
    const f = async () => json({ error: { code: 'x', message: 'server detail' } }, status);
    const err = await new BackendClient(() => cfg, f).transcribe(wav, { language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toMatchObject({ code, retryable });
    expect(err.message).not.toContain('server detail');
  });
  it('maps network failure to a retryable network error and abort to aborted', async () => {
    const net = await new BackendClient(() => cfg, async () => { throw new TypeError('fetch failed'); }).transcribe(wav, { language: 'en', vocabulary: [] }).catch((e) => e);
    expect(net).toMatchObject({ code: 'network', retryable: true });
    const ac = new AbortController(); ac.abort();
    const ab = await new BackendClient(() => cfg, async () => { throw new DOMException('x', 'AbortError'); }).transcribe(wav, { language: 'en', vocabulary: [], signal: ac.signal }).catch((e) => e);
    expect(ab).toMatchObject({ code: 'aborted', retryable: false });
  });
});

describe('BackendClient.cleanup', () => {
  it('posts JSON and returns the text', async () => {
    const f = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => json({ text: 'Hey.', provider: 'mock' }));
    const out = await new BackendClient(() => cfg, f).cleanup({ text: 'hey', language: 'en', style: 'minimal', removeFillers: true, autoPunctuation: true, dictionary: [] });
    expect(out).toBe('Hey.');
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe('http://127.0.0.1:8787/v1/cleanup');
    expect((init!.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init!.body)).style).toBe('minimal');
  });
});

describe('BackendClient response validation', () => {
  const retryableProviderError = { code: 'provider_error', retryable: true };
  it('rejects a 200 transcription body without a text string', async () => {
    for (const body of [{}, { text: 5 }, null, 'oops']) {
      const err = await new BackendClient(() => cfg, async () => json(body)).transcribe(wav, { language: 'en', vocabulary: [] }).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err).toMatchObject(retryableProviderError);
    }
  });
  it('rejects a 200 transcription body that is not JSON', async () => {
    const err = await new BackendClient(() => cfg, async () => new Response('<html>', { status: 200 })).transcribe(wav, { language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toMatchObject(retryableProviderError);
  });
  it('rejects a 200 cleanup body without a text string', async () => {
    const wire: CleanupWire = { text: 'hey', language: 'en', style: 'minimal', removeFillers: true, autoPunctuation: true, dictionary: [] };
    const err = await new BackendClient(() => cfg, async () => json({ provider: 'mock' })).cleanup(wire).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject(retryableProviderError);
  });
});
