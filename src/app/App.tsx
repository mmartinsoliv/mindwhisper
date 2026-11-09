import { useEffect, useState } from 'react';
import { applyTheme } from '@/styles/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { DictationPage } from '@/features/dictation/DictationPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { DictionaryPage } from '@/features/dictionary/DictionaryPage';
import { SettingsPage } from '@/features/settings';
import { Onboarding } from '@/features/onboarding';
import { Sidebar } from './Sidebar';
import type { Route } from './routes';

export function App() {
  const { loaded, settings } = useSettingsStore();
  const [route, setRoute] = useState<Route>('dictation');
  useEffect(() => { applyTheme(settings.theme); }, [settings.theme]);
  if (!loaded) return null;
  if (!settings.onboardingDone) return <Onboarding />;
  return (
    <div className="flex h-full">
      <Sidebar route={route} onSelect={setRoute} />
      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10">
        <div className="mx-auto max-w-3xl">
          {route === 'dictation' && <DictationPage />}
          {route === 'history' && <HistoryPage />}
          {route === 'dictionary' && <DictionaryPage />}
          {route === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  );
}
