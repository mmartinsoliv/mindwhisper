import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMIT_DELAY_MS, CommitTextField } from './CommitTextField';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const setup = (value = 'old') => {
  const onCommit = vi.fn();
  const view = render(<CommitTextField label="Server URL" value={value} onCommit={onCommit} />);
  return { onCommit, input: screen.getByLabelText('Server URL') as HTMLInputElement, view };
};

describe('CommitTextField', () => {
  it('shows what is typed immediately but commits only after the idle delay', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: 'https://a' } });
    fireEvent.change(input, { target: { value: 'https://ab' } });
    expect(input.value).toBe('https://ab');
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(COMMIT_DELAY_MS - 1); });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith('https://ab');
  });

  it('commits on blur without waiting', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('x');
    act(() => { vi.advanceTimersByTime(COMMIT_DELAY_MS * 2); });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('commits a pending edit when it unmounts', () => {
    const { onCommit, input, view } = setup();
    fireEvent.change(input, { target: { value: 'pending' } });
    view.unmount();
    expect(onCommit).toHaveBeenCalledWith('pending');
  });

  it('does not commit when nothing was typed', () => {
    const { onCommit, input, view } = setup();
    fireEvent.blur(input);
    view.unmount();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('follows an outside change while the user is not typing', () => {
    const { view } = setup('one');
    view.rerender(<CommitTextField label="Server URL" value="two" onCommit={() => {}} />);
    expect((screen.getByLabelText('Server URL') as HTMLInputElement).value).toBe('two');
  });
});
