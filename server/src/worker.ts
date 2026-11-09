import type { ExecutionContext } from 'hono';
import { createApp } from './app';
import { loadConfig } from './config';
import { rateLimitBinding, type RateLimitBinding } from './middleware/rateLimitBinding';
import { buildProviders } from './providers';
import { assertProductionConfig, stringVars } from './workerEnv';

interface Env { RATE_LIMITER: RateLimitBinding; [name: string]: unknown }

let app: ReturnType<typeof createApp> | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    if (!app) {
      const config = loadConfig(stringVars(env));
      assertProductionConfig(config);
      app = createApp({ config, ...buildProviders(config), limiter: rateLimitBinding(env.RATE_LIMITER) });
    }
    return app.fetch(request, env, ctx);
  },
};
