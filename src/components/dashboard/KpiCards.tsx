import { useEffect, useState } from 'react';
import { companies as companiesApi, esg as esgApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company } from '@/types/company';

/**
 * KPI cards row — Revenue, Net Profit, ESG Score. Real numbers when the backend has
 * them; while onboarding is still computing a card's value, the value slot shows the
 * "AI" ring loader (the card heading stays). Nothing is fabricated.
 *   • Revenue / Net Profit — value + YoY from the `financial` digital-twin (RAG-extracted).
 *   • ESG Score — found/total*100 from the ESG harvester (esg.getScores), shown as N.N/100.
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
      <div style={{ position: 'relative', width: 54, height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="54" height="54" viewBox="0 0 36 36" fill="none" style={{ position: 'absolute', inset: 0, animation: 'spin 1.2s linear infinite' }}>
          <circle cx="18" cy="18" r="15" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
          <path d="M18 3a15 15 0 0 1 15 15" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <svg width="35" height="35" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', animation: 'spin 0.9s linear infinite reverse' }}>
          <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" stroke="rgba(255,255,255,.7)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <span style={{ position: 'relative', fontSize: 12.5, fontWeight: 800, color: '#fff', letterSpacing: '.3px' }}>AI</span>
      </div>
      <span style={{ fontSize: 24, fontWeight: 600, color: '#fff' }}>Computing…</span>
    </div>
  );
}

function KpiCard({
  label, accent, value, delta, deltaLabel, deltaUnit = 'pct', sub, loading,
}: {
  label: string;
  accent: string;
  value: string | null;
  delta?: number | null;
  deltaLabel?: string;
  deltaUnit?: 'pct' | 'pts';
  sub?: string | null;
  loading?: boolean;
}) {
  return (
    <div style={{ background: 'rgba(53,53,181,.88)', borderBottom: '3px solid #AEAEF0', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 157 }}>
      <div style={{ padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 500, letterSpacing: '.6px', color: '#fff' }}>{label}</div>
        {loading ? (
          <AiRingLoader />
        ) : value === null ? (
          <>
            <div style={{ fontSize: 34, fontWeight: 800, color: 'rgba(255,255,255,.5)', margin: '8px 0 4px', letterSpacing: '-.5px' }}>—</div>
            <div style={{ fontSize: 16, color: 'rgba(255,255,255,.7)' }}>Not enough data yet</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', margin: '4px 0', letterSpacing: '-.5px' }}>{value}</div>
            {typeof delta === 'number' ? (
              <div style={{ fontSize: 16, fontWeight: 600, color: delta >= 0 ? '#86EFAC' : '#FCA5A5', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>{delta >= 0 ? '▲' : '▼'}</span>
                <span>{deltaUnit === 'pts' ? `${Math.round(Math.abs(delta))} pts` : `${Math.abs(delta).toFixed(1)}%`}{deltaLabel ? ` ${deltaLabel}` : ''}</span>
              </div>
            ) : (
              <div style={{ fontSize: 16, color: 'rgba(255,255,255,.85)' }}>{sub ?? ''}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function KpiCards({ company }: { company: Company | null }) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [fin, setFin] = useState<FinancialData | null>(null);
  const [esgScore, setEsgScore] = useState<{ overall: number; period: string | null; prevOverall: number | null; prevPeriod: string | null } | null>(null);
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

    const tick = async () => {
      const [coRes, twinRes, esgRes] = await Promise.allSettled([
        companiesApi.getMyCompany(),
        companiesApi.getTwinState<TwinRow>(companyId, 'financial'),
        esgApi.getScores<{ scores: EsgScoreRow | null; previous?: EsgScoreRow | null }>(companyId),
      ]);
      if (cancelled) return;

      const pct = coRes.status === 'fulfilled' ? coRes.value?.onboarding_progress?.percent ?? null : null;
      setProgressPercent(pct);

      const finData = twinRes.status === 'fulfilled' ? parseTwinData(twinRes.value) : null;
      setFin(finData);

      let esgPresent = false;
      if (esgRes.status === 'fulfilled') {
        const s = esgRes.value?.scores;
        const prev = esgRes.value?.previous;
        if (s && s.overall_score != null) {
          setEsgScore({
            overall: s.overall_score,
            period: s.period ?? null,
            prevOverall: prev?.overall_score ?? null,
            prevPeriod: prev?.period ?? null,
          });
          esgPresent = true;
        }
      }

      setLoading(false);

      const li = finData?.periods?.[0]?.line_items;
      const finPresent = Boolean(li && (li.revenue != null || li.net_profit != null));
      const running = pct != null && pct < 100;
      const allPresent = finPresent && esgPresent;
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

  // ESG year-over-year: points delta vs the previous scored period (mockup: "▲ +6 pts vs 2024").
  const esgDelta = esgScore && esgScore.prevOverall != null ? esgScore.overall - esgScore.prevOverall : null;
  const esgPrevYear = esgScore?.prevPeriod?.match(/(\d{4})/)?.[1] ?? null;

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
        value={esgScore ? `${Math.round(esgScore.overall)}/100` : null}
        delta={esgDelta}
        deltaUnit="pts"
        deltaLabel={esgPrevYear ? `vs ${esgPrevYear}` : undefined}
        sub={esgScore?.period ?? null}
      />
    </div>
  );
}

export default KpiCards;
