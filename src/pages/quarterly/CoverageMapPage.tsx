import { useState, useEffect, useMemo } from 'react';
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
const GREEN_PILL_BG = '#D1FAE5';
const MUTED = '#6B7280';
const MONO = "'DM Mono', 'Courier New', monospace";

// ─── SVG icons for summary cards ─────────────────────────────────────────────
function DocIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M5 2h7l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke={ACCENT} strokeWidth="1.4" />
      <path d="M12 2v5h4" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="7" y1="10" x2="13" y2="10" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="7" y1="13" x2="11" y2="13" stroke={ACCENT} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke={GREEN} strokeWidth="1.4" />
      <path d="M6.5 10.5L9 13l4.5-6" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5L17.5 16.5H2.5L10 2.5Z" stroke={AMBER} strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="10" y1="8" x2="10" y2="12" stroke={AMBER} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.8" fill={AMBER} />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="11" width="4" height="7" rx="1" fill={ACCENT} opacity="0.35" />
      <rect x="8" y="7" width="4" height="11" rx="1" fill={ACCENT} opacity="0.6" />
      <rect x="14" y="4" width="4" height="14" rx="1" fill={ACCENT} />
    </svg>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function Skel({ w, h }: { w: string | number; h?: number }) {
  return (
    <div
      className="skel"
      style={{ width: w, height: h ?? 16, borderRadius: 6, display: 'inline-block' }}
    />
  );
}

function LoadingState() {
  return (
    <div>
      {/* Cards skeleton */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ marginBottom: 12 }}><Skel w={32} h={32} /></div>
            <div style={{ marginBottom: 6 }}><Skel w="40%" h={26} /></div>
            <div style={{ marginBottom: 4 }}><Skel w="60%" h={12} /></div>
            <Skel w="70%" h={11} />
          </div>
        ))}
      </div>
      {/* Bar skeleton */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <Skel w={120} h={11} />
          <Skel w={28} h={11} />
        </div>
        <Skel w="100%" h={8} />
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <Skel w={100} h={11} />
          <Skel w={110} h={11} />
        </div>
      </div>
      {/* Table skeleton */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 8 }}>
          <Skel w={100} h={28} />
          <Skel w={120} h={28} />
          <Skel w={110} h={28} />
        </div>
        <div style={{ padding: '12px 18px' }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'center' }}>
              <Skel w={60} h={22} />
              <Skel w="22%" h={13} />
              <Skel w="10%" h={13} />
              <Skel w="10%" h={13} />
              <Skel w="8%" h={13} />
              <Skel w={110} h={24} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Code tag ─────────────────────────────────────────────────────────────────
function CodeTag({ code }: { code: string }) {
  const prefix = code.split(/[\s_-]/)[0] ?? '';
  const colorMap: Record<string, { bg: string; color: string }> = {
    IS: { bg: 'rgba(64,64,200,.08)', color: ACCENT },
    BS: { bg: 'rgba(16,185,129,.08)', color: '#059669' },
    CF: { bg: 'rgba(124,58,237,.08)', color: '#7C3AED' },
    PL: { bg: 'rgba(217,119,6,.08)', color: AMBER },
  };
  const c = colorMap[prefix] ?? { bg: '#F1F2F6', color: MUTED };
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 6,
        background: c.bg,
        color: c.color,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        display: 'inline-block',
      }}
    >
      {code}
    </span>
  );
}

// ─── Change cell ──────────────────────────────────────────────────────────────
function ChangeCell({ pct, direction }: { pct: number | null; direction: 'up' | 'down' | null }) {
  if (pct == null || direction == null) return <span style={{ color: MUTED }}>—</span>;
  const up = direction === 'up';
  return (
    <span style={{ color: up ? GREEN : '#EF4444', fontFamily: MONO, fontSize: 12, whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'} {(Math.abs(pct) > 0 ? (pct > 0 ? '+' : '') : '') + Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── Driver pill ──────────────────────────────────────────────────────────────
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
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: 'currentColor',
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {missing ? 'Reason missing' : 'Reason found'}
    </span>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({
  icon,
  title,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        borderColor: highlight ? AMBER_BORDER : undefined,
        background: highlight ? AMBER_BG : undefined,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 8,
          background: highlight ? 'rgba(217,119,6,.1)' : 'rgba(64,64,200,.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 12,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: highlight ? AMBER : '#1F2340',
          fontFamily: MONO,
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: highlight ? AMBER : '#374151', marginBottom: 2 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: highlight ? '#B45309' : MUTED }}>{sub}</div>
    </div>
  );
}

// ─── Driver coverage bar ──────────────────────────────────────────────────────
function CoverageBar({
  pct,
  found,
  missing,
}: {
  pct: number;
  found: number;
  missing: number;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: MUTED,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Driver coverage
        </span>
        <span style={{ fontSize: 13, fontWeight: 800, fontFamily: MONO, color: '#1F2340' }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          height: 8,
          borderRadius: 20,
          overflow: 'hidden',
          background: '#F1F2F6',
          marginBottom: 8,
        }}
      >
        {pct > 0 && <div style={{ width: `${pct}%`, background: GREEN, transition: 'width 0.4s ease' }} />}
        {pct < 100 && (
          <div style={{ width: `${100 - pct}%`, background: '#FCD34D', transition: 'width 0.4s ease' }} />
        )}
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: GREEN, display: 'inline-block', flexShrink: 0 }} />
          Reason found: {found}
        </span>
        <span style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#FCD34D', display: 'inline-block', flexShrink: 0 }} />
          Reason missing: {missing}
        </span>
      </div>
    </div>
  );
}

// ─── Filter bar (tabs + search) ───────────────────────────────────────────────
function FilterBar({
  active,
  setActive,
  totalCount,
  missingCount,
  foundCount,
  search,
  setSearch,
}: {
  active: 'all' | 'missing' | 'found';
  setActive: (v: 'all' | 'missing' | 'found') => void;
  totalCount: number;
  missingCount: number;
  foundCount: number;
  search: string;
  setSearch: (v: string) => void;
}) {
  const tabs: { key: 'all' | 'missing' | 'found'; label: string; count: number }[] = [
    { key: 'all', label: 'All figures', count: totalCount },
    { key: 'missing', label: 'Reason missing', count: missingCount },
    { key: 'found', label: 'Reason found', count: foundCount },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${isActive ? ACCENT : '#E5E7EF'}`,
                background: isActive ? ACCENT : '#fff',
                color: isActive ? '#fff' : '#4B5563',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              }}
            >
              {t.label}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  padding: '0 4px',
                  background: isActive ? 'rgba(255,255,255,.22)' : '#F1F2F6',
                  color: isActive ? '#fff' : MUTED,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: MONO,
                }}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 20 20"
          fill="none"
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
        >
          <circle cx="8.5" cy="8.5" r="5.5" stroke={MUTED} strokeWidth="1.5" />
          <path d="M13 13L17 17" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search metric"
          style={{
            padding: '6px 12px 6px 30px',
            borderRadius: 8,
            border: '1px solid #E5E7EF',
            fontSize: 12,
            color: '#1F2340',
            outline: 'none',
            width: 210,
            background: '#F8F9FC',
            fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  );
}

// ─── Figure table (shared by overview + split sections) ───────────────────────
function FigureTable({
  rows,
  periodLabel,
  priorLabel,
  maxHeight,
}: {
  rows: CoverageFigure[];
  periodLabel: string;
  priorLabel: string;
  maxHeight?: number | string;
}) {
  // Only show the prior-period column when at least one row actually has prior data.
  const showPrior = rows.some((r) => r.prior_display != null);
  return (
    <div style={{ overflowY: 'auto', maxHeight }}>
      <Table>
        <TableHeader style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <TableRow style={{ background: '#F8F9FC' }}>
            <TableHead style={{ fontSize: 11 }}>METRIC</TableHead>
            {showPrior && (
              <TableHead style={{ fontSize: 11, textAlign: 'right', width: 120 }}>{priorLabel}</TableHead>
            )}
            <TableHead style={{ fontSize: 11, textAlign: 'right', width: 120 }}>{periodLabel}</TableHead>
            {showPrior && (
              <TableHead style={{ fontSize: 11, textAlign: 'right', width: 100 }}>CHANGE</TableHead>
            )}
            <TableHead style={{ fontSize: 11, width: 140 }}>DRIVER</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.figure_id} style={{ verticalAlign: 'middle' }}>
              <TableCell style={{ paddingTop: 10, paddingBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1F2340' }}>{row.label}</div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 1, textTransform: 'capitalize' }}>
                  {row.statement.replace(/_/g, ' ')}
                </div>
              </TableCell>
              {showPrior && (
                <TableCell style={{ textAlign: 'right', fontFamily: MONO, fontSize: 13, color: MUTED, paddingTop: 10, paddingBottom: 10 }}>
                  {row.prior_display ?? '—'}
                </TableCell>
              )}
              <TableCell style={{ textAlign: 'right', fontFamily: MONO, fontSize: 13, paddingTop: 10, paddingBottom: 10 }}>
                {row.current_display}
              </TableCell>
              {showPrior && (
                <TableCell style={{ textAlign: 'right', paddingTop: 10, paddingBottom: 10 }}>
                  <ChangeCell pct={row.change_pct} direction={row.change_direction} />
                </TableCell>
              )}
              <TableCell style={{ paddingTop: 10, paddingBottom: 10 }}>
                <DriverPill status={row.driver_status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Section header (for split "Gaps first" view) ─────────────────────────────
function SectionHeader({
  tone,
  label,
  count,
  caption,
  action,
}: {
  tone: 'amber' | 'green';
  label: string;
  count: number;
  caption: string;
  action?: React.ReactNode;
}) {
  const isAmber = tone === 'amber';
  const color = isAmber ? AMBER : GREEN;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 18px',
        borderBottom: '1px solid #F3F4F6',
        background: isAmber ? AMBER_BG : '#F0FDF4',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isAmber ? 'rgba(217,119,6,.12)' : 'rgba(16,185,129,.12)',
          }}
        >
          {isAmber ? <WarnIcon /> : <CheckIcon />}
        </span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1F2340' }}>
            {label} <span style={{ color, fontFamily: MONO }}>· {count}</span>
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, maxWidth: 520, lineHeight: 1.5 }}>
            {caption}
          </div>
        </div>
      </div>
      {action}
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
  const [activeFilter, setActiveFilter] = useState<'all' | 'missing' | 'found'>('all');
  const [search, setSearch] = useState('');

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

  // When view changes, auto-select corresponding filter
  useEffect(() => {
    setActiveFilter(view === 'gaps-first' ? 'missing' : 'all');
  }, [view]);

  const allFigures = useMemo<CoverageFigure[]>(() => {
    if (!data) return [];
    return [...data.needs_reason, ...data.reason_found].sort((a, b) =>
      a.code.localeCompare(b.code)
    );
  }, [data]);

  const filteredFigures = useMemo<CoverageFigure[]>(() => {
    return allFigures.filter((f) => {
      if (activeFilter === 'missing' && f.driver_status !== 'missing') return false;
      if (activeFilter === 'found' && f.driver_status !== 'found') return false;
      const q = search.trim().toLowerCase();
      if (q) return f.label.toLowerCase().includes(q);
      return true;
    });
  }, [allFigures, activeFilter, search]);

  const needsCount = data?.needs_reason.length ?? 0;
  const allCovered = data != null && needsCount === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: '#fff', borderRadius: 12 }}>
      {reportId && <QuarterlyReportStepper activeStep={4} reportId={reportId} />}

      <div style={{ flex: 1, padding: '22px 28px 16px' }}>
        {/* Page header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 20,
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1F2340', margin: 0, lineHeight: 1.2 }}>
              Coverage map
            </h1>
            {data && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>
                What the AI found in your documents for <strong>{data.period_label}</strong>. Resolve
                the missing reasons before generating.
              </p>
            )}
          </div>

          {/* View toggle */}
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
                {v === 'overview' ? 'Overview' : 'Gaps first'}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && <LoadingState />}

        {/* Error */}
        {!loading && error && (
          <div
            style={{
              padding: '14px 18px',
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
              No figures were extracted from these documents.
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
                marginBottom: 18,
              }}
            >
              <SummaryCard
                icon={<DocIcon />}
                title="Figures extracted"
                value={data.summary.figures_extracted}
                sub={`Across ${data.summary.documents_count} document${data.summary.documents_count !== 1 ? 's' : ''}`}
              />
              <SummaryCard
                icon={<CheckIcon />}
                title="Reasons linked"
                value={data.summary.reason_linked}
                sub={`${data.summary.driver_coverage_pct}% coverage`}
              />
              <SummaryCard
                icon={<WarnIcon />}
                title="Reason missing"
                value={data.summary.reason_missing}
                sub="Needs input"
                highlight={data.summary.reason_missing > 0}
              />
              <SummaryCard
                icon={<ChartIcon />}
                title="Comparatives matched"
                value={`${data.summary.comparatives_matched}/${data.summary.comparatives_total}`}
                sub={`${data.summary.comparatives_missing_prior} missing prior year`}
              />
            </div>

            {/* Driver coverage bar */}
            <CoverageBar
              pct={data.summary.driver_coverage_pct}
              found={data.summary.reason_linked}
              missing={data.summary.reason_missing}
            />

            {view === 'overview' ? (
              /* ── OVERVIEW: unified filterable table ── */
              <div className="card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', borderBottom: '1px solid #F3F4F6' }}>
                  <FilterBar
                    active={activeFilter}
                    setActive={setActiveFilter}
                    totalCount={allFigures.length}
                    missingCount={data.needs_reason.length}
                    foundCount={data.reason_found.length}
                    search={search}
                    setSearch={setSearch}
                  />
                </div>

                {filteredFigures.length === 0 ? (
                  <div style={{ padding: '36px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
                    No figures match your search.
                  </div>
                ) : (
                  <FigureTable
                    rows={filteredFigures}
                    periodLabel={data.period_label}
                    priorLabel={data.prior_period_label}
                    maxHeight="calc(100vh - 420px)"
                  />
                )}
              </div>
            ) : (
              /* ── GAPS FIRST: split sections (Needs a reason / Reason found) ── */
              <>
                {/* Needs a reason */}
                {data.needs_reason.length > 0 && (
                  <div className="card" style={{ overflow: 'hidden', marginBottom: 16 }}>
                    <SectionHeader
                      tone="amber"
                      label="Needs a reason"
                      count={data.needs_reason.length}
                      caption="These figures moved materially but no driver was found in your documents. Answer each so the report can explain the change."
                      action={
                        <button
                          className="bp"
                          style={{ fontSize: 12, padding: '7px 14px', flexShrink: 0 }}
                          onClick={() => navigate(`/quarterly-report/${reportId}/gaps`)}
                        >
                          Answer gap questions →
                        </button>
                      }
                    />
                    <FigureTable
                      rows={data.needs_reason}
                      periodLabel={data.period_label}
                      priorLabel={data.prior_period_label}
                      maxHeight="calc(50vh - 120px)"
                    />
                  </div>
                )}

                {/* Reason found */}
                {data.reason_found.length > 0 && (
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <SectionHeader
                      tone="green"
                      label="Reason found"
                      count={data.reason_found.length}
                      caption="Drivers the AI located directly in the source documents — no action needed."
                    />
                    <FigureTable
                      rows={data.reason_found}
                      periodLabel={data.period_label}
                      priorLabel={data.prior_period_label}
                      maxHeight="calc(50vh - 120px)"
                    />
                  </div>
                )}

                {data.needs_reason.length === 0 && (
                  <div className="card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(16,185,129,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <CheckIcon />
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: GREEN }}>
                      All material figures already have a reason.
                    </span>
                  </div>
                )}
              </>
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
            padding: '10px 200px 10px 28px',
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
            <span style={{ fontSize: 13, color: GREEN, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke={GREEN} strokeWidth="1.5" />
                <path d="M6.5 10.5L9 13l4.5-6" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              All figures have a reason — ready to generate
            </span>
          ) : (
            <span style={{ fontSize: 13, color: AMBER, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M4 2.5v15" stroke={AMBER} strokeWidth="1.6" strokeLinecap="round" />
                <path d="M4 2.5l12 5-12 5" stroke={AMBER} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {needsCount} figure{needsCount !== 1 ? 's' : ''} need a reason before generating
            </span>
          )}

          {allCovered ? (
            <button
              className="bp"
              style={{ fontSize: 14, padding: '10px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => navigate(`/quarterly-report/${reportId}/preview`)}
            >
              Continue to preview
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              className="bp"
              style={{ fontSize: 14, padding: '10px 24px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => navigate(`/quarterly-report/${reportId}/gaps`)}
            >
              Answer {needsCount} gap question{needsCount !== 1 ? 's' : ''}
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
