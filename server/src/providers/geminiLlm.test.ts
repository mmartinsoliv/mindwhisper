import { describe, expect, it, vi } from 'vitest';
import { GeminiLlmProvider } from './geminiLlm';
import { ProviderError } from './types';

const req = { text: 'um hey john', language: 'en' as const, style: 'minimal' as const, removeFillers: true, autoPunctuation: true, dictionary: [] };
const reply = (text: string, finishReason = 'STOP') => new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 });
const call = (fetchImpl: typeof fetch, r = req) => new GeminiLlmProvider({ apiKey: 'k', model: 'mm', fetchImpl }).cleanup(r);

describe('GeminiLlmProvider', () => {
  it('calls generateContent with key header, system instruction and wrapped transcript', async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => reply('Hey John.'));
    expect(await call(fetchImpl)).toBe('Hey John.');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/mm:generateContent');
    expect((init!.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const body = JSON.parse(String(init!.body));
    expect(body.systemInstruction.parts[0].text).toMatch(/never add information/i);
    expect(body.contents[0].parts[0].text).toContain('<transcript>');
  });
  it('rejects empty output and output far longer than the input (invented content)', async () => {
    for (const text of ['', 'x'.repeat(500)]) {
      const err = await call(async () => reply(text)).catch((e) => e);
      expect(err.kind).toBe('provider_error');
    }
  });
  it('maps non-2xx to provider_error', async () => {
    expect((await call(async () => new Response('x', { status: 503 })).catch((e) => e)).kind).toBe('provider_error');
  });
  it('derives maxOutputTokens from the input length, covering a maximum-size dictation', async () => {
    const sizes: number[] = [];
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, i?: RequestInit) => { sizes.push(JSON.parse(String(i!.body)).generationConfig.maxOutputTokens); return reply('ok'); });
    await call(fetchImpl, { ...req, text: 'a'.repeat(20000) });
    await call(fetchImpl, { ...req, text: 'hi' });
    expect(sizes[0]!).toBeGreaterThanOrEqual(10000);
    expect(sizes[1]!).toBeLessThan(sizes[0]!);
  });
  it('rejects output cut off by the token limit instead of returning truncated text', async () => {
    const err = await call(async () => reply('Hey', 'MAX_TOKENS')).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_error');
  });
  it('maps a malformed upstream body to provider_error', async () => {
    const err = await call(async () => new Response('<html>', { status: 200 })).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_error');
  });
  it('maps a timeout while reading the body to provider_timeout', async () => {
    const res = { ok: true, status: 200, json: async () => { throw new DOMException('aborted', 'TimeoutError'); } } as unknown as Response;
    expect((await call(async () => res).catch((e) => e)).kind).toBe('provider_timeout');
  });
});
