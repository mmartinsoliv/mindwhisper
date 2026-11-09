import { useEffect, useState } from 'react';
import { FloatingOverlay } from '@/components/FloatingOverlay';
import type { DictationController } from '@/services/dictation/DictationController';
import { useSettingsStore } from '@/stores/settingsStore';

export function OverlayApp({ controller }: { controller: DictationController }) {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot());
  const showPreview = useSettingsStore((s) => s.settings.showPreview);
  useEffect(() => {
    const off = controller.subscribe(setSnapshot);
    setSnapshot(controller.getSnapshot()); // a snapshot emitted between the initial render and this subscription would be lost
    return off;
  }, [controller]);
  return (
    <div className="h-screen w-screen p-1">
      <FloatingOverlay snapshot={snapshot} showPreview={showPreview}
        onStop={() => void controller.stop()} onCancel={() => void controller.cancel()}
        onRetry={() => void controller.retry()} onDismiss={() => void controller.dismiss()} />
    </div>
  );
}
