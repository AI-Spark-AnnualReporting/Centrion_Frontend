import type { EarningsFigureSource } from '@/types/earnings';
import { sourceKey, formatSourceType } from '@/pages/earnings/helpers';
import { INK, MUTED, FAINT, BORDER } from './tokens';

// Coverage → shared badge class + label. Official sources only — a narrative
// upload never gets a coverage badge (that would imply it's an official,
// coverage-scored filing, which it isn't).
function coverageBadge(coverage: string | null): { cls: string; label: string } | null {
  if (coverage === 'full') return { cls: 'badge b-gn', label: 'Full' };
  if (coverage === 'partial') return { cls: 'badge b-am', label: 'Partial' };
  return coverage ? { cls: 'badge b-gy', label: coverage } : null;
}

// Extraction state → shared badge class + label (narrative/upload sources only).
// 'completed' is the live backend's terminal value (confirmed against a real
// GET .../figures response) — 'ready' is kept as an alias for naming
// robustness, not because the backend has been observed to send it here.
function extractionBadge(status: string | null): { cls: string; label: string } {
  if (status === 'ready' || status === 'completed') return { cls: 'badge b-gn', label: 'Ready' };
  if (status === 'failed') return { cls: 'badge b-rd', label: 'Failed' };
  return { cls: 'badge b-am', label: 'Extracting…' };
}

function SourceRow({ s }: { s: EarningsFigureSource }) {
  const isNarrative = s.track === 'narrative_adjusted';
  const badge = isNarrative ? extractionBadge(s.extraction_status) : coverageBadge(s.coverage);
  return (
    <div
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
        {isNarrative ? `${s.label} · ${formatSourceType(s.type)}` : s.label}
      </span>
      {badge && <span className={badge.cls}>{badge.label}</span>}
    </div>
  );
}

// One labelled track group — always rendered, even when empty, so the
// official/narrative split stays visible (D-19: an upload is never shown as
// if it were an official system report).
function SourceGroup({
  title,
  subtitle,
  sources,
  emptyText,
}: {
  title: string;
  subtitle: string;
  sources: EarningsFigureSource[];
  emptyText: string;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>{title}</span>
        <span style={{ fontSize: 11, color: FAINT }}>{subtitle}</span>
      </div>
      {sources.length === 0 ? (
        <div style={{ fontSize: 12, color: FAINT }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sources.map((s) => (
            <SourceRow key={sourceKey(s)} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

// Block 1 — the sources this report draws from. Two labelled groups, matching
// the Setup screen's SourcePicker (D-19): official system reports and
// uploaded narrative documents are never merged into one list, since an
// upload is never an official figure source.
export function SelectedSourcesHeader({ sources }: { sources: EarningsFigureSource[] }) {
  const official = sources.filter((s) => s.track !== 'narrative_adjusted');
  const narrative = sources.filter((s) => s.track === 'narrative_adjusted');

  return (
    <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: INK }}>Sources</span>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SourceGroup
          title="From your system — official figures"
          subtitle="From filed reports"
          sources={official}
          emptyText="No official filings recorded for this report."
        />
        <SourceGroup
          title="Uploaded — narrative context"
          subtitle="From your uploads"
          sources={narrative}
          emptyText="No uploaded documents recorded for this report."
        />
      </div>
    </div>
  );
}
