import { describe, expect, it, vi } from 'vitest';
import { AnthropicLlmProvider } from './anthropicLlm';
import { ProviderError } from './types';

const req = { text: 'um hey john', language: 'en' as const, style: 'minimal' as const, removeFillers: true, autoPunctuation: true, dictionary: [] };
const reply = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200 });

describe('AnthropicLlmProvider', () => {
  it('calls the Messages API with key, version, system and wrapped transcript', async () => {
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, _i?: RequestInit) => reply('Hey John.'));
    const out = await new AnthropicLlmProvider({ apiKey: 'k', model: 'mm', fetchImpl }).cleanup(req);
    expect(out).toBe('Hey John.');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    const h = init!.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('k');
    expect(h['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe('mm');
    expect(body.system).toMatch(/never add information/i);
    expect(body.messages[0].content).toContain('<transcript>');
  });
  it('rejects empty output and output far longer than the input (invented content)', async () => {
    for (const text of ['', 'x'.repeat(500)]) {
      const err = await new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => reply(text) }).cleanup(req).catch((e) => e);
      expect(err.kind).toBe('provider_error');
    }
  });
  it('maps non-2xx to provider_error', async () => {
    const err = await new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => new Response('x', { status: 529 }) }).cleanup(req).catch((e) => e);
    expect(err.kind).toBe('provider_error');
  });
  it('derives max_tokens from the input length, covering a maximum-size dictation', async () => {
    const sizes: number[] = [];
    const fetchImpl = vi.fn(async (_u: RequestInfo | URL, i?: RequestInit) => { sizes.push(JSON.parse(String(i!.body)).max_tokens); return reply('ok'); });
    const p = new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl });
    await p.cleanup({ ...req, text: 'a'.repeat(20000) });
    await p.cleanup({ ...req, text: 'hi' });
    expect(sizes[0]!).toBeGreaterThanOrEqual(10000);
    expect(sizes[1]!).toBeLessThan(sizes[0]!);
  });
  it('rejects output cut off by the token limit instead of returning truncated text', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Hey' }] }), { status: 200 });
    const err = await new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl }).cleanup(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_error');
  });
  it('maps a malformed upstream body to provider_error', async () => {
    const err = await new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => new Response('<html>', { status: 200 }) }).cleanup(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_error');
  });
  it('maps a timeout while reading the body to provider_timeout', async () => {
    const res = { ok: true, status: 200, json: async () => { throw new DOMException('aborted', 'TimeoutError'); } } as unknown as Response;
    const err = await new AnthropicLlmProvider({ apiKey: 'k', model: 'm', fetchImpl: async () => res }).cleanup(req).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe('provider_timeout');
  });
});
