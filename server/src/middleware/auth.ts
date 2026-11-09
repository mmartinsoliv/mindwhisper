import { createHash, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { HttpError } from './errors';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function auth(tokens: string[]): MiddlewareHandler {
  const digests = tokens.map(digest);
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const m = /^Bearer (.+)$/.exec(header);
    if (!m) throw new HttpError(401, 'unauthorized', 'Missing or invalid token.');
    const presented = digest(m[1]!);
    if (!digests.some((d) => timingSafeEqual(d, presented))) throw new HttpError(401, 'unauthorized', 'Missing or invalid token.');
    c.set('tokenId', presented.toString('hex').slice(0, 16));
    await next();
  };
}
