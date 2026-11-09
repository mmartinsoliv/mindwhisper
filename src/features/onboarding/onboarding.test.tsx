import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const cmd = vi.hoisted(() => ({
  audioProbe: vi.fn(async () => {}), openSystemSettings: vi.fn(async () => {}), shortcutRegister: vi.fn(async () => {}),
  checkPermissions: vi.fn(async () => ({ platform: 'macos', accessibility: 'granted' })),
}));
vi.mock('@/services/tauri/commands', async (orig) => ({ ...(await orig<typeof import('@/services/tauri/commands')>()), commands: cmd }));
const sendCommand = vi.fn(async (_c?: unknown) => {});
vi.mock('@/services/dictation/bridge', () => ({ listenSnapshots: vi.fn(async () => () => {}), sendCommand: (c: unknown) => sendCommand(c) }));

import { CommandError } from '@/services/tauri/commands';
import { MemoryKeyValueStore, setRepositories, SettingsRepository, HistoryRepository, DictionaryRepository } from '@/services/storage';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDictationStore } from '@/stores/dictationStore';
import { IDLE_SNAPSHOT } from '@/types/dictation';
import { DEFAULT_SETTINGS } from '@/types/settings';
import { Onboarding } from './Onboarding';

beforeEach(() => {
  Object.values(cmd).forEach((f) => f.mockClear()); sendCommand.mockClear();
  setRepositories({ settings: new SettingsRepository(new MemoryKeyValueStore()), history: new HistoryRepository(new MemoryKeyValueStore()), dictionary: new DictionaryRepository(new MemoryKeyValueStore()) });
  useSettingsStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
  useDictationStore.setState({ snapshot: IDLE_SNAPSHOT });
});
const next = () => userEvent.click(screen.getByRole('button', { name: /^(next|continue)$/i }));

const toTestStep = async () => {
  await next();
  await userEvent.click(screen.getByRole('button', { name: /allow microphone/i })); await screen.findByText(/microphone is working/i);
  await next(); await next();
  await screen.findByRole('heading', { name: /try it/i });
};

describe('Onboarding polish', () => {
  it('keeps the server fields mounted while a token is typed', async () => {
    render(<Onboarding />);
    await toTestStep();
    const token = screen.getByLabelText(/^access token/i);
    await userEvent.type(token, 'abcdef');
    expect(screen.getByLabelText(/^access token/i)).toBe(token);
    expect(token).toHaveValue('abcdef');
    expect(screen.getByLabelText('Server URL')).toBeInTheDocument();
  });
  it('moves focus to the new step heading and announces the step', async () => {
    render(<Onboarding />);
    await next();
    expect(screen.getByRole('heading', { name: /microphone/i })).toHaveFocus();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 6');
  });
  it('reminds a user without a token to add one in Settings on the final step', async () => {
    render(<Onboarding />);
    await toTestStep();
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    await next();
    expect(screen.getByText(/add your access token in settings/i)).toBeInTheDocument();
  });
  it('omits the reminder when a token is saved', async () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, backend: { url: 'http://x', token: 't' } }, loaded: true });
    render(<Onboarding />);
    await toTestStep();
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    await next();
    expect(screen.queryByText(/add your access token in settings/i)).not.toBeInTheDocument();
  });
});

describe('Onboarding', () => {
  it('walks the six steps in order and finishes with onboardingDone = true', async () => {
    render(<Onboarding />);
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    await next();

    expect(screen.getByRole('heading', { name: /microphone/i })).toBeInTheDocument();
    expect(screen.getByText(/sent to your mindwhisper server/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /allow microphone/i }));
    expect(cmd.audioProbe).toHaveBeenCalledWith(null);
    expect(await screen.findByText(/microphone is working/i)).toBeInTheDocument();
    await next();

    expect(screen.getByRole('heading', { name: /shortcut/i })).toBeInTheDocument();
    await next();
    expect(cmd.shortcutRegister).toHaveBeenCalledWith(DEFAULT_SETTINGS.shortcut.accelerator, 'toggle');

    expect(screen.getByRole('heading', { name: /try it/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /start test/i }));
    expect(sendCommand).toHaveBeenCalledWith({ type: 'toggle' });
    await userEvent.type(screen.getByRole('textbox', { name: /test area/i }), 'Hello there.');
    await next();

    expect(screen.getByRole('heading', { name: /language/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /português/i }));
    await next();

    expect(screen.getByRole('heading', { name: /you're all set/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /start using mindwhisper/i }));
    const s = useSettingsStore.getState().settings;
    expect(s.onboardingDone).toBe(true);
    expect(s.language).toBe('pt-BR');
  });
  it('shows a recoverable message and a settings shortcut when microphone access fails', async () => {
    cmd.audioProbe.mockRejectedValueOnce(new CommandError('permission_denied', 'Microphone access is blocked.'));
    render(<Onboarding />);
    await next();
    await userEvent.click(screen.getByRole('button', { name: /allow microphone/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked/i);
    await userEvent.click(screen.getByRole('button', { name: /open system settings/i }));
    expect(cmd.openSystemSettings).toHaveBeenCalledWith('microphone');
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/microphone is working/i)).toBeInTheDocument();
  });
  it('Back returns to the previous step without losing choices', async () => {
    render(<Onboarding />);
    await next();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
  });
  it('the test step can be skipped, and warns when text insertion needs Accessibility permission', async () => {
    cmd.checkPermissions.mockResolvedValueOnce({ platform: 'macos', accessibility: 'denied' });
    render(<Onboarding />);
    await next();
    await userEvent.click(screen.getByRole('button', { name: /allow microphone/i })); await screen.findByText(/microphone is working/i);
    await next(); await next();
    expect(await screen.findByText(/accessibility/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /open system settings/i }));
    expect(cmd.openSystemSettings).toHaveBeenCalledWith('accessibility');
    await userEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(screen.getByRole('heading', { name: /language/i })).toBeInTheDocument();
  });
});
