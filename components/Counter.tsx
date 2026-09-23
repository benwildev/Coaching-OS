'use client';
import { useEffect, useRef, useState } from 'react';

/** Animated number. Money values are in lakh taka and render as ৳ L / Cr. */
export default function Counter({ value, money = false, dec = 0, suffix = '', prefix = '' }: { value: number; money?: boolean; dec?: number; suffix?: string; prefix?: string }) {
  const [v, setV] = useState(0);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduce = false;
    }
    if (reduce) { setV(value); return; }
    const from = 0;
    const t0 = performance.now(), dur = 900;
    cancelAnimationFrame(raf.current!);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setV(from + (value - from) * e);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  let text: string;
  if (money) text = v >= 100 ? '৳' + (v / 100).toFixed(2) + ' Cr' : '৳' + v.toFixed(v >= 10 ? 1 : 2) + ' L';
  else text = prefix + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-IN')) + suffix;

  return <span className="num" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{text}</span>;
}
