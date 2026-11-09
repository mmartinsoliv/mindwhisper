import { getCurrentWindow } from '@tauri-apps/api/window';
import { commands } from '@/services/tauri/commands';

export const REINSERT_DELAY_MS = 400;

interface Deps { hide(): Promise<void>; sleep(ms: number): Promise<void>; insert(text: string, restore: boolean): Promise<{ clipboardRestored: boolean }>; show(): Promise<void> }
const real: Deps = {
  hide: () => getCurrentWindow().hide(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  insert: (t, r) => commands.insertText(t, r), show: () => commands.mainShow(),
};

/** Reinsert text into whichever app was focused before Mindwhisper: hide our window so focus returns there, then paste. */
export async function reinsertText(text: string, restoreClipboard: boolean, d: Deps = real): Promise<void> {
  await d.hide();
  await d.sleep(REINSERT_DELAY_MS);
  try { await d.insert(text, restoreClipboard); }
  catch (e) { await d.show(); throw e; }
}
