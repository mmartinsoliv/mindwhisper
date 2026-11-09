import { expect, test } from '@playwright/test';
import { installTauriMock } from './fixtures';

// The fixture must fail loudly: a wrongly named argument or an unknown command would otherwise pass silently.
test('the mocked runtime rejects malformed and unknown commands', async ({ page }) => {
  await installTauriMock(page);
  await page.goto('/');
  const invoke = (cmd: string, args?: Record<string, unknown>) => page.evaluate(
    async ([c, a]) => {
      try { await (window as unknown as { __TAURI_INTERNALS__: { invoke(c: string, a?: unknown): Promise<unknown> } }).__TAURI_INTERNALS__.invoke(c as string, a); return 'ok'; }
      catch (e) { return e instanceof Error ? e.message : JSON.stringify(e); }
    },
    [cmd, args] as const,
  );
  expect(await invoke('audio_start', { device_id: 'x' })).toMatch(/audio_start: invalid arguments.*deviceId/);
  expect(await invoke('insert_text', { text: 'hi' })).toMatch(/restoreClipboard/);
  expect(await invoke('shortcut_register', { accelerator: 'A', mode: 'sometimes' })).toMatch(/mode/);
  expect(await invoke('overlay_hide', { extra: 1 })).toMatch(/extra/);
  expect(await invoke('plugin:window|close', { label: 'main' })).toBe('unmocked command: plugin:window|close');
  expect(await invoke('no_such_command')).toBe('unmocked command: no_such_command');
  expect(await invoke('audio_start', { deviceId: null })).toBe('ok');
});
