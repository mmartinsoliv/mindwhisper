import type { MiddlewareHandler } from 'hono';
import { HttpError } from './errors';

/** The shape of a Cloudflare Workers Rate Limiting binding. */
export interface RateLimitBinding { limit(opts: { key: string }): Promise<{ success: boolean }> }

/** Same contract as `rateLimit`, but the counting lives in Cloudflare, so it holds across isolates and restarts. */
export function rateLimitBinding(binding: RateLimitBinding): MiddlewareHandler {
  return async (c, next) => {
    const key = (c.get('tokenId') as string | undefined) ?? 'anon';
    const { success } = await binding.limit({ key });
    if (!success) throw new HttpError(429, 'rate_limited', 'Too many requests. Wait a moment and try again.');
    await next();
  };
}
