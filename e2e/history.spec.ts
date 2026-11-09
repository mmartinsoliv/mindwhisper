import { expect, test, type Page } from '@playwright/test';
import { calls, installTauriMock, seedStore, settingsSeed } from './fixtures';

const entry = (id: string, finalText: string, ageMs: number) => ({
  id, createdAt: Date.now() - ageMs, rawText: finalText.toLowerCase(), finalText, language: 'en', style: 'minimal', durationMs: 1200,
});

async function openHistory(page: Page) {
  await page.getByRole('navigation').getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
}

test('search, delete, reinsert and clear all', async ({ page }) => {
  await installTauriMock(page);
  await seedStore(page, 'settings.json', 'settings', settingsSeed());
  await seedStore(page, 'history.json', 'entries', [
    entry('a', 'Alpha meeting notes', 3000), entry('b', 'Beta release plan', 2000), entry('c', 'Gamma budget', 1000),
  ]);
  await page.goto('/');
  await openHistory(page);
  const items = page.getByTestId('history-item');
  await expect(items).toHaveCount(3);

  await page.getByRole('searchbox', { name: /search history/i }).fill('beta');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Beta release plan');
  await page.getByRole('searchbox', { name: /search history/i }).fill('');
  await expect(items).toHaveCount(3);

  await items.filter({ hasText: 'Gamma budget' }).getByRole('button', { name: /^delete/i }).click();
  await expect(items).toHaveCount(2);

  await items.filter({ hasText: 'Beta release plan' }).getByRole('button', { name: /^reinsert/i }).click();
  await expect.poll(async () => (await calls(page)).some((c) => c.cmd === 'insert_text')).toBe(true);
  const log = (await calls(page)).map((c) => c.cmd);
  expect(log.indexOf('plugin:window|hide')).toBeGreaterThanOrEqual(0);
  expect(log.indexOf('plugin:window|hide')).toBeLessThan(log.indexOf('insert_text'));
  const insert = (await calls(page)).find((c) => c.cmd === 'insert_text');
  expect(insert?.args).toMatchObject({ text: 'Beta release plan', restoreClipboard: true });

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(items).toHaveCount(2); // the first click only asks for confirmation
  await page.getByRole('button', { name: 'Confirm clear' }).click();
  await expect(page.getByText('Nothing here yet.')).toBeVisible();
  await expect(items).toHaveCount(0);
});

test('history off explains why nothing is listed', async ({ page }) => {
  await installTauriMock(page);
  await seedStore(page, 'settings.json', 'settings', settingsSeed({ history: { enabled: false, retentionDays: 30 } }));
  await page.goto('/');
  await openHistory(page);
  await expect(page.getByText(/history is off/i)).toBeVisible();
});
