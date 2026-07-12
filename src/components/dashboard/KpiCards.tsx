import { useEffect, useState } from 'react';
import { companies as companiesApi, reports as reportsApi, esg as esgApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company } from '@/types/company';
import { yearFromPeriod } from '@/lib/disclosure';

/**
 * KPI cards row — Revenue, Net Profit, ESG Score, Disclosure Index. Read-only and
 * HONEST: shows real numbers when the backend has them, otherwise "Not enough data
 * yet" (common right after onboarding). Nothing is fabricated.
 *   • Revenue / Net Profit — real value + YoY from the `financial` digital-twin state
 *     (the parser pre-computes the prior-year delta from a single statement).
 *   • Disclosure Index — real coverage % from the latest report; no prior-year, so
 *     the sub-line shows the period rather than a fake "vs 2024".
 *   • ESG Score — no backing data yet (scoring agent is a stub) → insufficient state.
 */

// ---- Financial digital-twin state shapes (see financial_parser.py output) ----
interface FinancialPeriod {
  period_label?: string;
  line_items?: Record<string, number | null>;
}
interface FinancialData {
  periods?: FinancialPeriod[];
  yoy_deltas?: Record<string, number | null>;
  currency?: string | null;
  denomination?: string | null;
}
interface TwinRow {
  data?: FinancialData | string | null;
}

interface ReportRow {
  id: string;
  period?: string | null;
  report_type?: string | null;
  coverage?: { percentage?: number | null; metrics_total?: number | null; metrics_disclosed?: number | null } | null;
}

// Latest ESG score row (GET /esg/{id}/scores → { scores: <row>|null }).
interface EsgScoreRow {
  overall_score?: number | null;
  e_score?: number | null;
  s_score?: number | null;
  g_score?: number | null;
  period?: string | null;
}

// The twin `data` column comes back as JSON that may be a string — parse defensively.
function parseTwinData(row: TwinRow | null | undefined): FinancialData | null {
  const raw = row?.data;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as FinancialData;
    } catch {
      return null;
    }
  }
  return raw;
}

// Statements declare their units ("in thousands"); scale the printed value back to absolute.
const DENOM_SCALE: Record<string, number> = {
  units: 1, ones: 1, absolute: 1,
  thousand: 1e3, thousands: 1e3,
  million: 1e6, millions: 1e6,
  billion: 1e9, billions: 1e9,
};

function formatMoney(value: number, currency?: string | null, denomination?: string | null): string {
  const scale = denomination ? DENOM_SCALE[denomination.toLowerCase()] ?? 1 : 1;
  let n = value * scale;
  const cur = currency && currency.toUpperCase() !== 'UNKNOWN' ? currency : '';
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  let disp = n;
  let suffix = '';
  if (n >= 1e9) { disp = n / 1e9; suffix = 'B'; }
  else if (n >= 1e6) { disp = n / 1e6; suffix = 'M'; }
  else if (n >= 1e3) { disp = n / 1e3; suffix = 'K'; }
  const num = suffix
    ? disp.toFixed(disp >= 100 ? 0 : 1).replace(/\.0$/, '')
    : Math.round(disp).toLocaleString();
  return `${cur ? cur + ' ' : ''}${sign}${num}${suffix}`.trim();
}

function latestPeriod(fin: FinancialData | null): FinancialPeriod | null {
  const ps = fin?.periods;
  if (!ps || !ps.length) return null;
  return [...ps].sort((a, b) => (b.period_label ?? '').localeCompare(a.period_label ?? ''))[0];
}

function priorPeriodLabel(fin: FinancialData | null): string | null {
  const ps = fin?.periods;
  if (!ps || ps.length < 2) return null;
  return [...ps].sort((a, b) => (b.period_label ?? '').localeCompare(a.period_label ?? ''))[1]?.period_label ?? null;
}

function lineItem(p: FinancialPeriod | null, keys: string[]): number | null {
  if (!p?.line_items) return null;
  for (const k of keys) {
    const v = p.line_items[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }
  return null;
}

function deltaPct(fin: FinancialData | null, keys: string[]): number | null {
  const d = fin?.yoy_deltas;
  if (!d) return null;
  for (const k of keys) {
    const v = d[`${k}_change_pct`];
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
  }
  return null;
}

function KpiCard({
  label, accent, value, delta, deltaLabel, sub, loading,
}: {
  label: string;
  accent: string;
  value: string | null;
  delta?: number | null;
  deltaLabel?: string;
  sub?: string | null;
  loading?: boolean;
}) {
  const hasData = !loading && value !== null;
  const barColor = hasData ? accent : '#E4E8F2';
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 18px 18px', flex: 1 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.6px', color: '#9BA3C4', textTransform: 'uppercase' }}>{label}</div>
        {loading ? (
          <div style={{ fontSize: 23, fontWeight: 800, color: '#C7CBDA', margin: '8px 0 2px', letterSpacing: '-.5px' }}>…</div>
        ) : value === null ? (
          <>
            <div style={{ fontSize: 23, fontWeight: 800, color: '#C7CBDA', margin: '8px 0 4px', letterSpacing: '-.5px' }}>—</div>
            <div style={{ fontSize: 11.5, color: '#9BA3C4' }}>Not enough data yet</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 23, fontWeight: 800, color: '#1A1D2E', margin: '6px 0 4px', letterSpacing: '-.5px' }}>{value}</div>
            {typeof delta === 'number' ? (
              <div style={{ fontSize: 11.5, fontWeight: 700, color: delta >= 0 ? '#0F9D6B' : '#E5484D', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>{delta >= 0 ? '▲' : '▼'}</span>
                <span>{Math.abs(delta).toFixed(1)}%{deltaLabel ? ` ${deltaLabel}` : ''}</span>
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: '#9BA3C4' }}>{sub ?? ''}</div>
            )}
          </>
        )}
      </div>
      <div style={{ height: 3, background: barColor }} />
    </div>
  );
}

export function KpiCards({ company }: { company: Company | null }) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [fin, setFin] = useState<FinancialData | null>(null);
  const [disclosure, setDisclosure] = useState<{ pct: number; period: string | null } | null>(null);
  const [esgScore, setEsgScore] = useState<{ overall: number; period: string | null } | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [twinRes, repRes, esgRes] = await Promise.allSettled([
        companiesApi.getTwinState<TwinRow>(companyId, 'financial'),
        reportsApi.list<{ reports?: ReportRow[] }>(companyId),
        esgApi.getScores<{ scores: EsgScoreRow | null }>(companyId),
      ]);
      if (cancelled) return;

      setFin(twinRes.status === 'fulfilled' ? parseTwinData(twinRes.value) : null);

      if (esgRes.status === 'fulfilled') {
        const s = esgRes.value?.scores;
        if (s && s.overall_score != null) setEsgScore({ overall: s.overall_score, period: s.period ?? null });
      }

      if (repRes.status === 'fulfilled') {
        const list = repRes.value?.reports ?? [];
        const withCov = list.filter((r) => r.coverage && (r.coverage.percentage != null || r.coverage.metrics_total));
        const esg = withCov.filter((r) => (r.report_type ?? '').toLowerCase() === 'esg');
        const pool = esg.length ? esg : withCov;
        const latest = pool.sort((a, b) => yearFromPeriod(b.period) - yearFromPeriod(a.period))[0];
        const cov = latest?.coverage;
        if (cov) {
          let pct = cov.percentage;
          if (pct == null && cov.metrics_total) pct = ((cov.metrics_disclosed ?? 0) / cov.metrics_total) * 100;
          if (pct != null && pct <= 1) pct *= 100; // normalise 0–1 rate → percentage
          if (pct != null) setDisclosure({ pct, period: latest?.period ?? null });
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const latest = latestPeriod(fin);
  const priorLabel = priorPeriodLabel(fin);
  const priorYear = priorLabel?.match(/(\d{4})/)?.[1] ?? null;
  const deltaLabel = priorYear ? `vs ${priorYear}` : 'vs prior year';
  const currency = fin?.currency ?? company?.reporting_currency ?? null;
  const denom = fin?.denomination ?? null;
  const latestLabel = latest?.period_label ?? null;

  const revenueVal = lineItem(latest, ['revenue']);
  const revenueDelta = deltaPct(fin, ['revenue']);
  const netVal = lineItem(latest, ['net_profit', 'net_income']);
  const netDelta = deltaPct(fin, ['net_profit', 'net_income']);
  const netAccent = typeof netDelta === 'number' && netDelta < 0 ? '#E5484D' : '#0F9D6B';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <KpiCard
        label="Revenue"
        accent="#0F9D6B"
        loading={loading}
        value={revenueVal != null ? formatMoney(revenueVal, currency, denom) : null}
        delta={revenueDelta}
        deltaLabel={deltaLabel}
        sub={latestLabel}
      />
      <KpiCard
        label="Net Profit"
        accent={netAccent}
        loading={loading}
        value={netVal != null ? formatMoney(netVal, currency, denom) : null}
        delta={netDelta}
        deltaLabel={deltaLabel}
        sub={latestLabel}
      />
      <KpiCard
        label="ESG Score"
        accent="#3B52E0"
        loading={loading}
        value={esgScore ? `${Math.round(esgScore.overall)}/100` : null}
        sub={esgScore?.period ?? null}
      />
      <KpiCard
        label="Disclosure Index"
        accent="#E8A33D"
        loading={loading}
        value={disclosure ? `${Math.round(disclosure.pct)}%` : null}
        sub={disclosure?.period ?? null}
      />
    </div>
  );
}

export default KpiCards;
