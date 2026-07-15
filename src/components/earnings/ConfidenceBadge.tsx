import { confidenceTier, type ConfidenceTier } from '@/pages/earnings/helpers';
import { MUTED } from './tokens';

const MONO = "'DM Mono', 'Courier New', monospace";

// Self-contained tone map (no dependency on index.css badge classes).
const TONES: Record<ConfidenceTier, { color: string; bg: string; fill: string }> = {
  green: { color: '#16A34A', bg: 'rgba(34,197,94,.12)', fill: '#22C55E' },
  amber: { color: '#B45309', bg: 'rgba(245,158,11,.12)', fill: '#F59E0B' },
  red: { color: '#DC2626', bg: 'rgba(239,68,68,.12)', fill: '#EF4444' },
  manual: { color: MUTED, bg: '#E8EAF5', fill: '#9BA3C4' },
};

// Confidence as a mini bar + %, coloured by tier (≥90 green · 85–<90 amber ·
// <85 red). When confidence is null (a manual edit) we show "Manual" — never a
// fabricated number.
export function ConfidenceBadge({
  confidence,
  flag,
}: {
  confidence: number | null;
  flag?: string | null;
}) {
  const tier = confidenceTier(confidence, flag);

  if (tier === 'manual' || confidence == null) {
    const tone = TONES.manual;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px 9px',
          borderRadius: 20,
          fontSize: 10,
          fontWeight: 700,
          color: tone.color,
          background: tone.bg,
        }}
      >
        Manual
      </span>
    );
  }

  const tone = TONES[tier];
  const pct = Math.max(0, Math.min(100, Math.round(confidence)));
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <div style={{ width: 54, height: 5, background: '#EEF0F6', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tone.fill }} />
      </div>
      <span
        style={{ fontSize: 11, fontWeight: 800, fontFamily: MONO, color: tone.color, minWidth: 34, textAlign: 'right' }}
      >
        {pct}%
      </span>
    </div>
  );
}
