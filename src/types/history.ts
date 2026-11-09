import type { CleanupStyle, Language } from './settings';

export interface HistoryEntry { id: string; createdAt: number; rawText: string; finalText: string; language: Language; style: CleanupStyle; durationMs: number }
export interface DictionaryEntry { id: string; term: string; spoken?: string }
