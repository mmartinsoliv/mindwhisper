// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const conf = JSON.parse(readFileSync(new URL('../../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

describe('tauri.conf.json release settings', () => {
  const csp: string = conf.app.security.csp;
  const directive = (name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) ?? '';

  it('defines a content security policy', () => {
    expect(typeof csp).toBe('string');
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('script-src')).toBe("script-src 'self'");
  });
  it('lets the app reach Tauri IPC, any HTTPS backend and a local backend, and nothing else', () => {
    const connect = directive('connect-src').split(' ');
    for (const src of ["'self'", 'ipc:', 'http://ipc.localhost', 'https:', 'http://127.0.0.1:*', 'http://localhost:*']) expect(connect).toContain(src);
    expect(connect).not.toContain('*');
    expect(connect).not.toContain('http:');
  });
  it('signs macOS builds ad hoc so Apple Silicon will run them', () => {
    expect(conf.bundle.macOS.signingIdentity).toBe('-');
  });
});
