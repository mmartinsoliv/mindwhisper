import { describe, expect, it, vi } from 'vitest';
import { OpenAiSttProvider } from './openaiStt';
import { ProviderError } from './types';

const audio = new Uint8Array(44 + 32000);
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('OpenAiSttProvider', () => {
  it('posts multipart with model, ISO language and vocabulary prompt', async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ok({ text: ' hello world ' }));
    const p = new OpenAiSttProvider({ apiKey: 'k', model: 'm1', fetchImpl });
    const r = await p.transcribe({ audio, language: 'pt-BR', vocabulary: ['Tauri', 'Kubernetes'] });
    expect(r.text).toBe('hello world');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const fd = init!.body as FormData;
    expect(fd.get('model')).toBe('m1');
    expect(fd.get('language')).toBe('pt');
    expect(String(fd.get('prompt'))).toContain('Tauri, Kubernetes');
    expect(fd.get('file')).toBeInstanceOf(File);
  });
  it('omits language for auto and prompt for empty vocabulary', async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => ok({ text: 'x' }));
    await new OpenAiSttProvider({ apiKey: 'k', model: 'm', fetchImpl }).transcribe({ audio, language: 'auto', vocabulary: [] });
    const fd = fetchImpl.mock.calls[0]![1]!.body as FormData;
    expect(fd.has('language')).toBe(false);
    expect(fd.has('prompt')).toBe(false);
  });
  it('wraps non-2xx as provider_error without echoing the body', async () => {
    const fetchImpl = vi.fn(async () => new Response('secret', { status: 500 }));
    const err = await new OpenAiSttProvider({ apiKey: 'k', model: 'm', fetchImpl }).transcribe({ audio, language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_error');
    expect(err.message).not.toContain('secret');
  });
  it('maps aborts to provider_timeout', async () => {
    const fetchImpl = vi.fn(async () => { throw new DOMException('aborted', 'TimeoutError'); });
    const err = await new OpenAiSttProvider({ apiKey: 'k', model: 'm', fetchImpl }).transcribe({ audio, language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err.kind).toBe('provider_timeout');
  });
  it('maps a malformed upstream body to provider_error', async () => {
    const fetchImpl = async () => new Response('<html>', { status: 200 });
    const err = await new OpenAiSttProvider({ apiKey: 'k', model: 'm', fetchImpl }).transcribe({ audio, language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_error');
  });
  it('maps a timeout while reading the body to provider_timeout', async () => {
    const res = { ok: true, status: 200, json: async () => { throw new DOMException('aborted', 'TimeoutError'); } } as unknown as Response;
    const err = await new OpenAiSttProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => res }).transcribe({ audio, language: 'en', vocabulary: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_timeout');
  });
});
