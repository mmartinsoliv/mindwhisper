export type Os = 'mac' | 'windows' | 'other';
export type DownloadId = 'mac-arm' | 'mac-intel' | 'windows';
export interface ReleaseAsset { name: string; browser_download_url: string }
export interface Download { id: DownloadId; label: string; url: string }

export function detectOs(ua: string): Os {
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) return 'mac';
  return 'other';
}

// tauri-action names assets <ProductName>_<version>_<arch>.<ext>; match on the tail so a version bump needs no change here.
const RULES: { id: DownloadId; label: string; test: RegExp }[] = [
  { id: 'mac-arm', label: 'macOS, Apple Silicon', test: /_aarch64\.dmg$/i },
  { id: 'mac-intel', label: 'macOS, Intel', test: /_x64\.dmg$/i },
  { id: 'windows', label: 'Windows 10 and 11', test: /_x64-setup\.exe$/i },
];
const WINDOWS_MSI = /_x64_en-US\.msi$/i;

export function pickDownloads(assets: ReleaseAsset[]): Download[] {
  const out: Download[] = [];
  for (const r of RULES) {
    const a = assets.find((x) => r.test.test(x.name)) ?? (r.id === 'windows' ? assets.find((x) => WINDOWS_MSI.test(x.name)) : undefined);
    if (a) out.push({ id: r.id, label: r.label, url: a.browser_download_url });
  }
  return out;
}

export function primaryFor(os: Os, downloads: Download[]): Download | undefined {
  if (os === 'windows') return downloads.find((d) => d.id === 'windows');
  if (os === 'mac') return downloads.find((d) => d.id === 'mac-arm') ?? downloads.find((d) => d.id === 'mac-intel');
  return undefined;
}

/** Never throws: any failure means "no direct links", and the page keeps its link to the releases page. */
export async function loadDownloads(fetchFn: typeof fetch, apiUrl: string): Promise<Download[]> {
  try {
    const res = await fetchFn(apiUrl, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return [];
    const body = (await res.json()) as { assets?: ReleaseAsset[] };
    return Array.isArray(body.assets) ? pickDownloads(body.assets) : [];
  } catch {
    return [];
  }
}
