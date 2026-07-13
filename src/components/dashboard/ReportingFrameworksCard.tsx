import { useEffect, useState } from 'react';
import { lookups, companies as companiesApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { ScopesResponse } from '@/types/lookups';

/**
 * Reporting Frameworks — the wide left tile of the Home dashboard's Row B. Shows 5
 * specific reporting frameworks (real indicator counts from lookups.scopes, the same
 * source as the ESG-tab Framework Catalogue) plus a 2-year revenue mini-chart (the
 * report's year + the prior year, derived from the financial digital-twin).
 */

const ACCENT_UNIVERSAL = '#4040C8'; // GRI / IFRS
const ACCENT_REGIONAL = '#0891B2'; // CMA / SAMA

// The 5 frameworks to show, in this fixed order.
const FRAMEWORKS: { kind: 'universal' | 'regional'; code: string }[] = [
  { kind: 'universal', code: 'GRI' },
  { kind: 'universal', code: 'IFRS-S1' },
  { kind: 'universal', code: 'IFRS-S2' },
  { kind: 'regional', code: 'CMA' },
  { kind: 'regional', code: 'SAMA' },
];

interface FrameworkRow { label: string; count: number; color: string }

// ---- financial twin (revenue) — same shapes/helpers as KpiCards ----
interface FinancialData {
  periods?: { period_label?: string; line_items?: Record<string, number | null> }[];
  yoy_deltas?: Record<string, number | null>;
  currency?: string | null;
  denomination?: string | null;
}
interface TwinRow { data?: FinancialData | string | null }

function parseTwinData(row: TwinRow | null | undefined): FinancialData | null {
  const raw = row?.data;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as FinancialData; } catch { return null; }
  }
  return raw;
}

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
  const num = suffix ? disp.toFixed(disp >= 100 ? 0 : 1).replace(/\.0$/, '') : Math.round(disp).toLocaleString();
  return `${cur ? cur + ' ' : ''}${sign}${num}${suffix}`.trim();
}

export function ReportingFrameworksCard() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [scopes, setScopes] = useState<ScopesResponse | null>(null);
  const [fin, setFin] = useState<FinancialData | null>(null);

  useEffect(() => {
    let cancelled = false;
    lookups.scopes<ScopesResponse>().then((s) => { if (!cancelled) setScopes(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    companiesApi.getTwinState<TwinRow>(companyId, 'financial')
      .then((r) => { if (!cancelled) setFin(parseTwinData(r)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  // Build the 5 framework rows in the fixed order (skip any missing from the response).
  const rows: FrameworkRow[] = [];
  if (scopes) {
    for (const f of FRAMEWORKS) {
      if (f.kind === 'universal') {
        const u = scopes.universal.find((x) => x.code === f.code);
        if (u) rows.push({ label: u.label, count: u.indicator_count, color: ACCENT_UNIVERSAL });
      } else {
        const r = scopes.regional.find((x) => x.code === f.code);
        if (r) rows.push({ label: `${r.code} — ${r.label}`, count: r.indicator_count, color: ACCENT_REGIONAL });
      }
    }
  }
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  // Revenue — the report's year + a derived prior (current / (1 + yoy%)).
  const periods = fin?.periods ?? [];
  const latest = periods.length
    ? [...periods].sort((a, b) => (b.period_label ?? '').localeCompare(a.period_label ?? ''))[0]
    : null;
  const revNow = typeof latest?.line_items?.revenue === 'number' ? latest.line_items.revenue : null;
  const revPct = typeof fin?.yoy_deltas?.revenue_change_pct === 'number' ? fin.yoy_deltas.revenue_change_pct : null;
  const currentYear = latest?.period_label?.match(/(\d{4})/)?.[1] ?? null;
  const revPrior = revNow != null && revPct != null && 1 + revPct / 100 !== 0 ? revNow / (1 + revPct / 100) : null;

  const revBars: { year: number; value: number; highlight: boolean }[] = [];
  if (revNow != null && currentYear) {
    const cy = Number(currentYear);
    if (revPrior != null) revBars.push({ year: cy - 1, value: revPrior, highlight: false });
    revBars.push({ year: cy, value: revNow, highlight: true });
  }
  const maxRev = Math.max(1, ...revBars.map((b) => b.value));
  const currency = fin?.currency ?? null;
  const denom = fin?.denomination ?? null;

  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B52E0', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.6px', textTransform: 'uppercase', color: '#5A6080' }}>Reporting Frameworks</span>
      </div>
      <div style={{ height: 1, background: '#ECEEF8', margin: '12px 0 16px' }} />

      {/* Framework rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
        {scopes === null
          ? [0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E4E8F2', flexShrink: 0 }} />
                <span style={{ width: 220, flexShrink: 0, height: 10, borderRadius: 4, background: '#EEF0F6' }} />
                <span style={{ flex: 1, height: 10, borderRadius: 4, background: '#EEF0F6' }} />
                <span style={{ width: 30, height: 10, borderRadius: 4, background: '#EEF0F6', flexShrink: 0 }} />
              </div>
            ))
          : rows.map((r) => (
              <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                <span style={{ width: 220, flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#3A3F58', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                <div style={{ flex: 1, minWidth: 0, height: 6, borderRadius: 999, background: '#EEF0F6', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(3, Math.round((r.count / maxCount) * 100))}%`, height: '100%', background: r.color, borderRadius: 999 }} />
                </div>
                <span style={{ width: 40, textAlign: 'right', fontSize: 13, fontWeight: 800, fontFamily: "'DM Mono', monospace", color: r.color, flexShrink: 0 }}>{r.count}</span>
              </div>
            ))}
      </div>

      {/* Revenue — report year + prior */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #ECEEF8' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9BA3C4', marginBottom: 14 }}>Revenue</div>
        {revBars.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9BA3C4', paddingBottom: 6 }}>Revenue appears once your annual report is processed.</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 28, height: 110 }}>
            {revBars.map((b) => (
              <div key={b.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 7, width: 74, height: '100%' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: b.highlight ? '#16A34A' : '#5A6080' }}>{formatMoney(b.value, currency, denom)}</span>
                <div style={{ width: '100%', maxWidth: 60, height: `${Math.max(8, Math.round((b.value / maxRev) * 62))}px`, borderRadius: 6, background: b.highlight ? '#16A34A' : 'rgba(22,163,74,.18)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: b.highlight ? '#16A34A' : '#9BA3C4' }}>{b.year}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportingFrameworksCard;
