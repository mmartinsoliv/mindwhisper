import '@/styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from '@/styles/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { OverlayApp } from './OverlayApp';
import { startOverlayHost } from './bootstrap';

async function main() {
  useSettingsStore.subscribe((s) => applyTheme(s.settings.theme));
  const host = await startOverlayHost(); // loads settings → the subscription above applies the theme
  applyTheme(useSettingsStore.getState().settings.theme);
  createRoot(document.getElementById('root')!).render(<StrictMode><OverlayApp controller={host.controller} /></StrictMode>);
}
main().catch((e: unknown) => {
  const code = typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : e instanceof Error ? e.name : 'unknown';
  console.error(`[overlay] failed to start (${code})`);
});
