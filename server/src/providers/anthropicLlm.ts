import { buildCleanupPrompt } from './cleanupPrompt';
import { ProviderError, type CleanupRequest, type LlmProvider } from './types';

// Cleanup output is about as long as its input; allow generous headroom (pt-BR tokenises worse than English) up to a hard cap.
const maxTokensFor = (textLength: number) => Math.min(Math.ceil(textLength / 2) + 256, 16000);

interface Opts { apiKey: string; model: string; fetchImpl?: typeof fetch; baseUrl?: string }

export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';
  constructor(private readonly o: Opts) {}

  async cleanup(req: CleanupRequest): Promise<string> {
    const { system, user } = buildCleanupPrompt(req);
    const f = this.o.fetchImpl ?? fetch;
    let json: { stop_reason?: string; content?: { type: string; text?: string }[] } | null;
    try {
      const res = await f(`${this.o.baseUrl ?? 'https://api.anthropic.com'}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': this.o.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.o.model, max_tokens: maxTokensFor(req.text.length), system, messages: [{ role: 'user', content: user }] }),
        signal: req.signal,
      });
      if (!res.ok) throw new ProviderError(`cleanup provider returned ${res.status}`, 'provider_error');
      json = (await res.json()) as typeof json;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      const name = (e as { name?: string }).name;
      throw new ProviderError('cleanup request failed', name === 'TimeoutError' || name === 'AbortError' ? 'provider_timeout' : 'provider_error');
    }
    // A cut-off answer would silently drop the end of the user's dictation.
    if (json?.stop_reason === 'max_tokens') throw new ProviderError('cleanup output truncated', 'provider_error');
    const text = (json?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
    // Guard against invented content: cleanup must not balloon the text.
    if (text === '' || text.length > req.text.length * 2 + 50) throw new ProviderError('cleanup output rejected', 'provider_error');
    return text;
  }
}
