export type ThemeSetting = 'system' | 'light' | 'dark';
let mql: MediaQueryList | null = null;
let listener: (() => void) | null = null;

export function applyTheme(theme: ThemeSetting): void {
  const root = document.documentElement;
  if (mql && listener) { mql.removeEventListener('change', listener); listener = null; }
  if (theme !== 'system') { root.dataset.theme = theme; return; }
  mql = window.matchMedia('(prefers-color-scheme: dark)');
  const set = () => { root.dataset.theme = mql!.matches ? 'dark' : 'light'; };
  listener = set;
  mql.addEventListener('change', set);
  set();
}
