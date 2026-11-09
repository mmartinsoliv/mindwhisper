import '@fontsource-variable/inter';
import './styles.css';
import { ACCESS_REQUEST_URL, LATEST_RELEASE_API, RELEASES_URL } from './config';
import { detectOs, loadDownloads, primaryFor, type Download } from './download';

document.querySelectorAll<HTMLAnchorElement>('[data-access-link]').forEach((a) => { a.href = ACCESS_REQUEST_URL; });
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());

function linkItem(href: string, text: string, rel?: string): HTMLLIElement {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = href; a.textContent = text;
  if (rel) a.rel = rel;
  li.append(a);
  return li;
}

function render(downloads: Download[]) {
  const primary = document.getElementById('download-primary') as HTMLAnchorElement | null;
  const list = document.getElementById('download-list');
  if (!primary || !list) return;
  list.replaceChildren(...downloads.map((d) => linkItem(d.url, d.label, 'noopener')));
  const os = detectOs(navigator.userAgent);
  const pick = primaryFor(os, downloads);
  if (pick) { primary.href = pick.url; primary.textContent = `Download for ${os === 'mac' ? 'macOS' : 'Windows'}`; }
  else { primary.href = '#download'; primary.textContent = 'See downloads'; }
}

void loadDownloads(fetch, LATEST_RELEASE_API).then((d) => {
  if (d.length === 0) {
    const list = document.getElementById('download-list');
    if (list) { const li = linkItem(RELEASES_URL, 'See the releases page'); li.className = 'page-link'; list.replaceChildren(li); }
    return;
  }
  render(d);
});
