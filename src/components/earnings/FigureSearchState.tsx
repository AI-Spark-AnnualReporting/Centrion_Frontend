// The wait while a section is searched.
//
// It takes 10–20 seconds, because the model reads the report's lines in parallel
// batches. A spinner would say nothing true about that. This says what is
// actually happening: the read-head sweeps the card, the labels being scanned
// stream past under it, and an indeterminate rail runs beneath.
//
// The whole vocabulary is quarterly's Analyse (`analysis-*` in index.css) — the
// same moment, one product, one grammar for it. That also means reduced-motion is
// already handled there, and the labels are real: they come from the user's own
// report, not from a loading string.

import { useEffect, useState } from 'react';
import type { EarningsSourceLine } from '@/types/earnings';
import { ACCENT, MUTED } from './tokens';

const TICK_MS = 680;
// Long enough that "still reading" means something; short enough to land before
// the user starts wondering.
const SLOW_AFTER_MS = 9000;

export function FigureSearchState({
  lineCount,
  labels,
}: {
  lineCount: number;
  /** Real labels from the report being read. Empty is fine — the rail still runs. */
  labels: string[];
}) {
  const [i, setI] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (labels.length < 2) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % labels.length), TICK_MS);
    return () => window.clearInterval(t);
  }, [labels.length]);

  useEffect(() => {
    const t = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div role="status" aria-live="polite" style={{ marginTop: 14, maxWidth: 480 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontSize: 12.5,
          fontWeight: 700,
          color: ACCENT,
        }}
      >
        Reading {lineCount.toLocaleString()} {lineCount === 1 ? 'line' : 'lines'} from your report
        {slow && (
          <span style={{ color: MUTED, fontWeight: 500, fontSize: 11.5 }}>still reading</span>
        )}
      </div>

      {labels.length > 0 && (
        // Fixed height so nothing below shifts as the names change length.
        <div style={{ height: 18, overflow: 'hidden', marginTop: 5 }}>
          <div
            key={i}
            className="analysis-tick"
            style={{
              fontSize: 12,
              color: MUTED,
              fontFamily: "'DM Mono', monospace",
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: '18px',
            }}
          >
            {labels[i]}
          </div>
        </div>
      )}

      <div className="analysis-rail" style={{ marginTop: 9, maxWidth: 280 }} />
    </div>
  );
}

/** The read-head. Absolutely positioned — the card it sits in needs `relative`. */
export function FigureSearchSweep() {
  return <div className="analysis-sweep" aria-hidden="true" />;
}
