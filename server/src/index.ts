import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig } from './config';
import { buildProviders } from './providers';

const config = loadConfig();
const app = createApp({ config, ...buildProviders(config) });
serve({ fetch: app.fetch, port: config.port, hostname: '127.0.0.1' }, (i) => console.log(`mindwhisper server listening on ${i.address}:${i.port}`));
