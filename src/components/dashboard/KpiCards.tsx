import { useEffect, useState } from 'react';
import { companies as companiesApi, reports as reportsApi, esg as esgApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company } from '@/types/company';
import { yearFromPeriod } from '@/lib/disclosure';

/**
 * KPI cards row — Revenue, Net Profit, ESG Score, Disclosure Index. Real numbers when
 * the backend has them; while onboarding is still computing a card's value, the value
 * slot shows the "AI" ring loader (the card heading stays). Nothing is fabricated.
 *   • Revenue / Net Profit — value + YoY from the `financial` digital-twin (RAG-extracted).
 *   • ESG Score — found/total*100 from the ESG harvester (esg.getScores), shown as N.N/100.
 *   • Disclosure Index — coverage % from the latest report.
 * Cards poll until the data lands (or onboarding finishes), so numbers appear without a reload.
 */

// ---- Financial digital-twin state shapes ----
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

// The onboarding "AI" loader — two counter-rotating rings with the AI mark, shown in a
// card's value slot while that KPI is still being computed.
function AiRingLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '5px 0 3px' }}>
      <div style={{ position: 'relative', width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="34" height="34" viewBox="0 0 36 36" fill="none" style={{ position: 'absolute', inset: 0, animation: 'spin 1.2s linear infinite' }}>
          <circle cx="18" cy="18" r="15" stroke="#ECEEFF" strokeWidth="3" />
          <path d="M18 3a15 15 0 0 1 15 15" stroke="#4040C8" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', animation: 'spin 0.9s linear infinite reverse' }}>
          <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span style={{ position: 'relative', fontSize: 8, fontWeight: 800, color: '#4040C8', letterSpacing: '.3px' }}>AI</span>
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9BA3C4' }}>Computing…</span>
    </div>
  );
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
          <AiRingLoader />
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
  // onboarding_progress.percent stays <100 until the KPI step finishes — drives the
  // per-card "computing" loader and the poll.
  const [progressPercent, setProgressPercent] = useState<number | null>(
    company?.onboarding_progress?.percent ?? null,
  );

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    const MAX_WAIT = 6 * 60 * 1000;
    const nextDelay = () => {
      const e = Date.now() - startedAt;
      return e < 30_000 ? 3000 : e < 120_000 ? 6000 : 12000;
    };

    const applyDisclosure = (repRes: PromiseSettledResult<{ reports?: ReportRow[] }>): boolean => {
      if (repRes.status !== 'fulfilled') return false;
      const list = repRes.value?.reports ?? [];
      const withCov = list.filter((r) => r.coverage && (r.coverage.percentage != null || r.coverage.metrics_total));
      const esg = withCov.filter((r) => (r.report_type ?? '').toLowerCase() === 'esg');
      const pool = esg.length ? esg : withCov;
      const latest = pool.sort((a, b) => yearFromPeriod(b.period) - yearFromPeriod(a.period))[0];
      const cov = latest?.coverage;
      if (!cov) return false;
      let pct = cov.percentage;
      if (pct == null && cov.metrics_total) pct = ((cov.metrics_disclosed ?? 0) / cov.metrics_total) * 100;
      if (pct != null && pct <= 1) pct *= 100; // normalise 0–1 rate → percentage
      if (pct == null) return false;
      setDisclosure({ pct, period: latest?.period ?? null });
      return true;
    };

    const tick = async () => {
      const [coRes, twinRes, repRes, esgRes] = await Promise.allSettled([
        companiesApi.getMyCompany(),
        companiesApi.getTwinState<TwinRow>(companyId, 'financial'),
        reportsApi.list<{ reports?: ReportRow[] }>(companyId),
        esgApi.getScores<{ scores: EsgScoreRow | null }>(companyId),
      ]);
      if (cancelled) return;

      const pct = coRes.status === 'fulfilled' ? coRes.value?.onboarding_progress?.percent ?? null : null;
      setProgressPercent(pct);

      const finData = twinRes.status === 'fulfilled' ? parseTwinData(twinRes.value) : null;
      setFin(finData);

      let esgPresent = false;
      if (esgRes.status === 'fulfilled') {
        const s = esgRes.value?.scores;
        if (s && s.overall_score != null) { setEsgScore({ overall: s.overall_score, period: s.period ?? null }); esgPresent = true; }
      }

      const disclosurePresent = applyDisclosure(repRes);
      setLoading(false);

      const li = finData?.periods?.[0]?.line_items;
      const finPresent = Boolean(li && (li.revenue != null || li.net_profit != null));
      const running = pct != null && pct < 100;
      const allPresent = finPresent && esgPresent && disclosurePresent;
      if (running && !allPresent && Date.now() - startedAt < MAX_WAIT) {
        timer = setTimeout(tick, nextDelay());
      }
    };
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
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

  // A card shows the "AI" loader while the first fetch is in flight, or while onboarding
  // is still computing KPIs and this card's value hasn't landed yet.
  const running = progressPercent != null && progressPercent < 100;
  const cardLoading = (present: boolean) => loading || (running && !present);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
      <KpiCard
        label="Revenue"
        accent="#0F9D6B"
        loading={cardLoading(revenueVal != null)}
        value={revenueVal != null ? formatMoney(revenueVal, currency, denom) : null}
        delta={revenueDelta}
        deltaLabel={deltaLabel}
        sub={latestLabel}
      />
      <KpiCard
        label="Net Profit"
        accent={netAccent}
        loading={cardLoading(netVal != null)}
        value={netVal != null ? formatMoney(netVal, currency, denom) : null}
        delta={netDelta}
        deltaLabel={deltaLabel}
        sub={latestLabel}
      />
      <KpiCard
        label="ESG Score"
        accent="#3B52E0"
        loading={cardLoading(esgScore != null)}
        value={esgScore ? `${esgScore.overall.toFixed(1)}/100` : null}
        sub={esgScore?.period ?? null}
      />
      <KpiCard
        label="Disclosure Index"
        accent="#E8A33D"
        loading={cardLoading(disclosure != null)}
        value={disclosure ? `${Math.round(disclosure.pct)}%` : null}
        sub={disclosure?.period ?? null}
      />
    </div>
  );
}

export default KpiCards;
