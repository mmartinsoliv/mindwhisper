import { ProviderError, type SttProvider, type SttRequest, type SttResult } from './types';

interface Opts { apiKey: string; model: string; fetchImpl?: typeof fetch; baseUrl?: string }

export class OpenAiSttProvider implements SttProvider {
  readonly name = 'openai';
  constructor(private readonly o: Opts) {}

  async transcribe(req: SttRequest): Promise<SttResult> {
    const fd = new FormData();
    fd.append('file', new File([new Uint8Array(req.audio)],'audio.wav', { type: 'audio/wav' }));
    fd.append('model', this.o.model);
    fd.append('response_format', 'json');
    if (req.language !== 'auto') fd.append('language', req.language === 'pt-BR' ? 'pt' : 'en');
    if (req.vocabulary.length > 0) fd.append('prompt', `Vocabulary: ${req.vocabulary.join(', ')}.`);
    const f = this.o.fetchImpl ?? fetch;
    let json: { text?: string } | null;
    try {
      const res = await f(`${this.o.baseUrl ?? 'https://api.openai.com'}/v1/audio/transcriptions`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.o.apiKey}` }, body: fd, signal: req.signal });
      if (!res.ok) throw new ProviderError(`transcription provider returned ${res.status}`, 'provider_error');
      json = (await res.json()) as { text?: string } | null;
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      const name = (e as { name?: string }).name;
      throw new ProviderError('transcription request failed', name === 'TimeoutError' || name === 'AbortError' ? 'provider_timeout' : 'provider_error');
    }
    return { text: (json?.text ?? '').trim(), language: req.language === 'auto' ? null : req.language, durationMs: Math.round(((req.audio.byteLength - 44) / 32000) * 1000) };
  }
}
