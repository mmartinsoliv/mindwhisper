import { commands } from '@/services/tauri/commands';
import type { InsertionPort } from '@/types/ports';

export class TauriInsertionService implements InsertionPort {
  insert(text: string, restoreClipboard: boolean) { return commands.insertText(text, restoreClipboard); }
}
