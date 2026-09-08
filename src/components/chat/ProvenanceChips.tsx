import { useNavigate } from 'react-router-dom';
import { documents, type ChatDisclosureStatus, type ChatFigureCitation, type ChatProvenanceSource } from '@/lib/api';

// Spec 5 (Personas-Provenance) — Part A/B: disclosure status + provenance
// chips. Reuses the tool-pill visual language already established in
// AIPage.tsx (rounded, bordered, colored, small icon) but with its own
// palette so a source chip never reads as a tool-activity indicator.

const REPORT_TYPE_ROUTE_PREFIX: Record<string, string> = {
  quarterly: 'quarterly-report',
  board_report: 'board-report',
  earnings: 'earnings',
};

function reportRoute(reportType: string | null, reportId: string | null): string | null {
  if (!reportType || !reportId) return null;
  const prefix = REPORT_TYPE_ROUTE_PREFIX[reportType];
  return prefix ? `/${prefix}/${reportId}/report` : null;
}

async function openDocument(companyId: string | undefined, documentId: string) {
  if (!companyId) return;
  try {
    const { document } = await documents.get(companyId, documentId);
    if (document.download_url) {
      window.open(document.download_url, '_blank', 'noopener,noreferrer');
    }
  } catch {
    // A failed lookup must not surface as a broken link or a thrown error —
    // the chip simply does nothing (rule 9's "degrade, never error" spirit
    // extended to the frontend).
  }
}

function SourceChip({ source, companyId }: { source: ChatProvenanceSource; companyId?: string }) {
  const navigate = useNavigate();
  const isReportSection = source.source_type === 'report_section';
  const label = [source.name, source.section_or_page].filter(Boolean).join(' — ') || 'Source';

  const handleClick = () => {
    if (isReportSection) {
      const route = reportRoute(source.report_type, source.report_id);
      if (!route) return;
      // Best-effort deep link: the report has no machine section_code stored
      // against this chunk, only a human-readable title — the destination
      // page does a case-insensitive title match and scrolls if it finds
      // one, and simply opens the report (no scroll, no error) if it can't.
      const query = source.section_or_page
        ? `?section=${encodeURIComponent(source.section_or_page)}`
        : '';
      navigate(`${route}${query}`);
    } else if (source.document_id) {
      void openDocument(companyId, source.document_id);
    }
  };

  const clickable = isReportSection ? !!reportRoute(source.report_type, source.report_id) : !!source.document_id;

  return (
    <button
      type="button"
      onClick={clickable ? handleClick : undefined}
      disabled={!clickable}
      title={source.approval_state ? `${label} (${source.approval_state})` : label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10,
        fontWeight: 600,
        color: '#3D3D7A',
        background: 'rgba(61,61,122,.06)',
        border: '1px solid rgba(61,61,122,.18)',
        padding: '4px 10px',
        borderRadius: 999,
        cursor: clickable ? 'pointer' : 'default',
        maxWidth: 260,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ flexShrink: 0 }}>
        {isReportSection ? (
          <path d="M1.5 1h6v7l-3-1.5L1.5 8V1z" stroke="#3D3D7A" strokeWidth="1" strokeLinejoin="round" />
        ) : (
          <path d="M2 1h3.5L7 2.5V8H2V1z" stroke="#3D3D7A" strokeWidth="1" strokeLinejoin="round" />
        )}
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {source.period && <span style={{ opacity: 0.65 }}>· {source.period}</span>}
    </button>
  );
}

function FigureCitationLine({ figure }: { figure: ChatFigureCitation }) {
  const confidencePct =
    typeof figure.confidence === 'number' ? `${Math.round(figure.confidence * 100)}%` : null;
  return (
    <div style={{ fontSize: 10, color: '#7A809E', marginTop: 2 }}>
      {figure.period}
      {figure.source_page != null && <> · source page {figure.source_page}</>}
      {confidencePct && <> · confidence {confidencePct}</>}
    </div>
  );
}

export function ProvenanceChips({
  disclosureStatus,
  sources,
  figures,
  companyId,
}: {
  disclosureStatus?: ChatDisclosureStatus;
  sources?: ChatProvenanceSource[];
  figures?: ChatFigureCitation[];
  companyId?: string;
}) {
  const hasSources = !!sources && sources.length > 0;
  const hasFigures = !!figures && figures.length > 0;
  if (!disclosureStatus && !hasSources && !hasFigures) return null;

  return (
    <div style={{ marginTop: 8 }}>
      {disclosureStatus === 'internal_only' && (
        <div
          style={{
            fontSize: 11,
            color: '#8A5A00',
            background: 'rgba(245,166,35,.10)',
            border: '1px solid rgba(245,166,35,.28)',
            borderRadius: 8,
            padding: '6px 10px',
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          This is not in any approved disclosure. From internal documents:
        </div>
      )}
      {hasSources && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {sources!.map((s, i) => (
            <SourceChip key={`${s.report_id ?? s.document_id ?? 'src'}-${i}`} source={s} companyId={companyId} />
          ))}
        </div>
      )}
      {hasFigures && (
        <div style={{ marginTop: hasSources ? 6 : 0 }}>
          {figures!.map((f, i) => (
            <FigureCitationLine key={`${f.period}-${i}`} figure={f} />
          ))}
        </div>
      )}
    </div>
  );
}
