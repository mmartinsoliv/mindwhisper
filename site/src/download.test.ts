import { describe, expect, it, vi } from 'vitest';
import { detectOs, loadDownloads, pickDownloads, primaryFor, type ReleaseAsset } from './download';

const asset = (name: string): ReleaseAsset => ({ name, browser_download_url: `https://example.test/${name}` });
const release = [
  asset('Mindwhisper_0.1.0_aarch64.dmg'), asset('Mindwhisper_0.1.0_x64.dmg'),
  asset('Mindwhisper_0.1.0_x64-setup.exe'), asset('Mindwhisper_0.1.0_x64_en-US.msi'), asset('latest.json'),
];

describe('detectOs', () => {
  it('recognises the desktop systems we ship for', () => {
    expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15')).toBe('mac');
    expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36')).toBe('windows');
  });
  it('treats phones, Linux and unknown agents as other', () => {
    expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('other');
    expect(detectOs('Mozilla/5.0 (X11; Linux x86_64) Firefox/130')).toBe('other');
    expect(detectOs('')).toBe('other');
  });
});

describe('pickDownloads', () => {
  it('maps release assets to the three downloads by name, whatever the version', () => {
    expect(pickDownloads(release).map((d) => [d.id, d.url.split('/').pop()])).toEqual([
      ['mac-arm', 'Mindwhisper_0.1.0_aarch64.dmg'], ['mac-intel', 'Mindwhisper_0.1.0_x64.dmg'], ['windows', 'Mindwhisper_0.1.0_x64-setup.exe'],
    ]);
    expect(pickDownloads([asset('Mindwhisper_12.4.1_aarch64.dmg')]).map((d) => d.id)).toEqual(['mac-arm']);
  });
  it('falls back to the MSI when there is no setup executable', () => {
    expect(pickDownloads([asset('Mindwhisper_0.1.0_x64_en-US.msi')]).map((d) => [d.id, d.url.split('/').pop()])).toEqual([['windows', 'Mindwhisper_0.1.0_x64_en-US.msi']]);
  });
  it('returns nothing for a release without installers', () => {
    expect(pickDownloads([asset('latest.json'), asset('source.zip')])).toEqual([]);
  });
});

describe('primaryFor', () => {
  const all = pickDownloads(release);
  it('picks Apple Silicon for Macs, the installer for Windows, nothing otherwise', () => {
    expect(primaryFor('mac', all)?.id).toBe('mac-arm');
    expect(primaryFor('windows', all)?.id).toBe('windows');
    expect(primaryFor('other', all)).toBeUndefined();
  });
  it('uses the Intel build on a Mac when it is the only one', () => {
    expect(primaryFor('mac', all.filter((d) => d.id === 'mac-intel'))?.id).toBe('mac-intel');
  });
});

describe('loadDownloads', () => {
  const json = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);
  it('reads the latest release from the API', async () => {
    expect((await loadDownloads(json({ assets: release }), 'https://api.test/latest')).length).toBe(3);
  });
  it('returns an empty list instead of throwing when the request fails, is refused or is malformed', async () => {
    expect(await loadDownloads(vi.fn(async () => { throw new Error('offline'); }), 'u')).toEqual([]);
    expect(await loadDownloads(json({}, false), 'u')).toEqual([]);
    expect(await loadDownloads(json({ nothing: true }), 'u')).toEqual([]);
  });
});
