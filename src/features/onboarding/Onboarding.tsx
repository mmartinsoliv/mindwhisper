import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components';
import { useSettingsStore } from '@/stores/settingsStore';
import { Welcome } from './steps/Welcome';
import { MicrophoneStep } from './steps/MicrophoneStep';
import { ShortcutStep } from './steps/ShortcutStep';
import { TestStep } from './steps/TestStep';
import { LanguageStep } from './steps/LanguageStep';
import { Done } from './steps/Done';

const TOTAL = 6;

export function Onboarding() {
  const [i, setI] = useState(0);
  const [micOk, setMicOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [beforeNext, setBeforeNext] = useState<null | (() => Promise<void>)>(null);
  const [skippable, setSkippable] = useState(false);
  const stepRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  // Move focus to the new step's heading so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h1 = stepRef.current?.querySelector('h1');
    if (!h1) return;
    h1.setAttribute('tabindex', '-1');
    h1.focus();
  }, [i]);
  const finish = () => useSettingsStore.getState().update({ onboardingDone: true });

  const go = async (delta: 1 | -1) => {
    if (delta === 1 && beforeNext) { setBusy(true); try { await beforeNext(); } catch { setBusy(false); return; } setBusy(false); }
    setBeforeNext(null); setSkippable(false);
    setI((n) => Math.min(TOTAL - 1, Math.max(0, n + delta)));
  };

  const step = [
    <Welcome key="w" />,
    <MicrophoneStep key="m" ok={micOk} onResult={setMicOk} />,
    <ShortcutStep key="s" register={(fn) => setBeforeNext(() => fn)} />,
    <TestStep key="t" onSkippable={setSkippable} />,
    <LanguageStep key="l" />,
    <Done key="d" />,
  ][i];
  const nextDisabled = busy || (i === 1 && !micOk);

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <div role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={i + 1} aria-valuetext={`Step ${i + 1} of ${TOTAL}`} className="mb-6 flex gap-1.5">
          {Array.from({ length: TOTAL }, (_, n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= i ? 'bg-accent' : 'bg-border'}`} />)}
        </div>
        <div ref={stepRef} className="[&_h1]:outline-none">{step}</div>
        <div className="mt-8 flex items-center justify-between">
          {i > 0 && i < TOTAL - 1 ? <Button variant="ghost" onClick={() => void go(-1)}>Back</Button> : <span />}
          {i < TOTAL - 1 ? (
            <div className="flex gap-2">
              {i === 3 && skippable && <Button variant="ghost" onClick={() => void go(1)}>Skip</Button>}
              <Button disabled={nextDisabled} onClick={() => void go(1)}>{i === 0 ? 'Continue' : 'Next'}</Button>
            </div>
          ) : <Button onClick={() => void finish()}>Start using Mindwhisper</Button>}
        </div>
      </Card>
    </div>
  );
}
