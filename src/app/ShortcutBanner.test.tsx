import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const status = vi.fn();
let onStatus: ((e: { payload: unknown }) => void) | undefined;
vi.mock('@/services/tauri/commands', () => ({ commands: { shortcutStatus: () => status() } }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, cb: (e: { payload: unknown }) => void) => { onStatus = cb; return () => { onStatus = undefined; }; }),
}));

import { ShortcutBanner } from './ShortcutBanner';

beforeEach(() => { status.mockReset(); onStatus = undefined; });

describe('ShortcutBanner', () => {
  it('shows nothing when the shortcut registered', async () => {
    status.mockResolvedValue(null);
    const { container } = render(<ShortcutBanner onOpenSettings={() => {}} />);
    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the failure found at startup and opens Settings', async () => {
    status.mockResolvedValue({ code: 'shortcut_taken', message: 'Another app is already using this shortcut. Pick a different one.' });
    const open = vi.fn();
    render(<ShortcutBanner onOpenSettings={open} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Another app is already using this shortcut');
    await userEvent.click(screen.getByRole('button', { name: /change shortcut/i }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('reacts to a status event and clears when the shortcut recovers', async () => {
    status.mockResolvedValue(null);
    render(<ShortcutBanner onOpenSettings={() => {}} />);
    await waitFor(() => expect(onStatus).toBeDefined());
    act(() => { onStatus!({ payload: { code: 'shortcut_invalid', message: 'Not a valid shortcut.' } }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Not a valid shortcut.');
    act(() => { onStatus!({ payload: null }); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('stays quiet when the status command fails', async () => {
    status.mockRejectedValue(new Error('boom'));
    const { container } = render(<ShortcutBanner onOpenSettings={() => {}} />);
    await waitFor(() => expect(status).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
