import { useEffect, useState } from 'react';
import { reports as reportsApi, ApiError } from '@/lib/api';
import type { CoverageCriticalGap, CoverageIndicator, CoverageResponse } from '@/types/report';

interface MissingMetricInfo {
  framework_indicator_id: string;
  framework: string;
  source_code: string;
  indicator_label: string;
  pillar: string;
  is_mandatory?: boolean;
  severity?: string;
}

// Small chat-bubble icon hint shown on missing rows / cards so users discover
// they can click through to ask a question about the gap.
function AskIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M2 3.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 10 3.5v3A1.5 1.5 0 0 1 8.5 8H6L4 10V8h-.5A1.5 1.5 0 0 1 2 6.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="4.5" cy="5" r=".55" fill="currentColor" />
      <circle cx="6" cy="5" r=".55" fill="currentColor" />
      <circle cx="7.5" cy="5" r=".55" fill="currentColor" />
    </svg>
  );
}

function MissingMetricModal({
  info,
  companyId,
  reportId,
  onClose,
}: {
  info: MissingMetricInfo;
  companyId: string | null;
  reportId: string;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedOk, setSubmittedOk] = useState(false);
  const pillarKey = pillarBaseKey(info.pillar);
  const pillarLabel = pillarKey === 'OTHER' ? 'Other' : PILLAR_STYLES[pillarKey].label;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, submitting]);

  const handleSubmit = () => {
    if (!question.trim() || submitting) return;
    if (!companyId) {
      setSubmitError('Missing company context. Please reload the page.');
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    reportsApi
      .createQuestion(companyId, reportId, {
        framework_indicator_id: info.framework_indicator_id,
        question_text: question.trim(),
      })
      .then(() => {
        setSubmittedOk(true);
        setSubmitting(false);
        // Brief confirmation, then dismiss the modal.
        setTimeout(onClose, 900);
      })
      .catch((err: unknown) => {
        const msg = err instanceof ApiError
          ? `Couldn't submit question (${err.status}). Please try again.`
          : "Couldn't submit question. Please try again.";
        setSubmitError(msg);
        setSubmitting(false);
      });
  };

  const code = info.framework ? `${info.framework} ${info.source_code}` : info.source_code;
  const canSubmit = question.trim().length > 0 && !submitting && !submittedOk;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,18,40,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 14,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 20px 50px rgba(0,0,0,.25)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px 14px', borderBottom: '1px solid #ECEEF8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: '#4040C8', background: 'rgba(64,64,200,.08)', padding: '3px 7px', borderRadius: 4, letterSpacing: '.3px' }}>
                {code}
              </span>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#DC2626', background: 'rgba(239,68,68,.1)', padding: '3px 7px', borderRadius: 999, letterSpacing: '.4px' }}>
                {info.severity ? info.severity : 'MISSING'}
              </span>
              {info.is_mandatory && (
                <span style={{ fontSize: 9, fontWeight: 800, color: '#B45309', background: 'rgba(245,158,11,.12)', padding: '3px 7px', borderRadius: 999, letterSpacing: '.4px' }}>
                  MANDATORY
                </span>
              )}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E', lineHeight: 1.35 }}>
              {info.indicator_label}
            </div>
            <div style={{ fontSize: 10, color: '#5A6080', marginTop: 4 }}>
              {pillarLabel} pillar{info.framework ? ` · ${info.framework}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', color: '#9BA3C4', padding: 4, lineHeight: 0, flexShrink: 0, opacity: submitting ? 0.5 : 1 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
            Write the question you wanted to ask for this metric
          </label>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Where can we source this disclosure for FY 2026?"
            rows={4}
            autoFocus
            disabled={submitting || submittedOk}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.5,
              borderRadius: 8,
              border: '1px solid #E2E4F0',
              outline: 'none',
              fontFamily: 'inherit',
              color: '#1A1D2E',
              background: '#F8F9FE',
            }}
          />
          {submitError && (
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#DC2626', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: '8px 10px' }}>
              {submitError}
            </div>
          )}
          {submittedOk && (
            <div style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: '#16A34A', background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 8, padding: '8px 10px' }}>
              Question submitted.
            </div>
          )}
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid #E2E4F0', background: '#fff', color: '#1A1D2E', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 8,
              border: 'none',
              background: '#4040C8',
              color: '#fff',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              opacity: canSubmit ? 1 : 0.55,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {submitting ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeOpacity="0.3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <AskIcon size={12} />
            )}
            {submitting ? 'Sending…' : submittedOk ? 'Sent' : 'Ask Question'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    return `Not disclosed in the uploaded documents. Add evidence for this indicator to raise the ${pillarLabelForBody} pillar coverage.`;
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

// Numeric/bool/missing indicator row. For disclosed metrics, click toggles the
// inline expanded view. For missing metrics, click opens the question modal
// instead — the inline expand was redundant for gaps anyway.
function IndicatorRow({
  ind,
  companyId,
  reportId,
}: {
  ind: CoverageIndicator;
  companyId: string | null;
  reportId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  const isFound = ind.status === 'FOUND';
  const isMissing = ind.status === 'NOT_DISCLOSED';
  const handleClick = () => {
    if (isMissing) setAskOpen(true);
    else setExpanded((v) => !v);
  };
  return (
    <div style={{ borderBottom: '1px solid #ECEEF8', minWidth: 0, overflow: 'hidden' }}>
      <div
        onClick={handleClick}
        style={{ display: 'flex', alignItems: 'center', padding: '7px 0', fontSize: 11, gap: 8, cursor: 'pointer' }}
        title={isMissing ? 'Ask a question about this missing metric' : 'Click to expand'}
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
        {isMissing && (
          <span style={{ display: 'inline-flex', alignItems: 'center', color: '#4040C8', flexShrink: 0 }} title="Ask a question">
            <AskIcon size={12} />
          </span>
        )}
        {isFound ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#22C55E" /><path d="M4 6.5l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
        ) : isMissing ? (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#EF4444" /><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}><circle cx="6.5" cy="6.5" r="5.5" fill="#F59E0B" /><path d="M6.5 4v3M6.5 9v.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
        )}
      </div>
      {expanded && !isMissing && (
        <div style={{ padding: '0 0 10px 0', fontSize: 11, color: '#5A6080', lineHeight: 1.55 }}>
          <div style={{ fontWeight: 600, color: '#1A1D2E', marginBottom: 2 }}>{ind.indicator_label}</div>
          {ind.text_value && ind.text_value.trim().length > 0 && (
            <div style={{ whiteSpace: 'pre-wrap' }}>{ind.text_value}</div>
          )}
        </div>
      )}
      {askOpen && (
        <MissingMetricModal
          info={{
            framework_indicator_id: ind.framework_indicator_id,
            framework: ind.framework,
            source_code: ind.source_code,
            indicator_label: ind.indicator_label,
            pillar: ind.pillar,
          }}
          companyId={companyId}
          reportId={reportId}
          onClose={() => setAskOpen(false)}
        />
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

// Sector impact gap card. Whole card is clickable — opens the question modal
// for that gap. Hover lifts the card slightly so the affordance is obvious.
function CriticalGapCard({
  gap,
  framework,
  companyId,
  reportId,
}: {
  gap: CoverageCriticalGap;
  framework: string;
  companyId: string | null;
  reportId: string;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const code = framework ? `${framework} ${gap.source_code}` : gap.source_code;
  const pillarKey = pillarBaseKey(gap.pillar);
  const pillarLabel = pillarKey === 'OTHER' ? 'Other' : PILLAR_STYLES[pillarKey].label;
  const severity = (gap.sector_threshold ?? '').toUpperCase() || 'GAP';
  return (
    <>
      <div
        onClick={() => setAskOpen(true)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setAskOpen(true);
          }
        }}
        title="Ask a question about this missing metric"
        style={{
          background: hover ? 'rgba(239,68,68,.07)' : 'rgba(239,68,68,.04)',
          border: `1px solid rgba(239,68,68,${hover ? '.45' : '.25'})`,
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 10,
          cursor: 'pointer',
          transition: 'background .15s, border-color .15s, transform .15s',
          transform: hover ? 'translateY(-1px)' : 'none',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
              {gap.indicator_label} <span style={{ color: '#5A6080', fontWeight: 700 }}>({code})</span>
            </div>
            <div style={{ fontSize: 10, color: '#5A6080', marginTop: 2 }}>
              {pillarLabel}
              {framework ? ` · ${framework}` : ''}
              {gap.is_mandatory ? ' · Mandatory disclosure' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            {gap.is_mandatory && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: 'rgba(245,158,11,.12)', color: '#B45309', letterSpacing: '.4px' }}>MANDATORY</span>
            )}
            <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: 'rgba(239,68,68,.1)', color: '#DC2626', letterSpacing: '.4px' }}>{severity}</span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                color: '#4040C8',
                background: 'rgba(64,64,200,.08)',
                padding: '4px 8px',
                borderRadius: 999,
              }}
            >
              <AskIcon size={11} />
              Ask
            </span>
          </div>
        </div>
      </div>
      {askOpen && (
        <MissingMetricModal
          info={{
            framework_indicator_id: gap.framework_indicator_id,
            framework,
            source_code: gap.source_code,
            indicator_label: gap.indicator_label,
            pillar: gap.pillar,
            is_mandatory: gap.is_mandatory,
            severity,
          }}
          companyId={companyId}
          reportId={reportId}
          onClose={() => setAskOpen(false)}
        />
      )}
    </>
  );
}

export interface ReportDetailViewProps {
  coverage: CoverageResponse;
}

export function ReportDetailView({ coverage }: ReportDetailViewProps) {
  const summary = coverage.summary;
  const companyId = coverage.company_id ?? null;
  const reportId = coverage.report_id;
  // Regional reports surface regulator codes (e.g. "QFMA") rather than the
  // generic framework codes; fall back to frameworks if regulators is missing
  // or empty so non-regional reports continue to work unchanged.
  const isRegional = coverage.scope_type === 'regional';
  const regulatorCodes = (coverage.regulators ?? [])
    .map((r) => r.code)
    .filter((c): c is string => Boolean(c));
  const displayCodes = isRegional && regulatorCodes.length > 0
    ? regulatorCodes
    : coverage.frameworks;
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
              {displayCodes.map((code) => (
                <span key={code} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)' }}>{code}</span>
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

      {/* Pillar sections — 2-column grid: E, S in row 1; G, ESG in row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 14 }}>
        {(['E', 'S', 'G', 'ESG'] as const).map((pk) => {
          const style = PILLAR_STYLES[pk];
          const p = summary.by_pillar?.[pk] ?? { total: 0, found: 0, partial: 0, not_disclosed: 0 };
          if (pk === 'ESG' && p.total === 0) return null;
          const coveragePct = coveragePercent(p.found, p.total);
          const score = coveragePct;
          // Split into three buckets: disclosed numeric/bool metrics, disclosed
          // narratives, and everything missing (regardless of data_type) — the
          // missing bucket is rendered last under its own subtitle.
          const pillarItems = coverage.indicators.filter((i) => pillarBaseKey(i.pillar) === pk);
          const pillarIndicators = sortIndicators(
            pillarItems.filter((i) => i.data_type !== 'text_block' && i.status !== 'NOT_DISCLOSED'),
          );
          const pillarNarratives = sortNarratives(
            pillarItems.filter((i) => i.data_type === 'text_block' && i.status !== 'NOT_DISCLOSED'),
          );
          const pillarMissing = sortIndicators(
            pillarItems.filter((i) => i.status === 'NOT_DISCLOSED'),
          );
          const metricsLabel = pk === 'ESG'
            ? `${displayCodes.join(' / ')} universal indicators`
            : `${displayCodes.join(' / ')} metrics`;
          const emptyLabel = pk === 'ESG'
            ? 'No universal indicators for this report.'
            : 'No indicators for this pillar.';
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
              <div style={{ padding: '8px 14px', maxHeight: 380, overflowY: 'auto' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                  {metricsLabel}
                </div>
                {pillarIndicators.length === 0 && pillarNarratives.length === 0 && pillarMissing.length === 0 ? (
                  <div style={{ fontSize: 11, color: '#9BA3C4', padding: '10px 0' }}>{emptyLabel}</div>
                ) : (
                  <>
                    {pillarIndicators.map((ind) => (
                      <IndicatorRow key={ind.framework_indicator_id} ind={ind} companyId={companyId} reportId={reportId} />
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
                    {pillarMissing.length > 0 && (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 14, marginBottom: 6, paddingTop: 10, borderTop: '1px solid #E2E4F0' }}>
                          Missing disclosures
                        </div>
                        {pillarMissing.map((mm) => (
                          <IndicatorRow key={mm.framework_indicator_id} ind={mm} companyId={companyId} reportId={reportId} />
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

      {/* Missing Metrics — Impact Analysis (driven by coverage.critical_gaps) */}
      {coverage.critical_gaps && coverage.critical_gaps.length > 0 && (() => {
        const gaps = coverage.critical_gaps;
        // Build a lookup so we can render the framework chip ("GRI 304-1") even
        // though the critical_gaps payload itself doesn't include `framework`.
        const frameworkById = new Map<string, string>();
        for (const ind of coverage.indicators) {
          frameworkById.set(ind.framework_indicator_id, ind.framework);
        }
        const criticalCount = gaps.filter((g) => g.sector_threshold === 'critical').length;
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>
                  Missing Metrics — {coverage.sector?.name ? `${coverage.sector.name} ` : ''}Sector Impact Analysis
                </span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: 'rgba(239,68,68,.08)', padding: '4px 10px', borderRadius: 999 }}>
                {criticalCount} critical {criticalCount === 1 ? 'gap' : 'gaps'}
              </span>
            </div>
            {gaps.map((g) => {
              const framework = frameworkById.get(g.framework_indicator_id) ?? '';
              return (
                <CriticalGapCard
                  key={g.framework_indicator_id}
                  gap={g}
                  framework={framework}
                  companyId={companyId}
                  reportId={reportId}
                />
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
