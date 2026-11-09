import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { calls, emitEvent, installTauriMock, mockBackend, readStore, seedStore, settingsSeed, waitForListener, type MockOptions } from './fixtures';
import type { DeepPartial, Settings } from '../src/types/settings';

/** Two pages in one browser context, like the two Tauri windows: the main window and the overlay that hosts the controller. */
async function boot(context: BrowserContext, opts: MockOptions = {}, settings: DeepPartial<Settings> = {}) {
  const main = await context.newPage(); const overlay = await context.newPage();
  await installTauriMock(main, opts); await installTauriMock(overlay, opts);
  await seedStore(main, 'settings.json', 'settings', settingsSeed(settings));
  await main.goto('/'); await overlay.goto('/overlay.html');
  await expect(main.getByRole('navigation')).toBeVisible();
  await expect.poll(async () => (await calls(overlay)).some((c) => c.cmd === 'shortcut_register')).toBe(true);
  // The overlay host listens for the main window's commands and the hotkey only after startup finishes.
  await waitForListener(overlay, 'dictation://command');
  await waitForListener(overlay, 'dictation://hotkey');
  await waitForListener(main, 'dictation://state');
  return { main, overlay };
}

/** The overlay hides itself when "Inserted" returns to idle (1.2 s later); counting inserts only after that catches a late duplicate. */
async function untilIdle(main: Page) {
  await expect.poll(async () => (await calls(main)).some((c) => c.cmd === 'overlay_hide')).toBe(true);
}

test('record → transcribe → clean → insert once → history', async ({ context }) => {
  const backend = await mockBackend(context);
  const { main, overlay } = await boot(context);
  await main.getByRole('button', { name: /start dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/recording/i);
  await overlay.getByRole('button', { name: /stop dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/inserted/i);
  await untilIdle(main);
  const inserts = (await calls(main)).filter((c) => c.cmd === 'insert_text');
  expect(inserts).toHaveLength(1);
  expect(inserts[0]!.args).toMatchObject({ text: 'Hello world.', restoreClipboard: true });
  expect(backend.requests.transcribe).toHaveLength(1);
  expect(backend.requests.transcribe[0]!.authorization).toBe('Bearer tok');
  expect(backend.requests.cleanup).toHaveLength(1);
  expect(backend.requests.cleanup[0]!.body).toMatchObject({ text: 'um hello world', style: 'minimal' });
  await main.getByRole('navigation').getByRole('button', { name: 'History' }).click();
  await expect(main.getByTestId('history-item')).toHaveCount(1);
  await expect(main.getByTestId('history-item')).toContainText('Hello world.');
  expect((await calls(main)).map((c) => c.cmd)).toEqual(expect.arrayContaining(['overlay_show', 'audio_start', 'audio_stop', 'overlay_hide']));
});

test('cancel while recording releases the microphone and inserts nothing', async ({ context }) => {
  const backend = await mockBackend(context);
  const { main, overlay } = await boot(context);
  await main.getByRole('button', { name: /start dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/recording/i);
  await overlay.getByRole('button', { name: /cancel dictation/i }).click();
  await expect.poll(async () => (await calls(main)).some((c) => c.cmd === 'audio_cancel')).toBe(true);
  await untilIdle(main);
  await expect(overlay.getByRole('status')).toHaveCount(0);
  expect((await calls(main)).some((c) => c.cmd === 'insert_text')).toBe(false);
  expect((await calls(main)).some((c) => c.cmd === 'audio_stop')).toBe(false);
  expect(backend.requests.transcribe).toHaveLength(0);
  expect(backend.requests.cleanup).toHaveLength(0);
});

test('a transcription failure shows Retry, and retrying inserts exactly once', async ({ context }) => {
  const backend = await mockBackend(context, { transcribeStatuses: [502] }); // first request fails, then succeeds
  const { main, overlay } = await boot(context);
  await main.getByRole('button', { name: /start dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/recording/i);
  await overlay.getByRole('button', { name: /stop dictation/i }).click();
  await expect(overlay.getByRole('alert')).toBeVisible();
  await expect(overlay.getByRole('button', { name: /retry/i })).toBeVisible();
  expect((await calls(main)).some((c) => c.cmd === 'insert_text')).toBe(false);
  await overlay.getByRole('button', { name: /retry/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/inserted/i);
  await untilIdle(main);
  expect((await calls(main)).filter((c) => c.cmd === 'insert_text')).toHaveLength(1);
  expect(backend.requests.transcribe).toHaveLength(2);
  expect((await calls(main)).filter((c) => c.cmd === 'audio_start')).toHaveLength(1); // retry reuses the in-memory recording
});

test('with history disabled nothing is stored', async ({ context }) => {
  await mockBackend(context);
  const { main, overlay } = await boot(context, {}, { history: { enabled: false, retentionDays: 30 } });
  await main.getByRole('button', { name: /start dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/recording/i);
  await overlay.getByRole('button', { name: /stop dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/inserted/i);
  await untilIdle(main);
  await main.getByRole('navigation').getByRole('button', { name: 'History' }).click();
  await expect(main.getByText(/history is off/i)).toBeVisible();
  expect(await readStore(main, 'history.json', 'entries')).toBeUndefined();
});

test('the shortcut event drives the same flow without touching the main window UI', async ({ context }) => {
  await mockBackend(context);
  const { main, overlay } = await boot(context);
  await emitEvent(main, 'dictation://hotkey', { action: 'toggle' });
  await expect(overlay.getByRole('status')).toContainText(/recording/i);
  await emitEvent(main, 'dictation://hotkey', { action: 'toggle' });
  await expect(overlay.getByRole('status')).toContainText(/inserted/i);
  await untilIdle(main);
  expect((await calls(main)).filter((c) => c.cmd === 'insert_text')).toHaveLength(1);
});

test('the language and microphone chosen in Settings reach the native and backend calls', async ({ context }) => {
  const backend = await mockBackend(context);
  const { main, overlay } = await boot(context);
  const nav = main.getByRole('navigation');
  await nav.getByRole('button', { name: 'Settings' }).click();
  await main.getByLabel('Language').selectOption('pt-BR');
  await main.getByLabel('Microphone').selectOption('mock-mic');
  await nav.getByRole('button', { name: 'Dictation' }).click();
  await main.getByRole('button', { name: /start dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/recording/i);
  await overlay.getByRole('button', { name: /stop dictation/i }).click();
  await expect(overlay.getByRole('status')).toContainText(/inserted/i);
  await untilIdle(main);
  expect((await calls(main)).find((c) => c.cmd === 'audio_start')?.args).toEqual({ deviceId: 'mock-mic' });
  expect(backend.requests.transcribe[0]!.language).toBe('pt-BR');
  expect(backend.requests.cleanup[0]!.body).toMatchObject({ language: 'pt-BR' });
});
