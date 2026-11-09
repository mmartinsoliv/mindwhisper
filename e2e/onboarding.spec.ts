import { expect, test } from '@playwright/test';
import { calls, installTauriMock } from './fixtures';

test('a new user completes setup and lands in the main app', async ({ page }) => {
  await installTauriMock(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /welcome to mindwhisper/i })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: /allow microphone/i }).click();
  await expect(page.getByText(/microphone is working/i)).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: /your shortcut/i })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: /try it/i })).toBeVisible();
  await page.getByRole('button', { name: /skip/i }).click();

  await page.getByRole('radio', { name: /português/i }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /start using mindwhisper/i }).click();

  await expect(page.getByRole('navigation')).toBeVisible();
  const names = (await calls(page)).map((c) => c.cmd);
  expect(names).toContain('audio_probe');
  expect(names).toContain('shortcut_register');
  const log = await calls(page);
  expect(log.find((c) => c.cmd === 'audio_probe')?.args).toEqual({ deviceId: null });
  expect(log.find((c) => c.cmd === 'shortcut_register')?.args).toEqual({ accelerator: 'CommandOrControl+Shift+Space', mode: 'toggle' });
  await page.reload();
  await expect(page.getByRole('navigation')).toBeVisible(); // onboarding is not shown again
});

test('a blocked microphone shows a recoverable error', async ({ page }) => {
  await installTauriMock(page, { failures: { audio_probe: { code: 'permission_denied', message: 'Microphone access is blocked.', once: true } } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /allow microphone/i }).click();
  await expect(page.getByRole('alert')).toContainText('blocked');
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
  await page.getByRole('button', { name: /try again/i }).click();
  await expect(page.getByText(/microphone is working/i)).toBeVisible();
});
