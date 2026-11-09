import { defineConfig } from 'vitest/config';
import { ACCESS_REQUEST_URL, RELEASES_URL } from './src/config';

// Static fallbacks in index.html come from config.ts too, so the repository is named in one place only.
const staticLinks = {
  name: 'static-links',
  transformIndexHtml: (html: string) =>
    html.replaceAll('%RELEASES_URL%', RELEASES_URL).replaceAll('%ACCESS_REQUEST_URL%', ACCESS_REQUEST_URL.replaceAll('&', '&amp;')),
};

export default defineConfig({ plugins: [staticLinks], build: { target: 'es2022' }, test: { environment: 'node' } });
