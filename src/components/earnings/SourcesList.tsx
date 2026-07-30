import { parseSourcesContent } from '@/pages/earnings/preview-helpers';
import { INK, MUTED, FAINT, BORDER } from './tokens';

// Renders the Sources, Methodology & Assumptions section as a labelled
// citation list — one row per figure — instead of raw "Label: period ·
// filename · page" prose lines.
export function SourcesList({ content }: { content: string }) {
  const lines = parseSourcesContent(content);
  if (lines.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {lines.map((l, i) => (
        <div
          key={`${l.label}-${i}`}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 14,
            padding: '10px 2px',
            borderTop: i > 0 ? `1px solid ${BORDER}` : 'none',
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: INK, flexShrink: 0 }}>{l.label}</span>
          {l.note ? (
            <span style={{ fontSize: 12, color: FAINT, fontStyle: 'italic', textAlign: 'right' }}>
              Derived · {l.note}
            </span>
          ) : (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minWidth: 0,
                fontSize: 12,
                color: MUTED,
              }}
            >
              {l.period && <span style={{ fontWeight: 700, color: INK, flexShrink: 0 }}>{l.period}</span>}
              {l.filename && (
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    color: FAINT,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 220,
                  }}
                  title={l.filename}
                >
                  {l.filename}
                </span>
              )}
              {l.page && (
                <span className="badge b-gy" style={{ flexShrink: 0 }}>
                  {l.page}
                </span>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
