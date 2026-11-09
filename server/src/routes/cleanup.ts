import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { HttpError } from '../middleware/errors';
import type { LlmProvider } from '../providers/types';

const MAX_BODY = 256 * 1024;
const schema = z.object({
  text: z.string().min(1).max(20000),
  language: z.enum(['auto', 'en', 'pt-BR']),
  style: z.enum(['minimal', 'professional', 'casual', 'concise']),
  removeFillers: z.boolean(),
  autoPunctuation: z.boolean(),
  dictionary: z.array(z.object({ term: z.string().min(1).max(64), spoken: z.string().max(64).optional() })).max(200),
});

export function cleanupRoute(llm: LlmProvider) {
  return new Hono().post('/v1/cleanup',
    bodyLimit({ maxSize: MAX_BODY, onError: (c) => c.json({ error: { code: 'payload_too_large', message: 'Text is too large.' } }, 413) }),
    async (c) => {
      let raw: unknown;
      try { raw = await c.req.json(); } catch { throw new HttpError(400, 'invalid_request', 'Body must be JSON.'); }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Invalid cleanup request.');
      const text = await llm.cleanup({ ...parsed.data, signal: AbortSignal.timeout(30_000) });
      return c.json({ text, provider: llm.name });
    },
  );
}
