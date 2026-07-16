import type { EarningsFigureSource } from '@/types/earnings';
import { INK, MUTED, FAINT, BORDER } from './tokens';

// Coverage → shared badge class + label.
function coverageBadge(coverage: string | null): { cls: string; label: string } | null {
  if (coverage === 'full') return { cls: 'badge b-gn', label: 'Full' };
  if (coverage === 'partial') return { cls: 'badge b-am', label: 'Partial' };
  return coverage ? { cls: 'badge b-gy', label: coverage } : null;
}

// Block 1 — the chosen source reports: count + per-source coverage badge and a
// Preview affordance (rendered only when the source carries a URL).
export function SelectedSourcesHeader({ sources }: { sources: EarningsFigureSource[] }) {
  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>Selected system reports</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: MUTED,
            background: '#F2F3FA',
            border: `1px solid ${BORDER}`,
            borderRadius: 999,
            padding: '2px 9px',
          }}
        >
          {sources.length} {sources.length === 1 ? 'source' : 'sources'}
        </span>
      </div>

      {sources.length === 0 ? (
        <div style={{ fontSize: 12, color: FAINT }}>No sources recorded for this report.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sources.map((s) => {
            const badge = coverageBadge(s.coverage);
            return (
              <div
                key={s.report_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: `1px solid ${BORDER}`,
                  background: '#fff',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke={FAINT} strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M12 2v4h4" stroke={FAINT} strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: INK,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.label}
                </span>
                {badge && <span className={badge.cls}>{badge.label}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
