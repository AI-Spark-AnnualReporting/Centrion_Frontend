import { useState } from 'react';
import type { CoverageIndicator, CoverageResponse } from '@/types/report';

// Normalise API period strings like "FY-2026" → "FY 2026" for display.
function formatPeriod(period: string): string {
  return period.replace(/-/g, ' ').trim();
}

// Pull the 4-digit year out of an API period string like "FY-2036".
function yearFromPeriod(period: string): string {
  const m = period.match(/(\d{4})/);
  return m ? m[1] : period;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function coveragePercent(found: number, total: number): number {
  if (!total) return 0;
  return Math.round((found / total) * 100);
}

function pillarBaseKey(p: string): 'E' | 'S' | 'G' | 'ESG' | 'OTHER' {
  if (p === 'E' || p === 'S' || p === 'G' || p === 'ESG') return p;
  return 'OTHER';
}

function indicatorDisplayValue(i: CoverageIndicator): string {
  if (i.status === 'NOT_DISCLOSED') return 'Missing';
  if (i.value !== null && i.value !== undefined) return String(i.value);
  if (i.text_value) return i.text_value;
  if (i.bool_value !== null) return i.bool_value ? 'Yes' : 'No';
  return '—';
}

// Numeric values first, then booleans, then narratives, then misc, missing last.
function indicatorSortRank(i: CoverageIndicator): number {
  if (i.status === 'NOT_DISCLOSED') return 4;
  if (i.value !== null && i.value !== undefined) return 0;
  if (i.bool_value !== null && i.bool_value !== undefined) return 1;
  if (i.text_value !== null && i.text_value !== undefined && i.text_value !== '') return 2;
  return 3;
}

function sortIndicators(list: CoverageIndicator[]): CoverageIndicator[] {
  return [...list].sort((a, b) => {
    const rankDiff = indicatorSortRank(a) - indicatorSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.source_code.localeCompare(b.source_code, undefined, { numeric: true });
  });
}

// Narrative sort: real-text first, "no narrative text was captured" last.
function narrativeSortRank(i: CoverageIndicator): number {
  if (i.text_value && i.text_value.trim().length > 0) return 0;
  return 1;
}

function sortNarratives(list: CoverageIndicator[]): CoverageIndicator[] {
  return [...list].sort((a, b) => {
    const rankDiff = narrativeSortRank(a) - narrativeSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.source_code.localeCompare(b.source_code, undefined, { numeric: true });
  });
}

function narrativeBodyText(nn: CoverageIndicator): string {
  const pk = pillarBaseKey(nn.pillar);
  const pillarLabelForBody = pk !== 'OTHER' ? PILLAR_STYLES[pk].label : 'overall';
  if (nn.status === 'NOT_DISCLOSED')
    return `Not disclosed in the uploaded documents. Add evidence for this indicator to raise the ${pillarLabelForBody} pillar score.`;
  if (nn.text_value && nn.text_value.trim().length > 0) return nn.text_value;
  return 'Disclosed, but no narrative text was captured.';
}

const PILLAR_STYLES: Record<
  'E' | 'S' | 'G' | 'ESG',
  { label: string; emoji: string; gradient: string; accent: string }
> = {
  E: {
    label: 'Environmental',
    emoji: '🌿',
    gradient: 'linear-gradient(135deg,#065F46,#059669)',
    accent: '#059669',
  },
  S: {
    label: 'Social',
    emoji: '👥',
    gradient: 'linear-gradient(135deg,#0369A1,#0891B2)',
    accent: '#0891B2',
  },
  G: {
    label: 'Governance',
    emoji: '🏛',
    gradient: 'linear-gradient(135deg,#4C1D95,#7C3AED)',
    accent: '#7C3AED',
  },
  ESG: {
    label: 'Universal (ESG)',
    emoji: '♻️',
    gradient: 'linear-gradient(135deg,#1E293B,#4040C8)',
    accent: '#4040C8',
  },
};

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={size * 0.34} fontWeight="800" fontFamily="'DM Mono',monospace" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{score}</text>
    </svg>
  );
}

// Numeric/bool/missing indicator row — click to expand for full label / text.
function IndicatorRow({ ind }: { ind: CoverageIndicator }) {
  const [expanded, setExpanded] = useState(false);
  const isFound = ind.status === 'FOUND';
  const isMissing = ind.status === 'NOT_DISCLOSED';
  return (
    <div style={{ borderBottom: '1px solid #ECEEF8', minWidth: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', padding: '7px 0', fontSize: 11, gap: 8, cursor: 'pointer' }}
        title="Click to expand"
      >
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: '#4040C8', background: 'rgba(64,64,200,.08)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {ind.framework} {ind.source_code}
        </span>
        <span style={{ flex: 1, color: '#1A1D2E', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={ind.indicator_label}>
          {ind.indicator_label}
        </span>
        <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: isMissing ? '#EF4444' : '#1A1D2E', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {indicatorDisplayValue(ind)}
        </span>
        {ind.unit && <span style={{ fontSize: 9, color: '#9BA3C4', marginLeft: 2, flexShrink: 0 }}>{ind.unit}</span>}
        {isFound ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#22C55E" /><path d="M4 6.5l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
        ) : isMissing ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#EF4444" /><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#F59E0B" /><path d="M6.5 4v3M6.5 9v.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
        )}
      </div>
      {expanded && (
        <div style={{ padding: '0 0 10px 0', fontSize: 11, color: '#5A6080', lineHeight: 1.55 }}>
          <div style={{ fontWeight: 600, color: '#1A1D2E', marginBottom: 2 }}>{ind.indicator_label}</div>
          {ind.text_value && ind.text_value.trim().length > 0 && ind.status !== 'NOT_DISCLOSED' && (
            <div style={{ whiteSpace: 'pre-wrap' }}>{ind.text_value}</div>
          )}
        </div>
      )}
    </div>
  );
}

// Narrative indicator row — body text inline (truncated), expands to full text.
function NarrativeRow({ nn }: { nn: CoverageIndicator }) {
  const [expanded, setExpanded] = useState(false);
  const body = narrativeBodyText(nn);
  const isFound = nn.status === 'FOUND';
  const isMissing = nn.status === 'NOT_DISCLOSED';
  return (
    <div style={{ borderBottom: '1px solid #ECEEF8', minWidth: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', padding: '7px 0', fontSize: 11, gap: 8, cursor: 'pointer' }}
        title="Click to expand"
      >
        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: '#4040C8', background: 'rgba(64,64,200,.08)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
          {nn.framework} {nn.source_code}
        </span>
        <span style={{ flex: 1, color: '#1A1D2E', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }} title={nn.indicator_label}>
          {nn.indicator_label}
        </span>
        <span style={{ flex: 1, color: '#5A6080', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontStyle: 'italic' }}>
          {body}
        </span>
        {isFound ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#22C55E" /><path d="M4 6.5l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
        ) : isMissing ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#EF4444" /><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#F59E0B" /><path d="M6.5 4v3M6.5 9v.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
        )}
      </div>
      {expanded && (
        <div style={{ padding: '0 0 10px 0', fontSize: 11, color: '#5A6080', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {body}
        </div>
      )}
    </div>
  );
}

export interface ReportDetailViewProps {
  coverage: CoverageResponse;
}

export function ReportDetailView({ coverage }: ReportDetailViewProps) {
  const summary = coverage.summary;
  return (
    <div style={{ marginTop: 4 }}>
      {/* Header bar */}
      <div style={{ background: 'linear-gradient(135deg,#1A1D2E,#2D3154)', borderRadius: 14, padding: '18px 22px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <ScoreRing score={coveragePercent(summary.found_count, summary.total_indicators)} size={52} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, background: '#22C55E', color: '#fff', padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>★ Report Generated</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>
              ESG Sustainability Report
              {coverage.company_name ? ` - ${coverage.company_name}` : ''}
              {` - ${yearFromPeriod(coverage.period)}`}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
              {summary.found_count} of {summary.total_indicators} indicators disclosed · Disclosure rate {Math.round((summary.disclosure_rate || 0) * 100)}%
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              {coverage.frameworks.map((fw) => (
                <span key={fw} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)' }}>{fw}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '10px 18px', border: '1px solid rgba(255,255,255,.1)' }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
            <div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#22C55E' }}>{summary.found_count}</div></div>
            <div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#EF4444' }}>{summary.not_disclosed_count}</div></div>
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Disclosed &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Gaps</div>
        </div>
      </div>

      {/* Source documents — files processed against this report. */}
      {coverage.documents && coverage.documents.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E2E4F0', padding: '14px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 1.5h5l3 3v7a.5.5 0 0 1-.5.5h-7.5a.5.5 0 0 1-.5-.5v-9.5a.5.5 0 0 1 .5-.5z" stroke="#4040C8" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M8 1.5v3h3" stroke="#4040C8" strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>Source documents</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>
              {coverage.documents.length} {coverage.documents.length === 1 ? 'document' : 'documents'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {coverage.documents.map((doc) => (
              <div
                key={doc.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#F8F9FE', borderRadius: 8, border: '1px solid #ECEEF8' }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(64,64,200,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#4040C8', textTransform: 'uppercase' }}>{doc.file_type}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.filename}>
                    {doc.filename}
                  </div>
                  <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 1 }}>
                    {formatBytes(doc.file_size_bytes)} · Uploaded {new Date(doc.uploaded_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 999,
                    textTransform: 'uppercase',
                    letterSpacing: '.4px',
                    color: doc.extraction_status === 'completed' ? '#16A34A' : doc.extraction_status === 'failed' ? '#DC2626' : '#B45309',
                    background:
                      doc.extraction_status === 'completed'
                        ? 'rgba(34,197,94,.12)'
                        : doc.extraction_status === 'failed'
                          ? 'rgba(239,68,68,.12)'
                          : 'rgba(245,158,11,.15)',
                    flexShrink: 0,
                  }}
                >
                  {doc.extraction_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Three pillar sections */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
        {(['E', 'S', 'G'] as const).map((pk) => {
          const style = PILLAR_STYLES[pk];
          const p = summary.by_pillar?.[pk] ?? { total: 0, found: 0, partial: 0, not_disclosed: 0 };
          const coveragePct = coveragePercent(p.found, p.total);
          const score = coveragePct;
          const pillarIndicators = sortIndicators(
            coverage.indicators.filter(
              (i) =>
                pillarBaseKey(i.pillar) === pk &&
                (i.data_type !== 'text_block' || i.status === 'NOT_DISCLOSED'),
            ),
          );
          const pillarNarratives = sortNarratives(
            coverage.indicators.filter(
              (i) =>
                pillarBaseKey(i.pillar) === pk &&
                i.data_type === 'text_block' &&
                i.status !== 'NOT_DISCLOSED',
            ),
          );
          return (
            <div key={pk} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0' }}>
              <div style={{ background: style.gradient, padding: '14px 16px', color: '#fff' }}>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .7, marginBottom: 2 }}>
                  {style.emoji} {style.label}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1, marginBottom: 8 }}>{score}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{p.found}<br /><span style={{ fontSize: 8, opacity: .6 }}>FOUND</span></span>
                  <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{p.not_disclosed}<br /><span style={{ fontSize: 8, opacity: .6 }}>MISSING</span></span>
                  <span style={{ flex: 2, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{coveragePct}%<br /><span style={{ fontSize: 8, opacity: .6 }}>COVERAGE</span></span>
                </div>
              </div>
              <div style={{ padding: '8px 14px', maxHeight: 480, overflowY: 'auto' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                  {coverage.frameworks.join(' / ')} metrics
                </div>
                {pillarIndicators.length === 0 && pillarNarratives.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#9BA3C4', padding: '10px 0' }}>No indicators for this pillar.</div>
                ) : (
                  <>
                    {pillarIndicators.map((ind) => (
                      <IndicatorRow key={ind.framework_indicator_id} ind={ind} />
                    ))}
                    {pillarNarratives.length > 0 && (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 14, marginBottom: 6, paddingTop: 10, borderTop: '1px solid #E2E4F0' }}>
                          Narrative disclosures
                        </div>
                        {pillarNarratives.map((nn) => (
                          <NarrativeRow key={nn.framework_indicator_id} nn={nn} />
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ESG (Universal) — full-width card */}
      {(() => {
        const pk = 'ESG' as const;
        const style = PILLAR_STYLES[pk];
        const p = summary.by_pillar?.[pk] ?? { total: 0, found: 0, partial: 0, not_disclosed: 0 };
        if (p.total === 0) return null;
        const coveragePct = coveragePercent(p.found, p.total);
        const score = coveragePct;
        const pillarIndicators = sortIndicators(
          coverage.indicators.filter(
            (i) =>
              pillarBaseKey(i.pillar) === pk &&
              (i.data_type !== 'text_block' || i.status === 'NOT_DISCLOSED'),
          ),
        );
        const pillarNarratives = sortNarratives(
          coverage.indicators.filter(
            (i) =>
              pillarBaseKey(i.pillar) === pk &&
              i.data_type === 'text_block' &&
              i.status !== 'NOT_DISCLOSED',
          ),
        );
        return (
          <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0', marginBottom: 14 }}>
            <div style={{ background: style.gradient, padding: '18px 22px', color: '#fff', display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ flex: '0 0 auto' }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .7, marginBottom: 2 }}>
                  {style.emoji} {style.label}
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{score}</div>
                <div style={{ fontSize: 10, opacity: .6, marginTop: 2 }}>Overall coverage</div>
              </div>
              <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                <span style={{ flex: 1, background: 'rgba(255,255,255,.15)', borderRadius: 6, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                  {p.found}<br /><span style={{ fontSize: 9, fontWeight: 700, opacity: .65, letterSpacing: '.5px' }}>FOUND</span>
                </span>
                <span style={{ flex: 1, background: 'rgba(255,255,255,.15)', borderRadius: 6, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                  {p.not_disclosed}<br /><span style={{ fontSize: 9, fontWeight: 700, opacity: .65, letterSpacing: '.5px' }}>MISSING</span>
                </span>
                <span style={{ flex: 2, background: 'rgba(255,255,255,.15)', borderRadius: 6, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                  {coveragePct}%<br /><span style={{ fontSize: 9, fontWeight: 700, opacity: .65, letterSpacing: '.5px' }}>COVERAGE</span>
                </span>
              </div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                {coverage.frameworks.join(' / ')} universal indicators
              </div>
              {pillarIndicators.length === 0 && pillarNarratives.length === 0 ? (
                <div style={{ fontSize: 11, color: '#9BA3C4', padding: '10px 0' }}>No universal indicators for this report.</div>
              ) : (
                <>
                  {pillarIndicators.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 20, rowGap: 0 }}>
                      {pillarIndicators.map((ind) => (
                        <IndicatorRow key={ind.framework_indicator_id} ind={ind} />
                      ))}
                    </div>
                  )}
                  {pillarNarratives.length > 0 && (
                    <>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: pillarIndicators.length > 0 ? 18 : 0, marginBottom: 4, paddingTop: pillarIndicators.length > 0 ? 14 : 0, borderTop: pillarIndicators.length > 0 ? '1px solid #E2E4F0' : 'none' }}>
                        Narrative disclosures
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 20, rowGap: 0 }}>
                        {pillarNarratives.map((nn) => (
                          <NarrativeRow key={nn.framework_indicator_id} nn={nn} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
