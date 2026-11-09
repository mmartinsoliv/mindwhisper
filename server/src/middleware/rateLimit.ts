import type { MiddlewareHandler } from 'hono';
import { HttpError } from './errors';

export function rateLimit(limitPerMin: number, now: () => number = Date.now): MiddlewareHandler {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return async (c, next) => {
    const key = (c.get('tokenId') as string | undefined) ?? 'anon';
    const t = now();
    let w = windows.get(key);
    if (!w || t >= w.resetAt) { w = { count: 0, resetAt: t + 60_000 }; windows.set(key, w); }
    w.count += 1;
    if (w.count > limitPerMin) throw new HttpError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.');
    await next();
  };
}
