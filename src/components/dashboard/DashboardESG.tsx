import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { useNavigate } from 'react-router-dom';
import { lookups, reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type {
  CoverageCriticalGap,
  CoverageIndicator,
  CoveragePillar,
  CoveragePillarSummary,
  CoverageResponse,
} from '@/types/report';
import type { ScopesResponse } from '@/types/lookups';

// "FY-2025" → "FY 2025" for display. Lifted from ReportsPage's formatter.
function formatPeriod(period: string): string {
  return period.replace(/-/g, ' ').trim();
}

// Numbers like 24180 → "24,180" so the dashboard reads cleanly. Falls back
// to the raw value for non-finite inputs (NaN / Infinity / null-ish).
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Format an indicator's value for the at-a-glance row in the pillar card.
// We intentionally keep this terse — long narrative `text_value`s collapse
// to "Disclosed" so a 200-character paragraph doesn't break the layout.
function formatIndicatorValue(ind: CoverageIndicator): string {
  if (ind.status === 'NOT_DISCLOSED') return 'Missing';
  if (ind.value != null) {
    const num = formatNumber(ind.value);
    return ind.unit ? `${num} ${ind.unit}` : num;
  }
  if (ind.bool_value != null) return ind.bool_value ? 'Yes' : 'No';
  if (ind.text_value) {
    return ind.text_value.length <= 22 ? ind.text_value : 'Disclosed';
  }
  return 'Disclosed';
}

// Sort indicators so the dashboard surfaces FOUND rows first (those have real
// values worth showing), then PARTIAL, then NOT_DISCLOSED. Ties broken by
// source_code so the order is stable across renders.
const STATUS_ORDER: Record<string, number> = {
  FOUND: 0,
  PARTIAL: 1,
  NOT_DISCLOSED: 2,
};
function rankIndicator(a: CoverageIndicator, b: CoverageIndicator): number {
  const sa = STATUS_ORDER[a.status] ?? 3;
  const sb = STATUS_ORDER[b.status] ?? 3;
  if (sa !== sb) return sa - sb;
  return (a.source_code ?? '').localeCompare(b.source_code ?? '');
}

// Pre-tuned styling per pillar so the three cards visually echo the screenshot
// without leaning on a tag-style colour switch at the call site.
const PILLAR_STYLE: Record<
  'E' | 'S' | 'G',
  {
    label: string;
    emoji: string;
    gradient: string;
    codeColor: string;
  }
> = {
  E: {
    label: 'Environmental',
    emoji: '🌿',
    gradient: 'linear-gradient(135deg,#14532D,#16A34A)',
    codeColor: '#16A34A',
  },
  S: {
    label: 'Social',
    emoji: '👥',
    gradient: 'linear-gradient(135deg,#0C4A6E,#0891B2)',
    codeColor: '#0891B2',
  },
  G: {
    label: 'Governance',
    emoji: '🏛',
    gradient: 'linear-gradient(135deg,#4C1D95,#7C3AED)',
    codeColor: '#7C3AED',
  },
};

interface ReportListItem {
  id: string;
  period: string;
  report_type?: string | null;
  generated_at?: string | null;
  title?: string | null;
  // Inline coverage block returned by GET /api/v1/reports/{company_id}.
  // Saves us from fetching /coverage for every report just to chart it.
  coverage?: {
    percentage?: number | null;
    metrics_total?: number | null;
    metrics_disclosed?: number | null;
  } | null;
}

// Year extracted from "FY-2025" — used to pick the most recent report when
// the period strings are otherwise sortable as ASCII (which they are, but
// better safe than sorry on hand-edited data).
function yearFromPeriod(period: string): number {
  const m = period.match(/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

function pillarScore(p?: CoveragePillarSummary): number {
  if (!p || p.total === 0) return 0;
  return Math.round((p.found / p.total) * 100);
}

export function DashboardESG() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [latestReport, setLatestReport] = useState<ReportListItem | null>(null);
  // Full list kept around so the "Coverage by Report" chart can plot every
  // report's percentage in one go without re-fetching.
  const [allReports, setAllReports] = useState<ReportListItem[]>([]);
  // Framework / regulator catalogue powering the Framework Compliance card.
  // Fetched once in parallel with the reports list — independent of which
  // report is "latest", so we don't re-fetch when the latest changes.
  const [scopes, setScopes] = useState<ScopesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(!!companyId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCoverage(null);
    setLatestReport(null);
    setAllReports([]);
    // Scopes is independent of any company state — fetch in the background
    // and surface failures silently (the framework card just falls back to a
    // placeholder if it never resolves).
    lookups
      .scopes<ScopesResponse>()
      .then((res) => {
        if (!cancelled) setScopes(res);
      })
      .catch(() => {
        if (!cancelled) setScopes(null);
      });
    (async () => {
      try {
        const list = await reportsApi.list<{ reports: ReportListItem[] }>(
          companyId,
        );
        const reports = (list?.reports ?? []).filter(
          (r) => r && r.period && r.report_type === 'esg',
        );
        if (!cancelled) setAllReports(reports);
        if (reports.length === 0) {
          if (!cancelled) {
            setLatestReport(null);
            setCoverage(null);
            setLoading(false);
          }
          return;
        }
        // Most recently *created* report wins — that's what the dashboard
        // refers to as "latest". Fall back to year only when generated_at
        // is missing (older rows pre-dating the timestamp column).
        reports.sort((a, b) => {
          const ad = a.generated_at ?? '';
          const bd = b.generated_at ?? '';
          if (ad && bd) return bd.localeCompare(ad);
          if (bd) return 1;
          if (ad) return -1;
          return yearFromPeriod(b.period) - yearFromPeriod(a.period);
        });
        const target = reports[0];
        const cov = await reportsApi.getCoverage<CoverageResponse>(
          companyId,
          target.id,
        );
        if (cancelled) return;
        setLatestReport(target);
        setCoverage(cov);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load latest report.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Derive everything the hero + pillar cards need in one place so the JSX
  // stays focused on layout. Recomputes only when the coverage payload swaps.
  const view = useMemo(() => {
    if (!coverage) return null;
    const summary = coverage.summary;
    const overallScore = Math.round((summary.disclosure_rate ?? 0) * 100);
    const byPillar = summary.by_pillar ?? {};
    const envSummary = byPillar.E;
    const socSummary = byPillar.S;
    const govSummary = byPillar.G;
    const criticalMissing =
      summary.sector_materiality?.critical_missing ??
      coverage.critical_gaps?.length ??
      0;

    // Bucket indicators per pillar — rank so the card shows the most useful
    // rows first (FOUND, then PARTIAL, then NOT_DISCLOSED).
    const indicators = coverage.indicators ?? [];
    const byPillarIndicators: Record<
      'E' | 'S' | 'G',
      CoverageIndicator[]
    > = { E: [], S: [], G: [] };
    for (const ind of indicators) {
      const p = ind.pillar as CoveragePillar;
      if (p === 'E' || p === 'S' || p === 'G') {
        byPillarIndicators[p].push(ind);
      }
    }
    (['E', 'S', 'G'] as const).forEach((p) => {
      byPillarIndicators[p].sort(rankIndicator);
    });

    return {
      overallScore,
      envScore: pillarScore(envSummary),
      socScore: pillarScore(socSummary),
      govScore: pillarScore(govSummary),
      summary,
      envSummary,
      socSummary,
      govSummary,
      criticalMissing,
      byPillarIndicators,
    };
  }, [coverage]);

  // ----- Render branches ----------------------------------------------------

  if (loading) {
    return <DashboardESGSkeleton />;
  }

  if (!companyId) {
    return (
      <EmptyHero
        title="No company linked"
        body="Your account isn't associated with a company yet — please contact your admin."
      />
    );
  }

  if (error) {
    return <EmptyHero title="Couldn't load latest report" body={error} tone="error" />;
  }

  if (!coverage || !latestReport || !view) {
    return (
      <EmptyHero
        title="No reports yet"
        body="Once you generate your first ESG report from the Reports page, its breakdown will appear here."
      />
    );
  }

  const companyDisplay =
    coverage.company_name ?? user?.company_name ?? 'Your company';
  const period = formatPeriod(coverage.period);
  const frameworksLine = (coverage.frameworks ?? []).join(' · ');

  return (
    <div>
      {/* Hero */}
      <div
        style={{
          background: '#3535B5',
          borderRadius: 20,
          padding: '24px 28px',
          marginBottom: 16,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: 24,
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: 80,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background:
              'radial-gradient(circle,rgba(100,116,255,.2),transparent 65%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: 60,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background:
              'radial-gradient(circle,rgba(34,197,94,.08),transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        {/* Score ring */}
        <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
          <ScoreRing score={view.overallScore} />
        </div>

        {/* Hero text */}
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 9 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 11px',
                borderRadius: 20,
                background: 'rgba(34,197,94,.15)',
                border: '1px solid rgba(34,197,94,.25)',
                fontSize: 9,
                fontWeight: 700,
                color: '#86EFAC',
                textTransform: 'uppercase',
                letterSpacing: '.5px',
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#86EFAC',
                  animation: 'dpulse 2.5s infinite',
                }}
              />
              Latest report
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 11px',
                borderRadius: 20,
                background: 'rgba(255,255,255,.18)',
                border: '1px solid rgba(255,255,255,.2)',
                fontSize: 10,
                fontWeight: 800,
                color: '#fff',
                fontFamily: "'DM Mono',monospace",
                letterSpacing: '.5px',
              }}
            >
              {period}
            </div>
            {frameworksLine && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px 11px',
                  borderRadius: 20,
                  background: 'rgba(129,140,248,.18)',
                  border: '1px solid rgba(129,140,248,.3)',
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#C7D2FE',
                  textTransform: 'uppercase',
                  letterSpacing: '.5px',
                }}
              >
                {frameworksLine}
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: '#fff',
              marginBottom: 5,
              letterSpacing: '-.2px',
            }}
          >
            {companyDisplay} — {period} {latestReport.title ?? 'ESG Report'}
          </div>
          <div
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,.45)',
              lineHeight: 1.7,
              marginBottom: 8,
            }}
          >
            {view.summary.found_count} of {view.summary.total_indicators} metrics disclosed
            {view.criticalMissing > 0 ? ` · ${view.criticalMissing} critical gaps identified` : ''}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              {
                label: 'ENV',
                score: view.envScore,
                bg: 'rgba(34,197,94,.15)',
                border: 'rgba(34,197,94,.2)',
                dot: '#4ADE80',
                labelColor: '#86EFAC',
              },
              {
                label: 'SOC',
                score: view.socScore,
                bg: 'rgba(20,184,166,.15)',
                border: 'rgba(20,184,166,.2)',
                dot: '#5EEAD4',
                labelColor: '#99F6E4',
              },
              {
                label: 'GOV',
                score: view.govScore,
                bg: 'rgba(139,92,246,.15)',
                border: 'rgba(139,92,246,.2)',
                dot: '#C4B5FD',
                labelColor: '#DDD6FE',
              },
            ].map((p) => (
              <div
                key={p.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: p.bg,
                  border: `1px solid ${p.border}`,
                  borderRadius: 8,
                  padding: '5px 10px',
                }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: p.dot,
                  }}
                />
                <span style={{ fontSize: 11, fontWeight: 700, color: p.labelColor }}>
                  {p.label}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: '#fff',
                    fontFamily: "'DM Mono',monospace",
                  }}
                >
                  {p.score}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Pillar Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
          gap: 14,
          marginBottom: 16,
        }}
      >
        {(['E', 'S', 'G'] as const).map((p) => {
          const style = PILLAR_STYLE[p];
          const pillarSummary =
            p === 'E'
              ? view.envSummary
              : p === 'S'
                ? view.socSummary
                : view.govSummary;
          const score =
            p === 'E' ? view.envScore : p === 'S' ? view.socScore : view.govScore;
          const found = pillarSummary?.found ?? 0;
          const missing = pillarSummary?.not_disclosed ?? 0;
          const total = pillarSummary?.total ?? 0;
          const coveragePct = total > 0 ? Math.round((found / total) * 100) : 0;
          const metrics = view.byPillarIndicators[p].slice(0, 6);
          return (
            <div key={p} className="card" style={{ overflow: 'hidden' }}>
              <div
                style={{
                  background: style.gradient,
                  padding: '16px 18px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -20,
                    right: -20,
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,.08)',
                  }}
                />
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'rgba(255,255,255,.55)',
                    textTransform: 'uppercase',
                    letterSpacing: '.5px',
                    marginBottom: 6,
                  }}
                >
                  {style.emoji} {style.label}
                </div>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 800,
                    color: '#fff',
                    fontFamily: "'DM Mono',monospace",
                    lineHeight: 1,
                    marginBottom: 8,
                  }}
                >
                  {score}
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,.15)',
                      borderRadius: 7,
                      padding: 6,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#fff',
                        fontFamily: "'DM Mono',monospace",
                        lineHeight: 1,
                      }}
                    >
                      {found}
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        color: 'rgba(255,255,255,.55)',
                        textTransform: 'uppercase',
                        marginTop: 2,
                      }}
                    >
                      Found
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,.1)',
                      borderRadius: 7,
                      padding: 6,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#FCA5A5',
                        fontFamily: "'DM Mono',monospace",
                        lineHeight: 1,
                      }}
                    >
                      {missing}
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        color: 'rgba(255,255,255,.55)',
                        textTransform: 'uppercase',
                        marginTop: 2,
                      }}
                    >
                      Missing
                    </div>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(255,255,255,.1)',
                      borderRadius: 7,
                      padding: 6,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: '#fff',
                        fontFamily: "'DM Mono',monospace",
                        lineHeight: 1,
                      }}
                    >
                      {coveragePct}%
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        color: 'rgba(255,255,255,.55)',
                        textTransform: 'uppercase',
                        marginTop: 2,
                      }}
                    >
                      Coverage
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ padding: '13px 16px' }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#9BA3C4',
                    textTransform: 'uppercase',
                    letterSpacing: '.5px',
                    marginBottom: 9,
                  }}
                >
                  Key Metrics
                </div>
                {metrics.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9BA3C4',
                      fontStyle: 'italic',
                      padding: '8px 0',
                    }}
                  >
                    No indicators in this pillar yet.
                  </div>
                ) : (
                  metrics.map((m, i) => {
                    const ok = m.status === 'FOUND' || m.status === 'PARTIAL';
                    const code = `${m.framework} ${m.source_code}`;
                    const value = formatIndicatorValue(m);
                    return (
                      <div
                        key={m.framework_indicator_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 0',
                          borderBottom:
                            i < metrics.length - 1 ? '1px solid #ECEEF8' : 'none',
                          ...(ok
                            ? {}
                            : {
                                background: 'rgba(239,68,68,.04)',
                                margin: '0 -16px',
                                padding: '7px 16px',
                              }),
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 700,
                            fontFamily: "'DM Mono',monospace",
                            color: ok ? style.codeColor : '#EF4444',
                            width: 64,
                            flexShrink: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={code}
                        >
                          {code}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: '#1A1D2E',
                            flex: 1,
                            margin: '0 6px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={m.indicator_label}
                        >
                          {m.indicator_label}
                        </span>
                        {ok ? (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              fontFamily: "'DM Mono',monospace",
                              maxWidth: 110,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={value}
                          >
                            {value}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 10,
                              color: '#9BA3C4',
                              fontStyle: 'italic',
                            }}
                          >
                            Missing
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: 9,
                            background: ok
                              ? 'rgba(34,197,94,.1)'
                              : 'rgba(239,68,68,.1)',
                            color: ok ? '#16A34A' : '#DC2626',
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontWeight: 700,
                            marginLeft: 6,
                          }}
                        >
                          {ok ? '✓' : '!'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Framework Compliance + Gaps + Score Trend — still placeholder data
          until the backend exposes a comparable feed. Kept here so the layout
          below the latest-report cards stays intact. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
          gap: 14,
          marginBottom: 16,
        }}
      >
        <FrameworkCatalogue scopes={scopes} />
        <SectorCriticalGaps coverage={coverage} reportId={latestReport.id} />
        <CoverageByReportChart reports={allReports} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ScoreRing({ score }: { score: number }) {
  const safeScore = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 37;
  const offset = circumference * (1 - safeScore / 100);
  return (
    <>
      <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="45" cy="45" r="37" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="6" />
        <circle
          cx="45"
          cy="45"
          r="37"
          fill="none"
          stroke="#818CF8"
          strokeWidth="6"
          strokeDasharray={circumference.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%,-50%)',
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: '#fff',
            fontFamily: "'DM Mono',monospace",
            display: 'block',
          }}
        >
          {safeScore}
        </span>
        <span
          style={{
            fontSize: 8,
            color: 'rgba(255,255,255,.4)',
            textTransform: 'uppercase',
            letterSpacing: '.4px',
          }}
        >
          /100
        </span>
      </div>
    </>
  );
}

function DashboardESGSkeleton() {
  return <Spinner pad={80} />;
}

function EmptyHero({
  title,
  body,
  tone,
}: {
  title: string;
  body: string;
  tone?: 'error';
}) {
  return (
    <div
      style={{
        background: tone === 'error' ? '#7F1D1D' : '#3535B5',
        borderRadius: 20,
        padding: '32px 28px',
        marginBottom: 16,
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', maxWidth: 520, margin: '0 auto' }}>
        {body}
      </div>
    </div>
  );
}

// Framework Catalogue — straight render of /lookups/scopes. Universal
// standards (GRI / IFRS-S1 / IFRS-S2) plus every regional regulator with
// at least one active indicator. Bar length is proportional to the
// largest indicator_count in the list so the eye can compare scope sizes
// without any cross-referencing against the latest report.
interface FrameworkCatalogueProps {
  scopes: ScopesResponse | null;
}

interface FrameworkRow {
  key: string;
  label: string;
  indicatorCount: number;
  kind: 'universal' | 'regional';
}

function FrameworkCatalogue({ scopes }: FrameworkCatalogueProps) {
  // Loading skeleton — held until /lookups/scopes resolves.
  if (!scopes) {
    return (
      <div className="card">
        <div className="ch">
          <div className="ct">Framework Catalogue</div>
        </div>
        <Spinner pad={40} />
      </div>
    );
  }

  const rows: FrameworkRow[] = [
    ...(scopes.universal ?? []).map((u) => ({
      key: `u-${u.code}`,
      label: u.label,
      indicatorCount: u.indicator_count,
      kind: 'universal' as const,
    })),
    ...(scopes.regional ?? []).map((r) => ({
      key: `r-${r.regulator_id}`,
      label: `${r.code} — ${r.label}`,
      indicatorCount: r.indicator_count,
      kind: 'regional' as const,
    })),
  ];

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="ch">
          <div className="ct">Framework Catalogue</div>
        </div>
        <div
          style={{
            padding: '24px 18px',
            textAlign: 'center',
            fontSize: 11,
            color: '#9BA3C4',
          }}
        >
          No frameworks available in the catalogue.
        </div>
      </div>
    );
  }

  // Bar length is proportional to the row with the most indicators so that
  // GRI's 128 reads as a full bar and smaller regulators (e.g. CBUAE = 6)
  // read as proportionally short.
  const maxIndicatorCount = Math.max(1, ...rows.map((r) => r.indicatorCount));

  // Universal standards get the brand purple; regional regulators get a
  // distinguishing teal so the eye can separate the two groups even when
  // they're interleaved.
  const colourFor = (kind: FrameworkRow['kind']) =>
    kind === 'universal'
      ? { bar: '#4040C8', text: '#3535B5' }
      : { bar: '#0891B2', text: '#0E7490' };

  return (
    <div className="card">
      <div className="ch">
        <div>
          <div className="ct">Framework Catalogue</div>
          <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
            {scopes.totals.universal_options} universal ·{' '}
            {scopes.totals.regional_options} regional
          </div>
        </div>
      </div>
      <div style={{ padding: '6px 16px 10px', maxHeight: 280, overflowY: 'auto' }}>
        {rows.map((row, i) => {
          const colour = colourFor(row.kind);
          const fillPct = Math.round(
            (row.indicatorCount / maxIndicatorCount) * 100,
          );
          return (
            <div
              key={row.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 0',
                borderBottom:
                  i < rows.length - 1 ? '1px solid #ECEEF8' : 'none',
              }}
              title={`${row.indicatorCount} indicators`}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: colour.bar,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: '#5A6080',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}
              >
                {row.label}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 5,
                  background: '#E8EAF5',
                  borderRadius: 3,
                  overflow: 'hidden',
                  maxWidth: 110,
                }}
              >
                <div
                  style={{
                    width: `${Math.max(2, fillPct)}%`,
                    height: '100%',
                    background: colour.bar,
                    borderRadius: 3,
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  fontFamily: "'DM Mono',monospace",
                  color: colour.text,
                  width: 38,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {row.indicatorCount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sector-flagged missing metrics for the latest report. The backend surfaces
// these via `coverage.critical_gaps` — already filtered to indicators where
// sector_threshold is set AND status is NOT_DISCLOSED. We just sort
// (critical first, then high), trim to the top N, and render.
interface SectorCriticalGapsProps {
  coverage: CoverageResponse;
  reportId: string;
}

const TIER_RANK: Record<string, number> = { critical: 0, high: 1 };

const PILLAR_LABEL: Record<string, string> = {
  E: 'Environmental',
  S: 'Social',
  G: 'Governance',
  ESG: 'Cross-cutting',
};

function SectorCriticalGaps({ coverage, reportId }: SectorCriticalGapsProps) {
  const navigate = useNavigate();

  // Prefer the dedicated `critical_gaps` array. If the backend didn't include
  // it (older deployment), fall back to scanning indicators ourselves so the
  // card still renders sensibly.
  const gaps: CoverageCriticalGap[] = useMemo(() => {
    if (coverage.critical_gaps && coverage.critical_gaps.length > 0) {
      return coverage.critical_gaps;
    }
    return (coverage.indicators ?? [])
      .filter(
        (i) =>
          i.status === 'NOT_DISCLOSED' &&
          (i.sector_threshold === 'critical' || i.sector_threshold === 'high'),
      )
      .map((i) => ({
        framework_indicator_id: i.framework_indicator_id,
        source_code: i.source_code,
        indicator_label: i.indicator_label,
        pillar: i.pillar,
        sector_threshold: i.sector_threshold ?? null,
        is_mandatory: !!i.is_mandatory,
        status: i.status,
      }));
  }, [coverage]);

  const sortedGaps = useMemo(() => {
    const copy = [...gaps];
    copy.sort((a, b) => {
      const ra = TIER_RANK[a.sector_threshold ?? ''] ?? 9;
      const rb = TIER_RANK[b.sector_threshold ?? ''] ?? 9;
      if (ra !== rb) return ra - rb;
      // Mandatory before optional within the same tier.
      if (a.is_mandatory !== b.is_mandatory) return a.is_mandatory ? -1 : 1;
      return (a.source_code ?? '').localeCompare(b.source_code ?? '');
    });
    return copy;
  }, [gaps]);

  const criticalCount = sortedGaps.filter(
    (g) => g.sector_threshold === 'critical',
  ).length;
  const highCount = sortedGaps.filter(
    (g) => g.sector_threshold === 'high',
  ).length;

  const sectorName = coverage.sector?.name ?? null;
  // Sector materiality only makes sense when the report was generated with
  // a sector picked. Without one, neither the backend's `critical_gaps` array
  // nor `sector_threshold` flags will be set — and an empty list there means
  // "we don't know", not "all covered".
  const hasSector = !!sectorName;
  // Render every gap and let the body scroll (matches the Framework Catalogue
  // card height) rather than truncating to a handful with a "+N more" link.
  const visible = sortedGaps;
  const overflow = sortedGaps.length - visible.length;

  return (
    <div className="card">
      <div className="ch">
        <div>
          <div className="ct">Critical Gaps — Sector Materiality</div>
          {hasSector ? (
            <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
              Flagged for {sectorName}
            </div>
          ) : (
            <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
              No sector picked when this report was generated
            </div>
          )}
        </div>
        {!hasSector ? (
          <span
            style={{
              background: '#F2F3FA',
              color: '#5A6080',
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 20,
              whiteSpace: 'nowrap',
            }}
          >
            No sector
          </span>
        ) : sortedGaps.length > 0 ? (
          <span
            style={{
              background: 'rgba(239,68,68,.1)',
              color: '#DC2626',
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 20,
              whiteSpace: 'nowrap',
            }}
            title={`${criticalCount} critical · ${highCount} high`}
          >
            {sortedGaps.length} {sortedGaps.length === 1 ? 'gap' : 'gaps'}
          </span>
        ) : (
          <span
            style={{
              background: 'rgba(34,197,94,.1)',
              color: '#16A34A',
              fontSize: 10,
              fontWeight: 700,
              padding: '3px 9px',
              borderRadius: 20,
            }}
          >
            All covered
          </span>
        )}
      </div>
      <div
        style={{
          padding: '10px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxHeight: 280,
          overflowY: 'auto',
        }}
      >
        {!hasSector ? (
          <div
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              fontSize: 11,
              color: '#5A6080',
              lineHeight: 1.55,
            }}
          >
            Pick a sector when generating a report to see which indicators
            are <strong style={{ color: '#1A1D2E' }}>critical</strong> or{' '}
            <strong style={{ color: '#1A1D2E' }}>high-priority</strong> for
            your industry.
            <div style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={() => navigate('/reports')}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#4040C8',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Generate a new report →
              </button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div
            style={{
              padding: '20px 8px',
              textAlign: 'center',
              fontSize: 11,
              color: '#9BA3C4',
            }}
          >
            No sector-critical indicators are missing on this report.
          </div>
        ) : (
          visible.map((gap) => {
            const isCritical = gap.sector_threshold === 'critical';
            const accent = isCritical ? '#EF4444' : '#F59E0B';
            const accentBgSoft = isCritical
              ? 'rgba(239,68,68,.05)'
              : 'rgba(245,158,11,.05)';
            const pillBg = isCritical
              ? 'rgba(239,68,68,.12)'
              : 'rgba(245,158,11,.12)';
            const pillColor = isCritical ? '#DC2626' : '#B45309';
            const pillarText = PILLAR_LABEL[gap.pillar] ?? gap.pillar;
            const codeLine = [
              gap.source_code,
              pillarText,
              gap.is_mandatory ? 'Mandatory' : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <div
                key={gap.framework_indicator_id}
                style={{
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: '0 8px 8px 0',
                  padding: '10px 12px',
                  background: accentBgSoft,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 3,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#1A1D2E',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                    title={gap.indicator_label}
                  >
                    {gap.indicator_label}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '.4px',
                      background: pillBg,
                      color: pillColor,
                      padding: '2px 7px',
                      borderRadius: 5,
                      flexShrink: 0,
                    }}
                  >
                    {isCritical ? 'Critical' : 'High'}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: '#5A6080',
                    lineHeight: 1.5,
                    fontFamily: "'DM Mono',monospace",
                  }}
                >
                  {codeLine}
                </div>
                <button
                  type="button"
                  className="btn bs bsm"
                  style={{ marginTop: 7, fontSize: 10 }}
                  onClick={() => navigate(`/reports/${reportId}`)}
                >
                  Open in report →
                </button>
              </div>
            );
          })
        )}
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => navigate(`/reports/${reportId}`)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#4040C8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 0 0',
              textAlign: 'center',
            }}
          >
            + {overflow} more in the full report →
          </button>
        )}
      </div>
    </div>
  );
}

// Vertical-bar chart of every report's coverage %. Sorted by period ascending
// so the eye reads left-to-right as time progresses, with a dashed line at the
// average across all reports. Bars are colour-tiered (red/amber/green) to make
// low-coverage reports stand out without needing a tooltip.
interface CoverageByReportChartProps {
  reports: ReportListItem[];
}

function CoverageByReportChart({ reports }: CoverageByReportChartProps) {
  // Filter to reports that actually carry a coverage block — fresh / in-flight
  // reports don't have one yet and shouldn't render as 0% bars.
  const points = reports
    .map((r) => ({
      id: r.id,
      period: r.period,
      year: yearFromPeriod(r.period),
      pct:
        r.coverage?.percentage != null && Number.isFinite(r.coverage.percentage)
          ? Math.max(0, Math.min(100, Math.round(r.coverage.percentage)))
          : null,
    }))
    .filter((p): p is { id: string; period: string; year: number; pct: number } =>
      p.pct != null,
    )
    .sort((a, b) => {
      // Chronological — ties by period string fall back to lexicographic.
      if (a.year !== b.year) return a.year - b.year;
      return a.period.localeCompare(b.period);
    });

  if (points.length === 0) {
    return (
      <div className="card">
        <div className="ch">
          <div className="ct">Coverage by Report</div>
        </div>
        <div
          style={{
            padding: '24px 18px',
            textAlign: 'center',
            fontSize: 11,
            color: '#9BA3C4',
          }}
        >
          No reports with coverage scored yet.
        </div>
      </div>
    );
  }

  const avg = Math.round(
    points.reduce((sum, p) => sum + p.pct, 0) / points.length,
  );

  // SVG geometry — fixed viewBox stretches to the card width via `width="100%"`.
  const VB_W = 320;
  const VB_H = 130;
  const PAD_TOP = 18; // headroom for the value labels
  const PAD_BOT = 22; // room for the period axis labels
  const PLOT_H = VB_H - PAD_TOP - PAD_BOT;
  // Bar width / spacing — equal slots, 70% bar, 30% gap.
  const slotW = VB_W / points.length;
  const barW = Math.max(8, Math.min(36, slotW * 0.7));

  // Reuse this everywhere — keeps the dashed avg line and the bars in sync.
  const yFor = (pct: number) => PAD_TOP + PLOT_H * (1 - pct / 100);

  // Tier colour by coverage %. Single source of truth so the value label and
  // the bar fill always agree.
  const tier = (pct: number) =>
    pct >= 75 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#EF4444';
  const tierBg = (pct: number) =>
    pct >= 75
      ? 'rgba(34,197,94,.15)'
      : pct >= 50
        ? 'rgba(245,158,11,.15)'
        : 'rgba(239,68,68,.15)';

  return (
    <div className="card">
      <div className="ch">
        <div className="ct">Coverage by Report</div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: tier(avg),
            background: tierBg(avg),
            padding: '3px 9px',
            borderRadius: 20,
          }}
          title={`Average across ${points.length} report${points.length === 1 ? '' : 's'}`}
        >
          Avg {avg}%
        </span>
      </div>
      <div style={{ padding: '14px 16px 12px' }}>
        <svg
          width="100%"
          height={VB_H + 6}
          viewBox={`0 0 ${VB_W} ${VB_H + 6}`}
          preserveAspectRatio="none"
          style={{ overflow: 'visible', display: 'block' }}
        >
          <defs>
            <linearGradient id="bar-grd-grn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#16A34A" />
            </linearGradient>
            <linearGradient id="bar-grd-amb" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
            <linearGradient id="bar-grd-red" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F87171" />
              <stop offset="100%" stopColor="#EF4444" />
            </linearGradient>
          </defs>

          {/* Grid lines at 0 / 50 / 100 */}
          {[0, 50, 100].map((g) => (
            <line
              key={g}
              x1={0}
              y1={yFor(g)}
              x2={VB_W}
              y2={yFor(g)}
              stroke={g === 0 ? '#E2E4F0' : '#ECEEF8'}
              strokeWidth={0.8}
            />
          ))}

          {/* Average reference line */}
          <line
            x1={0}
            y1={yFor(avg)}
            x2={VB_W}
            y2={yFor(avg)}
            stroke="#9BA3C4"
            strokeWidth={1}
            strokeDasharray="4,3"
          />

          {/* Bars + labels */}
          {points.map((p, i) => {
            const cx = i * slotW + slotW / 2;
            const x = cx - barW / 2;
            const y = yFor(p.pct);
            const h = PAD_TOP + PLOT_H - y;
            const fillId =
              p.pct >= 75
                ? 'bar-grd-grn'
                : p.pct >= 50
                  ? 'bar-grd-amb'
                  : 'bar-grd-red';
            return (
              <g key={p.id}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(2, h)}
                  rx={3}
                  fill={`url(#${fillId})`}
                >
                  <title>{`${formatPeriod(p.period)}: ${p.pct}%`}</title>
                </rect>
                <text
                  x={cx}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={800}
                  fill={tier(p.pct)}
                  fontFamily="'DM Mono',monospace"
                >
                  {p.pct}%
                </text>
                <text
                  x={cx}
                  y={VB_H + 2}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={700}
                  fill="#9BA3C4"
                  letterSpacing="0.4"
                >
                  {p.period.replace(/^FY-/, "'")}
                </text>
              </g>
            );
          })}
        </svg>

        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 8,
            flexWrap: 'wrap',
            fontSize: 10,
            color: '#5A6080',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{ width: 8, height: 8, borderRadius: 2, background: '#16A34A' }}
            />
            ≥ 75%
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{ width: 8, height: 8, borderRadius: 2, background: '#F59E0B' }}
            />
            50–74%
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div
              style={{ width: 8, height: 8, borderRadius: 2, background: '#EF4444' }}
            />
            &lt; 50%
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              marginLeft: 'auto',
            }}
          >
            <div
              style={{
                width: 12,
                height: 1,
                borderTop: '1px dashed #9BA3C4',
              }}
            />
            Avg {avg}%
          </div>
        </div>
      </div>
    </div>
  );
}
