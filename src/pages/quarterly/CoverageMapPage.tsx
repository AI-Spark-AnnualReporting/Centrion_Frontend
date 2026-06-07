import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports } from '@/lib/api';
import type { QuarterlyCoverageResponse, CoverageFigure } from '@/types/quarterly';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ─── colours ────────────────────────────────────────────────────────────────
const ACCENT = '#4040C8';
const AMBER = '#D97706';
const AMBER_BG = '#FFFBEB';
const AMBER_BORDER = '#FDE68A';
const AMBER_PILL_BG = '#FEF3C7';
const GREEN = '#10B981';
const GREEN_BG = '#F0FDF4';
const GREEN_PILL_BG = '#D1FAE5';
const MUTED = '#6B7280';
const MONO = "'DM Mono', 'Courier New', monospace";

// ─── Loading skeleton ────────────────────────────────────────────────────────
function Skel({ w, h }: { w: string | number; h?: number }) {
  return (
    <div
      className="skel"
      style={{
        width: w,
        height: h ?? 16,
        borderRadius: 6,
        display: 'inline-block',
      }}
    />
  );
}

function LoadingState() {
  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Cards skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: '18px 20px' }}>
            <Skel w="60%" h={12} />
            <div style={{ marginTop: 10 }}><Skel w="40%" h={28} /></div>
            <div style={{ marginTop: 8 }}><Skel w="70%" h={12} /></div>
          </div>
        ))}
      </div>
      {/* Bar skeleton */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
        <Skel w="100%" h={12} />
        <div style={{ marginTop: 8 }}><Skel w="100%" h={20} /></div>
      </div>
      {/* Table skeleton */}
      <div className="card" style={{ padding: '16px 20px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
            <Skel w="8%" h={14} />
            <Skel w="28%" h={14} />
            <Skel w="12%" h={14} />
            <Skel w="12%" h={14} />
            <Skel w="10%" h={14} />
            <Skel w="14%" h={14} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Change cell ─────────────────────────────────────────────────────────────
function ChangeCell({ pct, direction }: { pct: number | null; direction: 'up' | 'down' | null }) {
  if (pct == null || direction == null) {
    return <span style={{ color: MUTED }}>—</span>;
  }
  const up = direction === 'up';
  return (
    <span style={{ color: up ? GREEN : '#EF4444', fontFamily: MONO, fontSize: 13 }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

// ─── Driver pill ─────────────────────────────────────────────────────────────
function DriverPill({ status }: { status: 'missing' | 'found' }) {
  const missing = status === 'missing';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: missing ? AMBER_PILL_BG : GREEN_PILL_BG,
        color: missing ? AMBER : GREEN,
        border: `1px solid ${missing ? '#FDE68A' : '#A7F3D0'}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'currentColor',
          display: 'inline-block',
        }}
      />
      {missing ? 'Reason missing' : 'Reason found'}
    </span>
  );
}

// ─── Figure table ─────────────────────────────────────────────────────────────
function FigureTable({
  rows,
  periodLabel,
  priorLabel,
}: {
  rows: CoverageFigure[];
  periodLabel: string;
  priorLabel: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow style={{ background: '#F8F9FC' }}>
          <TableHead style={{ fontFamily: MONO, fontSize: 11, width: 90 }}>CODE</TableHead>
          <TableHead style={{ fontSize: 11 }}>METRIC</TableHead>
          <TableHead style={{ fontSize: 11, textAlign: 'right', width: 130 }}>{periodLabel}</TableHead>
          <TableHead style={{ fontSize: 11, textAlign: 'right', width: 130, color: MUTED }}>{priorLabel}</TableHead>
          <TableHead style={{ fontSize: 11, textAlign: 'right', width: 110 }}>CHANGE</TableHead>
          <TableHead style={{ fontSize: 11, width: 150 }}>DRIVER</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.figure_id} style={{ verticalAlign: 'top' }}>
            <TableCell>
              <span style={{ fontFamily: MONO, fontSize: 12, color: ACCENT, fontWeight: 600 }}>
                {row.code}
              </span>
            </TableCell>
            <TableCell>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{row.label}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 1, textTransform: 'capitalize' }}>
                {row.statement.replace(/_/g, ' ')}
              </div>
            </TableCell>
            <TableCell style={{ textAlign: 'right', fontFamily: MONO, fontSize: 13 }}>
              {row.current_display}
            </TableCell>
            <TableCell style={{ textAlign: 'right', fontFamily: MONO, fontSize: 13, color: MUTED }}>
              {row.prior_display ?? '—'}
            </TableCell>
            <TableCell style={{ textAlign: 'right' }}>
              <ChangeCell pct={row.change_pct} direction={row.change_direction} />
            </TableCell>
            <TableCell>
              <DriverPill status={row.driver_status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({
  color,
  label,
  count,
  caption,
  action,
}: {
  color: string;
  label: string;
  count: number;
  caption: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: color,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1F2340' }}>
            {label} · {count}
          </span>
        </div>
        {action}
      </div>
      <p style={{ margin: '4px 0 0 16px', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{caption}</p>
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({
  title,
  value,
  sub,
  highlight,
}: {
  title: string;
  value: string | number;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: '18px 20px',
        borderColor: highlight ? AMBER_BORDER : undefined,
        background: highlight ? AMBER_BG : undefined,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: highlight ? AMBER : MUTED, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: highlight ? AMBER : '#1F2340', fontFamily: MONO, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: highlight ? AMBER : MUTED, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

// ─── Driver coverage bar ──────────────────────────────────────────────────────
function CoverageBar({ pct, found, missing }: { pct: number; found: number; missing: number }) {
  return (
    <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, minWidth: 140 }}>Driver coverage</span>
        <span style={{ fontSize: 14, fontWeight: 800, fontFamily: MONO, color: '#1F2340' }}>{pct}%</span>
      </div>
      <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: '#F1F2F6' }}>
        {pct > 0 && (
          <div style={{ width: `${pct}%`, background: GREEN, transition: 'width 0.4s ease' }} />
        )}
        {pct < 100 && (
          <div style={{ width: `${100 - pct}%`, background: '#FCD34D', transition: 'width 0.4s ease' }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, display: 'inline-block' }} />
          Reason found ({found})
        </span>
        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FCD34D', display: 'inline-block' }} />
          Reason missing ({missing})
        </span>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CoverageMapPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [data, setData] = useState<QuarterlyCoverageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [view, setView] = useState<'overview' | 'gaps-first'>('overview');

  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    quarterlyReports
      .getCoverage(companyId, reportId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load coverage.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reportId, retryKey]);

  const needsCount = data?.needs_reason.length ?? 0;
  const allCovered = data != null && needsCount === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Stepper */}
      {reportId && <QuarterlyReportStepper activeStep={4} reportId={reportId} />}

      <div style={{ flex: 1, padding: '24px 28px 100px', maxWidth: 1100 }}>
        {/* Page header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 24,
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1F2340', margin: 0, lineHeight: 1.2 }}>
              Coverage map
            </h1>
            {data && (
              <p style={{ margin: '6px 0 0', fontSize: 13, color: MUTED, maxWidth: 560 }}>
                What the AI found in your documents for <strong>{data.period_label}</strong>. Resolve
                missing reasons before generating.
              </p>
            )}
          </div>

          {/* Overview / Gaps-first toggle */}
          <div
            style={{
              display: 'flex',
              border: '1px solid #E5E7EF',
              borderRadius: 8,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {(['overview', 'gaps-first'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: view === v ? ACCENT : '#fff',
                  color: view === v ? '#fff' : '#4B5563',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {v === 'overview' ? 'Overview' : 'Gaps-first'}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && <LoadingState />}

        {/* Error state */}
        {!loading && error && (
          <div
            style={{
              padding: '16px 20px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
            <button
              className="bs"
              style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }}
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && data && data.summary.figures_extracted === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1F2340', margin: '0 0 8px' }}>
              No figures were extracted
            </h2>
            <p style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>
              No figures were extracted from these documents. This may indicate an upstream extraction
              problem.
            </p>
            <button className="bs" onClick={() => navigate('/reports')}>
              ← Back to Reports
            </button>
          </div>
        )}

        {/* Main content */}
        {!loading && !error && data && data.summary.figures_extracted > 0 && (
          <>
            {/* Summary cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 14,
                marginBottom: 20,
              }}
            >
              <SummaryCard
                title="Figures extracted"
                value={data.summary.figures_extracted}
                sub={`across ${data.summary.documents_count} document${data.summary.documents_count !== 1 ? 's' : ''}`}
              />
              <SummaryCard
                title="Reason linked"
                value={data.summary.reason_linked}
                sub={`${data.summary.driver_coverage_pct}% coverage`}
              />
              <SummaryCard
                title="Reason missing"
                value={data.summary.reason_missing}
                sub="need your input"
                highlight={data.summary.reason_missing > 0}
              />
              <SummaryCard
                title="Comparatives matched"
                value={`${data.summary.comparatives_matched}/${data.summary.comparatives_total}`}
                sub={`${data.summary.comparatives_missing_prior} missing prior-year`}
              />
            </div>

            {/* Driver coverage bar */}
            <CoverageBar
              pct={data.summary.driver_coverage_pct}
              found={data.summary.reason_linked}
              missing={data.summary.reason_missing}
            />

            {/* "Needs a reason" section */}
            <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: allCovered ? 'none' : '1px solid #F3F4F6',
                  background: allCovered ? GREEN_BG : AMBER_BG,
                }}
              >
                {allCovered ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>✓</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>
                      All material figures have a reason
                    </span>
                  </div>
                ) : (
                  <SectionHeader
                    color={AMBER}
                    label="Needs a reason"
                    count={needsCount}
                    caption="These figures changed materially but no driver was found in your documents. The AI will ask you about each."
                    action={
                      <button
                        className="bp"
                        style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }}
                        onClick={() => navigate(`/quarterly-report/${reportId}/gaps`)}
                      >
                        Answer gap questions →
                      </button>
                    }
                  />
                )}
              </div>

              {!allCovered && data.needs_reason.length > 0 && (
                <FigureTable
                  rows={data.needs_reason}
                  periodLabel={data.period_label}
                  priorLabel={data.prior_period_label}
                />
              )}
            </div>

            {/* "Reason found" section — hidden in gaps-first mode */}
            {view === 'overview' && data.reason_found.length > 0 && (
              <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
                  <SectionHeader
                    color={GREEN}
                    label="Reason found"
                    count={data.reason_found.length}
                    caption="Drivers the AI located directly in the source documents."
                  />
                </div>
                <FigureTable
                  rows={data.reason_found}
                  periodLabel={data.period_label}
                  priorLabel={data.prior_period_label}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer bar */}
      {data && data.summary.figures_extracted > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#fff',
            borderTop: '1px solid #E5E7EF',
            padding: '12px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            zIndex: 10,
          }}
        >
          <button className="bs" style={{ fontSize: 13 }} onClick={() => navigate('/reports')}>
            ← Back
          </button>

          {allCovered ? (
            <span style={{ fontSize: 13, color: GREEN, fontWeight: 600 }}>
              ✓ All figures have a reason — ready to generate
            </span>
          ) : (
            <span style={{ fontSize: 13, color: AMBER, fontWeight: 600 }}>
              ⚑ {needsCount} figure{needsCount !== 1 ? 's' : ''} need a reason before generating
            </span>
          )}

          {allCovered ? (
            <button
              className="bp"
              style={{ fontSize: 13 }}
              onClick={() => navigate(`/quarterly-report/${reportId}/preview`)}
            >
              Continue to preview →
            </button>
          ) : (
            <button
              className="bp"
              style={{ fontSize: 13 }}
              onClick={() => navigate(`/quarterly-report/${reportId}/gaps`)}
            >
              Answer {needsCount} gap question{needsCount !== 1 ? 's' : ''} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
