import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Config } from './config';
import { auth } from './middleware/auth';
import { errorHandler } from './middleware/errors';
import { rateLimit } from './middleware/rateLimit';
import type { LlmProvider, SttProvider } from './providers/types';
import { cleanupRoute } from './routes/cleanup';
import { health } from './routes/health';
import { transcribeRoute } from './routes/transcribe';

export function createApp(deps: { config: Config; stt: SttProvider; llm: LlmProvider }) {
  const app = new Hono();
  app.onError(errorHandler);
  // The Tauri webview calls this API cross-origin (tauri://localhost on macOS, http(s)://tauri.localhost on Windows, localhost:1420 in dev).
  app.use('*', cors({
    origin: ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:1420'],
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }));
  app.route('/', health);
  app.use('/v1/*', auth(deps.config.appTokens), rateLimit(deps.config.rateLimitPerMin));
  app.route('/', transcribeRoute(deps.stt));
  app.route('/', cleanupRoute(deps.llm));
  return app;
}
