import { describe, expect, it } from 'vitest';

describe('scaffold', () => {
  it('runs vitest with jsdom and the @ alias config', async () => {
    expect(typeof document).toBe('object');
    expect(1 + 1).toBe(2);
  });
});
