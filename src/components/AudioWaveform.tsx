import { useEffect, useRef, useState } from 'react';

const TICK_MS = 70;
const MIN_PX = 4;
const RANGE_PX = 26;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function AudioWaveform({ level, active, bars = 24 }: { level: number; active: boolean; bars?: number }) {
  const [hist, setHist] = useState<number[]>([]);
  const live = useRef({ level, active });
  useEffect(() => { live.current = { level, active }; }, [level, active]);

  // Sample on a fixed cadence so the shape keeps scrolling even when the level is steady.
  useEffect(() => {
    const id = setInterval(() => {
      setHist((h) => {
        const { level: l, active: a } = live.current;
        if (!a && h.every((v) => v === 0)) return h; // already flat: nothing to render
        return [...h, a ? clamp(l) : 0].slice(-bars);
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [bars]);

  const samples = [...Array<number>(Math.max(0, bars - hist.length)).fill(0), ...hist.slice(-bars)];
  return (
    <span role="img" aria-label="Audio level" className="flex h-8 items-center gap-[3px]">
      {samples.map((v, i) => (
        <span key={i} data-bar className="w-[3px] rounded-full bg-accent transition-[height] duration-75" style={{ height: `${MIN_PX + v * RANGE_PX}px` }} />
      ))}
    </span>
  );
}
