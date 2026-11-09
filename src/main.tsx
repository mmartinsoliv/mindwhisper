import '@/styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initStoreSync } from '@/stores/sync';
import { useDictationStore } from '@/stores/dictationStore';

void initStoreSync();
void useDictationStore.getState().init();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
