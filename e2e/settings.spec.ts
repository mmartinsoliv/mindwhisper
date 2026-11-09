import { expect, test, type Page } from '@playwright/test';
import { installTauriMock, seedStore, settingsSeed, storeKeys } from './fixtures';

const openSettings = async (page: Page) => {
  await page.getByRole('navigation').getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
};

test('settings persist across a reload', async ({ page }) => {
  await installTauriMock(page);
  await seedStore(page, 'settings.json', 'settings', settingsSeed());
  await page.goto('/');
  await openSettings(page);

  await page.getByLabel('Language').selectOption('pt-BR');
  await page.getByLabel('Writing style').selectOption('professional');
  await page.getByRole('switch', { name: 'Save dictation history' }).click();
  await expect(page.getByLabel('Keep history for')).toBeDisabled();

  await page.reload();
  await openSettings(page);
  await expect(page.getByLabel('Language')).toHaveValue('pt-BR');
  await expect(page.getByLabel('Writing style')).toHaveValue('professional');
  await expect(page.getByRole('switch', { name: 'Save dictation history' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByLabel('Keep history for')).toBeDisabled();
});

test('delete all my data needs confirmation, removes everything and restarts onboarding', async ({ page }) => {
  await installTauriMock(page);
  await seedStore(page, 'settings.json', 'settings', settingsSeed());
  await seedStore(page, 'history.json', 'entries', [
    { id: 'h1', createdAt: Date.now(), rawText: 'um secret note', finalText: 'Secret note.', language: 'en', style: 'minimal', durationMs: 900 },
  ]);
  await seedStore(page, 'dictionary.json', 'entries', [{ id: 'd1', term: 'Mindwhisper' }]);
  await page.goto('/');
  await openSettings(page);

  await page.getByRole('button', { name: 'Delete all my data' }).click();
  // The first click only asks; nothing is deleted yet.
  await expect(page.getByRole('button', { name: 'Yes, delete everything' })).toBeVisible();
  expect((await storeKeys(page)).filter((k) => k.startsWith('history.json') || k.startsWith('dictionary.json'))).toHaveLength(2);

  await page.getByRole('button', { name: 'Yes, delete everything' }).click();
  await expect(page.getByRole('heading', { name: /welcome to mindwhisper/i })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: /welcome to mindwhisper/i })).toBeVisible();
  expect(await storeKeys(page)).toEqual([]); // settings, history and dictionary keys are all gone
});
