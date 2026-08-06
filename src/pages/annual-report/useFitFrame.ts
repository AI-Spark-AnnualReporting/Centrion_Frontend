// Every step of the board builder has the same shape: a stepper and a header
// that stay put, one scrolling frame, and a row of actions under it that stays
// put too. This works out how tall that frame has to be.
//
// Measured rather than `calc(100vh - …)`: a constant would have to know the
// height of the stepper, the page header, and every notice that might or might
// not be showing above the frame — and it silently goes wrong when one appears.

import { useLayoutEffect, useRef, useState } from 'react';

/** `.content`'s bottom padding plus the gap above the actions row. */
const OUTSIDE = 32;
const MIN_HEIGHT = 280;

/**
 * Attach `frameRef` to the scrolling element and `tailRef` to whatever sits
 * below it. `height` fills the rest of the viewport, so the page never grows a
 * scrollbar of its own.
 *
 * @param deps re-measure when the chrome above the frame changes height.
 */
export function useFitFrame(deps: unknown[] = []) {
  const frameRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const fit = () => {
      const el = frameRef.current;
      if (!el) return;
      const below = tailRef.current?.getBoundingClientRect().height ?? 0;
      const top = el.getBoundingClientRect().top;
      setHeight(Math.max(MIN_HEIGHT, window.innerHeight - top - below - OUTSIDE));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { frameRef, tailRef, height };
}
