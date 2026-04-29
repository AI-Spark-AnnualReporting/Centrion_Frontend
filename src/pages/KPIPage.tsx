import { useEffect, useMemo, useRef, useState } from 'react';
import {
  documents as documentsApi,
  esg,
  lookups,
  ApiError,
  type EsgEvidenceItem,
  type EsgEvidenceResponse,
  type FrameworkIndicator,
} from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { DocumentBankReport, DocumentBankResponse } from '@/types/report';

const PAGE_SIZE = 8;

const categoryTextColor: Record<string, string> = {
  Environmental: '#16A34A',
  Social: '#0D9488',
  Governance: '#7C3AED',
  Economic: '#2563EB',
  Universal: '#5A6080',
  Filing: '#B45309',
};

const categoryBgColor: Record<string, string> = {
  Environmental: 'rgba(22,163,74,.12)',
  Social: 'rgba(13,148,136,.12)',
  Governance: 'rgba(124,58,237,.12)',
  Economic: 'rgba(37,99,235,.12)',
  Universal: 'rgba(90,96,128,.12)',
  Filing: 'rgba(180,83,9,.12)',
};

function categoryColor(category?: string | null): string {
  if (!category) return '#9BA3C4';
  return categoryTextColor[category] ?? '#5A6080';
}

function categoryBg(category?: string | null): string {
  if (!category) return 'rgba(155,163,196,.12)';
  return categoryBgColor[category] ?? 'rgba(90,96,128,.12)';
}

function normaliseFramework(framework?: string | null): string {
  if (!framework) return '';
  return framework.trim().toUpperCase().replace(/[\s_]/g, '-');
}

// The framework field is sometimes omitted from the lookup response (it's
// only returned when explicitly requested in `fields=`). Fall back to the
// source_code prefix: "IFRS-S1-…" / "IFRS-S2-…" identify themselves; anything
// else in this dataset is GRI.
function resolveFramework(ind: FrameworkIndicator): string {
  const direct = normaliseFramework(ind.framework);
  if (direct) return direct;
  const code = (ind.source_code ?? '').toUpperCase();
  if (code.startsWith('IFRS-S1')) return 'IFRS-S1';
  if (code.startsWith('IFRS-S2')) return 'IFRS-S2';
  if (code.startsWith('IFRS')) return 'IFRS';
  return 'GRI';
}

function confidenceBadge(c: number) {
  if (c >= 95) return 'b-gn';
  if (c >= 90) return 'b-bl';
  if (c >= 85) return 'b-am';
  return 'b-rd';
}

function formatPeriod(period?: string | null): string {
  if (!period) return '';
  return period.replace(/-/g, ' ').trim();
}

// Best-effort label for a tab. Reports often arrive with a generic title like
// "ESG Report" — combining title + period keeps tabs distinguishable when the
// user has multiple reports for different fiscal years.
function reportTabLabel(r: DocumentBankReport): string {
  const period = formatPeriod(r.period);
  const title = (r.title ?? '').trim();
  if (title && period) return `${title} · ${period}`;
  if (title) return title;
  if (period) return period;
  return r.report_id.slice(0, 8);
}

// Pull the verbatim quote / context snippet out of the optional inner
// raw_evidence wrapper if the top-level fields were null.
function evidenceQuote(item: EsgEvidenceItem): string | null {
  if (item.verbatim_quote) return item.verbatim_quote;
  if (item.context_snippet) return item.context_snippet;
  if (item.narrative_summary) return item.narrative_summary;
  return null;
}

function evidenceFrameworkRef(item: EsgEvidenceItem): string {
  const codes = item.framework_codes ?? [];
  if (codes.length > 0) return codes.join(', ');
  if (item.framework && item.source_code) return `${item.framework}-${item.source_code}`;
  if (item.source_code) return item.source_code;
  return '—';
}

// raw_value can be a string or number; keep dashes for missing values rather
// than rendering "null".
function evidenceValue(item: EsgEvidenceItem): string {
  const v = item.raw_value;
  if (v === null || v === undefined || v === '') {
    if (item.boolean_value === true) return 'Yes';
    if (item.boolean_value === false) return 'No';
    return '—';
  }
  if (typeof v === 'number') return v.toLocaleString();
  // Heuristic: if the string parses as a number, format it with thousands
  // separators so the table reads consistently.
  const n = Number(v);
  if (!Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    return n.toLocaleString();
  }
  return v;
}

interface ReportPickerProps {
  reports: DocumentBankReport[];
  activeReportId: string | null;
  onSelect: (reportId: string) => void;
}

function ReportPicker({ reports, activeReportId, onSelect }: ReportPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const active = reports.find((r) => r.report_id === activeReportId) ?? null;

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => reportTabLabel(r).toLowerCase().includes(q));
  }, [reports, query]);

  // Show search box only once the list crosses a usable threshold.
  const showSearch = reports.length > 8;

  const triggerLabel = active ? reportTabLabel(active) : 'Select a report';

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', padding: '12px 18px 14px', borderBottom: '1px solid #ECEEF8' }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          width: '100%',
          maxWidth: 420,
          padding: '9px 12px',
          borderRadius: 10,
          border: '1.5px solid #E2E4F0',
          background: open ? '#F5F5FF' : '#fff',
          color: '#1A1D2E',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          transition: '.15s',
        }}
      >
        <span
          style={{
            flex: 1,
            textAlign: 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {triggerLabel}
        </span>
        <span style={{ fontSize: 10, color: '#9BA3C4', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {reports.length} {reports.length === 1 ? 'report' : 'reports'}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transition: 'transform .15s',
            transform: open ? 'rotate(180deg)' : 'none',
            color: '#5A6080',
          }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% - 4px)',
            left: 18,
            right: 18,
            maxWidth: 420,
            zIndex: 20,
            background: '#fff',
            border: '1px solid #E2E4F0',
            borderRadius: 12,
            boxShadow: '0 10px 40px rgba(64,64,200,.14)',
            padding: showSearch ? '10px 10px 8px' : '6px',
          }}
        >
          {showSearch && (
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reports…"
              autoFocus
              style={{
                width: '100%',
                padding: '8px 11px',
                border: '1.5px solid #E2E4F0',
                borderRadius: 8,
                fontSize: 12,
                fontFamily: 'inherit',
                outline: 'none',
                marginBottom: 6,
              }}
            />
          )}

          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px 10px', fontSize: 12, color: '#9BA3C4', textAlign: 'center' }}>
                No reports match “{query}”.
              </div>
            ) : (
              filtered.map((r) => {
                const isActive = r.report_id === activeReportId;
                return (
                  <button
                    key={r.report_id}
                    type="button"
                    onClick={() => {
                      onSelect(r.report_id);
                      setOpen(false);
                      setQuery('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      width: '100%',
                      padding: '9px 11px',
                      borderRadius: 8,
                      border: 'none',
                      background: isActive ? '#EEEEFF' : 'transparent',
                      color: isActive ? '#4040C8' : '#1A1D2E',
                      fontSize: 12,
                      fontWeight: isActive ? 700 : 500,
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: '.12s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = '#F5F5FF';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {reportTabLabel(r)}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: '#9BA3C4',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.documents.length} {r.documents.length === 1 ? 'doc' : 'docs'}
                    </span>
                    {isActive && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2.5 6l2.5 2.5L9.5 3.5"
                          stroke="#4040C8"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface IndicatorListProps {
  indicators: FrameworkIndicator[];
  loading: boolean;
  error: string | null;
  emptyLabel: string;
}

function IndicatorList({ indicators, loading, error, emptyLabel }: IndicatorListProps) {
  if (loading) {
    return (
      <div style={{ padding: '32px 18px', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
        <div className="proc-ring" style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 2 }} />
        Loading indicators…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '24px 18px', color: '#DC2626', fontSize: 12, textAlign: 'center' }}>
        {error}
      </div>
    );
  }
  if (indicators.length === 0) {
    return (
      <div style={{ padding: '24px 18px', color: '#9BA3C4', fontSize: 12, textAlign: 'center' }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 18px 12px', maxHeight: 420, overflowY: 'auto' }}>
      {indicators.map((ind, i) => {
        const last = i === indicators.length - 1;
        return (
          <div
            key={ind.id ?? `${ind.framework}-${ind.source_code}-${i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '11px 0',
              borderBottom: last ? 'none' : '1px solid #ECEEF8',
              gap: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12,
                  color: '#1A1D2E',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={ind.indicator_label}
              >
                {ind.indicator_label}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: '#9BA3C4',
                  marginTop: 2,
                  fontFamily: "'DM Mono',monospace",
                  fontWeight: 600,
                }}
              >
                {resolveFramework(ind)} · {ind.source_code}
              </div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'DM Mono',monospace",
                color: '#1A1D2E',
                minWidth: 56,
                textAlign: 'right',
              }}
            >
              {ind.expected_unit ?? '—'}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: categoryColor(ind.esg_category),
                background: categoryBg(ind.esg_category),
                padding: '3px 10px',
                borderRadius: 999,
                whiteSpace: 'nowrap',
                letterSpacing: '.2px',
                flexShrink: 0,
              }}
            >
              {ind.esg_category ?? '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Framework-card header — gradient badge on the left, framework name + caption,
// and a tinted count pill on the right. Replaces the dull plain-text title row.
function FrameworkCardHeader({
  badge,
  badgeGradient,
  title,
  subtitle,
  count,
  countTone,
}: {
  badge: string;
  badgeGradient: string;
  title: string;
  subtitle: string;
  count: number | null;
  countTone: 'green' | 'blue';
}) {
  const tone = countTone === 'green'
    ? { color: '#16A34A', bg: 'rgba(22,163,74,.12)' }
    : { color: '#2563EB', bg: 'rgba(37,99,235,.12)' };
  return (
    <div
      style={{
        padding: '14px 18px',
        borderBottom: '1px solid #ECEEF8',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: badgeGradient,
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '.5px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'DM Mono',monospace",
          flexShrink: 0,
          boxShadow: '0 4px 10px rgba(26,29,46,.08)',
        }}
      >
        {badge}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.1px' }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>{subtitle}</div>
      </div>
      {count !== null && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            color: tone.color,
            background: tone.bg,
            padding: '4px 10px',
            borderRadius: 999,
            fontFamily: "'DM Mono',monospace",
            flexShrink: 0,
          }}
        >
          {count}
          <span style={{ fontSize: 9, opacity: .75, fontFamily: 'inherit' }}>indicators</span>
        </span>
      )}
    </div>
  );
}

// Section-card header — icon tile on the left, title + caption, meta on the
// right. Used for the "Extracted Values by Report" panel.
function SectionCardHeader({
  icon,
  iconGradient,
  title,
  subtitle,
  meta,
}: {
  icon: React.ReactNode;
  iconGradient: string;
  title: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderBottom: '1px solid #ECEEF8',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: iconGradient,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 4px 10px rgba(64,64,200,.18)',
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.1px' }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>{subtitle}</div>
      </div>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#5A6080',
          background: '#F1F2FA',
          padding: '4px 10px',
          borderRadius: 999,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {meta}
      </span>
    </div>
  );
}

export default function KPIPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // ── Top cards (framework indicator catalogue) ──────────────────────────
  const [indicators, setIndicators] = useState<FrameworkIndicator[]>([]);
  const [indicatorsLoading, setIndicatorsLoading] = useState(true);
  const [indicatorsError, setIndicatorsError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setIndicatorsLoading(true);
    setIndicatorsError(null);

    lookups
      .frameworkIndicators({
        framework: ['GRI', 'IFRS-S1', 'IFRS-S2'],
        fields: ['framework', 'source_code', 'indicator_label', 'esg_category', 'expected_unit'],
        is_active: true,
        signal: ctrl.signal,
      })
      .then((list) => setIndicators(list))
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setIndicatorsError(
          err instanceof ApiError
            ? `Failed to load indicators (${err.status})`
            : err instanceof Error
              ? err.message
              : 'Failed to load indicators',
        );
      })
      .finally(() => setIndicatorsLoading(false));

    return () => ctrl.abort();
  }, []);

  const griIndicators = useMemo(
    () => indicators.filter((i) => resolveFramework(i) === 'GRI'),
    [indicators],
  );
  const ifrsIndicators = useMemo(
    () =>
      indicators.filter((i) => {
        const f = resolveFramework(i);
        return f === 'IFRS-S1' || f === 'IFRS-S2';
      }),
    [indicators],
  );

  // ── Reports / tabs ─────────────────────────────────────────────────────
  const [reports, setReports] = useState<DocumentBankReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setReportsLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setReportsLoading(true);
    setReportsError(null);

    documentsApi
      .byReport<DocumentBankResponse>(companyId)
      .then((res) => {
        // Only keep reports that have at least one document — without a
        // document_id we can't query the evidence endpoint for that tab.
        const usable = (res.reports ?? []).filter((r) => r.documents.length > 0);
        setReports(usable);
        if (usable.length > 0) {
          setActiveReportId((curr) => curr ?? usable[0].report_id);
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setReportsError(
          err instanceof ApiError
            ? `Failed to load reports (${err.status})`
            : err instanceof Error
              ? err.message
              : 'Failed to load reports',
        );
      })
      .finally(() => setReportsLoading(false));

    return () => ctrl.abort();
  }, [companyId]);

  const activeReport = useMemo(
    () => reports.find((r) => r.report_id === activeReportId) ?? null,
    [reports, activeReportId],
  );

  const documentNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (activeReport) {
      for (const doc of activeReport.documents) {
        map.set(doc.id, doc.filename);
      }
    }
    return map;
  }, [activeReport]);

  // ── Evidence rows for active tab ───────────────────────────────────────
  const [evidence, setEvidence] = useState<EsgEvidenceItem[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const toggleCell = (key: string) => {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Track the latest request so a slow earlier response can't overwrite a
  // faster later one when the user clicks tabs quickly.
  const evidenceRequestIdRef = useRef(0);

  useEffect(() => {
    if (!companyId || !activeReport) {
      setEvidence([]);
      return;
    }
    const documentId = activeReport.documents[0]?.id;
    if (!documentId) {
      setEvidence([]);
      return;
    }

    const requestId = ++evidenceRequestIdRef.current;
    const ctrl = new AbortController();
    setEvidenceLoading(true);
    setEvidenceError(null);

    esg
      .getEvidence<EsgEvidenceResponse>(companyId, {
        document_id: documentId,
        // The endpoint accepts an empty `pillar` to mean "all pillars".
        pillar: '',
        signal: ctrl.signal,
      })
      .then((res) => {
        if (requestId !== evidenceRequestIdRef.current) return;
        // Each row is wrapped in `{ raw_evidence: {...} }` — unwrap to the
        // inner object that holds the actual values.
        const rows = (res.evidence ?? [])
          .map((e) => e?.raw_evidence)
          .filter((v): v is EsgEvidenceItem => Boolean(v));
        setEvidence(rows);
        setPage(1);
        setExpandedCells(new Set());
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (requestId !== evidenceRequestIdRef.current) return;
        setEvidenceError(
          err instanceof ApiError
            ? `Failed to load evidence (${err.status})`
            : err instanceof Error
              ? err.message
              : 'Failed to load evidence',
        );
        setEvidence([]);
      })
      .finally(() => {
        if (requestId === evidenceRequestIdRef.current) setEvidenceLoading(false);
      });

    return () => ctrl.abort();
  }, [companyId, activeReport]);

  const totalRows = evidence.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, totalRows);
  const visibleRows = evidence.slice(startIdx, endIdx);

  const headerFramework = useMemo(() => {
    const seen = new Set<string>();
    for (const row of evidence) {
      if (row.framework) seen.add(row.framework);
    }
    if (seen.size === 0) return '—';
    return Array.from(seen).join(' · ');
  }, [evidence]);

  const handleTabClick = (id: string) => {
    setActiveReportId(id);
    setPage(1);
  };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>KPI Normalizer</h2>
          <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
            Financial, ESG and regulatory KPIs with AI insights
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 14 }}>
        <div className="card">
          <FrameworkCardHeader
            badge="GRI"
            badgeGradient="linear-gradient(135deg,#065F46,#10B981)"
            title="GRI Standards"
            subtitle="Global Reporting Initiative"
            count={indicatorsLoading ? null : griIndicators.length}
            countTone="green"
          />
          <IndicatorList
            indicators={griIndicators}
            loading={indicatorsLoading}
            error={indicatorsError}
            emptyLabel="No GRI indicators returned."
          />
        </div>

        <div className="card">
          <FrameworkCardHeader
            badge="IFRS"
            badgeGradient="linear-gradient(135deg,#1E3A8A,#3B82F6)"
            title="IFRS Sustainability"
            subtitle="IFRS S1 · IFRS S2 disclosures"
            count={indicatorsLoading ? null : ifrsIndicators.length}
            countTone="blue"
          />
          <IndicatorList
            indicators={ifrsIndicators}
            loading={indicatorsLoading}
            error={indicatorsError}
            emptyLabel="No IFRS-S1 / IFRS-S2 indicators returned."
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <SectionCardHeader
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2.5h10v9h-10z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              <path d="M2 5.5h10M5.5 2.5v9" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          }
          iconGradient="linear-gradient(135deg,#4040C8,#6366F1)"
          title="Extracted Values by Report"
          subtitle="Evidence pulled from uploaded source documents"
          meta={evidenceLoading
            ? 'Loading…'
            : `${totalRows} ${totalRows === 1 ? 'metric' : 'metrics'} · ${headerFramework}`}
        />

        {/* Tabs */}
        {reportsLoading ? (
          <div style={{ padding: '24px 18px', color: '#9BA3C4', fontSize: 12 }}>
            Loading reports…
          </div>
        ) : reportsError ? (
          <div style={{ padding: '24px 18px', color: '#DC2626', fontSize: 12 }}>
            {reportsError}
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: '24px 18px', color: '#9BA3C4', fontSize: 12 }}>
            No processed reports yet.
          </div>
        ) : (
          <>
            <ReportPicker
              reports={reports}
              activeReportId={activeReportId}
              onSelect={handleTabClick}
            />

            <div style={{ padding: 18 }}>
              {evidenceError ? (
                <div style={{ padding: '24px 0', color: '#DC2626', fontSize: 12, textAlign: 'center' }}>
                  {evidenceError}
                </div>
              ) : evidenceLoading ? (
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
                  <div
                    className="proc-ring"
                    style={{ margin: '0 auto 10px', width: 28, height: 28, borderWidth: 2 }}
                  />
                  Loading extracted values…
                </div>
              ) : totalRows === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: '#9BA3C4', fontSize: 12 }}>
                  No extracted values for this report.
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #ECEEF8' }}>
                          {[
                            'KPI',
                            'Value',
                            'Unit',
                            'Framework Ref',
                            'Source',
                            'Document',
                            'Verbatim Quote',
                            'Confidence',
                          ].map((h, i) => (
                            <th
                              key={h}
                              style={{
                                textAlign: i === 1 || i === 7 ? 'right' : 'left',
                                fontSize: 10,
                                fontWeight: 700,
                                color: '#5A6080',
                                textTransform: 'uppercase',
                                letterSpacing: '.6px',
                                padding: '8px 10px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row, i) => {
                          const quote = evidenceQuote(row);
                          const conf = Math.round((row.confidence ?? 0) * 100);
                          const docName = row.document_id
                            ? documentNameById.get(row.document_id)
                            : undefined;
                          const rowKey = `${row.framework_indicator_id ?? row.source_code}-${startIdx + i}`;

                          const truncatedStyle = (maxWidth: number, expanded: boolean) =>
                            expanded
                              ? {
                                  padding: '8px 10px',
                                  whiteSpace: 'normal' as const,
                                  wordBreak: 'break-word' as const,
                                  maxWidth,
                                }
                              : {
                                  padding: '8px 10px',
                                  whiteSpace: 'nowrap' as const,
                                  overflow: 'hidden' as const,
                                  textOverflow: 'ellipsis' as const,
                                  maxWidth,
                                };

                          const kpiKey = `${rowKey}-kpi`;
                          const refKey = `${rowKey}-ref`;
                          const docKey = `${rowKey}-doc`;
                          const quoteKey = `${rowKey}-quote`;

                          const kpiOpen = expandedCells.has(kpiKey);
                          const refOpen = expandedCells.has(refKey);
                          const docOpen = expandedCells.has(docKey);
                          const quoteOpen = expandedCells.has(quoteKey);

                          return (
                            <tr
                              key={rowKey}
                              style={{
                                borderBottom:
                                  i < visibleRows.length - 1 ? '1px solid #F2F3FA' : 'none',
                              }}
                            >
                              <td
                                onClick={() => toggleCell(kpiKey)}
                                style={{
                                  ...truncatedStyle(240, kpiOpen),
                                  color: '#1A1D2E',
                                  fontWeight: 500,
                                  cursor: 'pointer',
                                }}
                              >
                                {row.indicator_label ?? row.source_code ?? '—'}
                              </td>
                              <td
                                style={{
                                  padding: '8px 10px',
                                  textAlign: 'right',
                                  fontFamily: "'DM Mono',monospace",
                                  fontWeight: 700,
                                  color: '#1A1D2E',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {evidenceValue(row)}
                              </td>
                              <td style={{ padding: '8px 10px', color: '#5A6080', whiteSpace: 'nowrap' }}>
                                {row.raw_unit || '—'}
                              </td>
                              <td
                                onClick={() => toggleCell(refKey)}
                                style={{ ...truncatedStyle(160, refOpen), color: '#5A6080', cursor: 'pointer' }}
                              >
                                {evidenceFrameworkRef(row)}
                              </td>
                              <td style={{ padding: '8px 10px', color: '#5A6080', whiteSpace: 'nowrap' }}>
                                {row.source_page != null ? `p. ${row.source_page}` : '—'}
                              </td>
                              <td
                                onClick={() => toggleCell(docKey)}
                                style={{ ...truncatedStyle(180, docOpen), color: '#5A6080', cursor: 'pointer' }}
                              >
                                {docName ?? '—'}
                              </td>
                              <td
                                onClick={() => toggleCell(quoteKey)}
                                style={{
                                  ...truncatedStyle(280, quoteOpen),
                                  color: '#5A6080',
                                  fontStyle: quote ? 'italic' : 'normal',
                                  cursor: 'pointer',
                                }}
                              >
                                {quote ? `“${quote}”` : '—'}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                <span className={`badge ${confidenceBadge(conf)}`}>{conf}%</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 14,
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#5A6080' }}>
                      Showing{' '}
                      <strong style={{ color: '#1A1D2E' }}>
                        {startIdx + 1}–{endIdx}
                      </strong>{' '}
                      of <strong style={{ color: '#1A1D2E' }}>{totalRows}</strong>
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        className="btn bs bsm"
                        disabled={safePage === 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        style={{
                          opacity: safePage === 1 ? 0.5 : 1,
                          cursor: safePage === 1 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Prev
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                        const isActive = p === safePage;
                        return (
                          <button
                            key={p}
                            onClick={() => setPage(p)}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: isActive ? 'none' : '1.5px solid #E2E4F0',
                              background: isActive ? '#4040C8' : '#fff',
                              color: isActive ? '#fff' : '#5A6080',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: '.15s',
                              boxShadow: isActive ? '0 4px 12px rgba(64,64,200,.25)' : 'none',
                            }}
                          >
                            {p}
                          </button>
                        );
                      })}
                      <button
                        className="btn bs bsm"
                        disabled={safePage === totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        style={{
                          opacity: safePage === totalPages ? 0.5 : 1,
                          cursor: safePage === totalPages ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
