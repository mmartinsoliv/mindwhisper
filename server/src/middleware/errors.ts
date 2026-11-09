import type { Context } from 'hono';
import { ProviderError } from '../providers/types';

export class HttpError extends Error {
  constructor(readonly status: 400 | 401 | 413 | 429, readonly code: string, message: string) { super(message); }
}

const body = (code: string, message: string) => ({ error: { code, message } });

export function errorHandler(err: Error, c: Context) {
  if (err instanceof HttpError) return c.json(body(err.code, err.message), err.status);
  if (err instanceof ProviderError) {
    return err.kind === 'provider_timeout'
      ? c.json(body('provider_timeout', 'The speech or text provider timed out. Try again.'), 504)
      : c.json(body('provider_error', 'The provider could not process this request. Try again.'), 502);
  }
  return c.json(body('internal', 'Unexpected server error.'), 500 as never);
}
