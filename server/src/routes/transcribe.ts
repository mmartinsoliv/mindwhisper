import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { HttpError } from '../middleware/errors';
import type { SttProvider } from '../providers/types';

const MAX_AUDIO = 25 * 1024 * 1024;
const language = z.enum(['auto', 'en', 'pt-BR']);
const vocabulary = z.array(z.string().min(1).max(64)).max(100);

export function transcribeRoute(stt: SttProvider) {
  return new Hono().post(
    '/v1/transcribe',
    bodyLimit({ maxSize: MAX_AUDIO + 1024 * 1024, onError: (c) => c.json({ error: { code: 'payload_too_large', message: 'Recording is too large.' } }, 413) }),
    async (c) => {
      let form: Record<string, unknown>;
      try { form = await c.req.parseBody(); } catch { throw new HttpError(400, 'invalid_request', 'Expected multipart/form-data.'); }
      const audio = form.audio;
      if (!(audio instanceof File) || audio.size <= 44) throw new HttpError(400, 'invalid_request', 'Missing audio file.');
      if (audio.size > MAX_AUDIO) throw new HttpError(413, 'payload_too_large', 'Recording is too large.');
      const lang = language.safeParse(form.language ?? 'auto');
      if (!lang.success) throw new HttpError(400, 'invalid_request', 'Unsupported language.');
      let vocab: string[] = [];
      if (typeof form.vocabulary === 'string' && form.vocabulary !== '') {
        let parsed: unknown;
        try { parsed = JSON.parse(form.vocabulary); } catch { throw new HttpError(400, 'invalid_request', 'vocabulary must be a JSON array.'); }
        const v = vocabulary.safeParse(parsed);
        if (!v.success) throw new HttpError(400, 'invalid_request', 'vocabulary must be up to 100 strings of up to 64 characters.');
        vocab = v.data;
      }
      const result = await stt.transcribe({ audio: new Uint8Array(await audio.arrayBuffer()), language: lang.data, vocabulary: vocab, signal: AbortSignal.timeout(60_000) });
      return c.json({ text: result.text, language: result.language, durationMs: result.durationMs, provider: stt.name });
    },
  );
}
