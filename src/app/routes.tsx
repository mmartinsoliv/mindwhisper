import type { ComponentType } from 'react';
import { BookIcon, HistoryIcon, MicIcon, SettingsIcon } from '@/components';

export type Route = 'dictation' | 'history' | 'dictionary' | 'settings';
export const ROUTES: { id: Route; label: string; icon: ComponentType }[] = [
  { id: 'dictation', label: 'Dictation', icon: MicIcon }, { id: 'history', label: 'History', icon: HistoryIcon },
  { id: 'dictionary', label: 'Dictionary', icon: BookIcon }, { id: 'settings', label: 'Settings', icon: SettingsIcon },
];
