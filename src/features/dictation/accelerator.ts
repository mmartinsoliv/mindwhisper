const MAC: Record<string, string> = { commandorcontrol: '⌘', command: '⌘', cmd: '⌘', super: '⌘', control: '⌃', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧' };
const WIN: Record<string, string> = { commandorcontrol: 'Ctrl', command: 'Win', cmd: 'Win', super: 'Win', control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift' };

export const isMac = () => /mac/i.test(navigator.platform || navigator.userAgent);

export function formatAccelerator(accelerator: string, mac: boolean = isMac()): string[] {
  return accelerator.split('+').map((p) => (mac ? MAC : WIN)[p.toLowerCase()] ?? p);
}
