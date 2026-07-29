import { useEffect, useState } from 'react';
import { lookups, companies as companiesApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { ScopesResponse } from '@/types/lookups';

/**
 * Reporting Frameworks — the wide left tile of the Home dashboard's Row B. Shows 5
 * specific reporting frameworks (real indicator counts from lookups.scopes, the same
 * source as the ESG-tab Framework Catalogue) plus a multi-year revenue mini-chart —
 * one bar per year across ALL financial digital-twin periods (the earliest prior year
 * is derived from that report's YoY %).
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
// One digital_twin_states row from GET /companies/{id}/twin (all states, no limit).
interface TwinStateRow extends TwinRow {
  state_type?: string | null;
  period?: string | null;
  version?: number | null;
}
interface DigitalTwinResponse { states?: TwinStateRow[] }

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
  const [finRows, setFinRows] = useState<{ period: string | null; version: number; data: FinancialData }[]>([]);

  useEffect(() => {
    let cancelled = false;
    lookups.scopes<ScopesResponse>().then((s) => { if (!cancelled) setScopes(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    // Pull ALL twin states (the /twin endpoint has no limit, unlike /twin/{type})
    // so we can build a multi-year revenue history from every financial period.
    companiesApi.getDigitalTwin<DigitalTwinResponse>(companyId)
      .then((r) => {
        if (cancelled) return;
        const financialRows = (r?.states ?? [])
          .filter((s) => s.state_type === 'financial')
          .map((s) => ({
            period: s.period ?? null,
            version: typeof s.version === 'number' ? s.version : 0,
            data: parseTwinData(s),
          }))
          .filter((x): x is { period: string | null; version: number; data: FinancialData } => x.data != null);
        setFinRows(financialRows);
      })
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

  // Revenue — one bar per YEAR across all financial twin periods. Each period's
  // revenue is scaled to an absolute number (via DENOM_SCALE) so years with
  // different denominations stay comparable; the earliest year is filled with a
  // value derived from that report's YoY % so the history stays continuous.
  const scaleOf = (d?: string | null) => (d ? DENOM_SCALE[d.toLowerCase()] ?? 1 : 1);

  // Dedup periods, keeping the highest version per period (re-uploads bump version).
  const byPeriod = new Map<string, { version: number; data: FinancialData; label: string }>();
  for (const row of finRows) {
    const label = row.data.periods?.[0]?.period_label ?? row.period ?? '';
    const key = label || `v${row.version}`;
    const prev = byPeriod.get(key);
    if (!prev || row.version >= prev.version) byPeriod.set(key, { version: row.version, data: row.data, label });
  }

  // Actual revenues by year (absolute) + a derived prior year from each report's YoY.
  const actualByYear = new Map<number, number>();
  const derivedByYear = new Map<number, number>();
  let seriesCurrency: string | null = null;
  for (const { data, label } of byPeriod.values()) {
    const rev = data.periods?.[0]?.line_items?.revenue;
    const year = Number(label.match(/(\d{4})/)?.[1] ?? NaN);
    if (typeof rev !== 'number' || Number.isNaN(year)) continue;
    const abs = rev * scaleOf(data.denomination);
    actualByYear.set(year, abs);
    seriesCurrency = seriesCurrency ?? data.currency ?? null;
    const yoy = data.yoy_deltas?.revenue_change_pct;
    if (typeof yoy === 'number' && 1 + yoy / 100 !== 0) derivedByYear.set(year - 1, abs / (1 + yoy / 100));
  }

  // Merge (actuals win over deriveds), sort ascending, keep the last 4 years,
  // highlight the latest actual year green.
  const latestYear = actualByYear.size ? Math.max(...actualByYear.keys()) : null;
  const revBars = [...new Set<number>([...actualByYear.keys(), ...derivedByYear.keys()])]
    .sort((a, b) => a - b)
    .map((year) => ({ year, value: actualByYear.get(year) ?? derivedByYear.get(year) ?? 0, highlight: year === latestYear }))
    .filter((b) => b.value > 0)
    .slice(-4);
  const maxRev = Math.max(1, ...revBars.map((b) => b.value));

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

      {/* Revenue — one bar per year (all financial periods) */}
      <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #ECEEF8' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9BA3C4', marginBottom: 14 }}>Revenue Comparison</div>
        {revBars.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9BA3C4', paddingBottom: 6 }}>Revenue appears once your annual report is processed.</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 22, height: 110 }}>
            {revBars.map((b) => (
              <div key={b.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 7, width: 74, height: '100%' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: b.highlight ? '#16A34A' : '#5A6080' }}>{formatMoney(b.value, seriesCurrency, null)}</span>
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
