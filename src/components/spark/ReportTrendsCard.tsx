// Report comparison chart — which report type the platform is actually
// producing, and how that shifts month to month.
//
// Grouped bars rather than stacked: the question is "which type was created
// more", and only a shared baseline answers that. Stacking would put every
// series except the bottom one on a floating baseline.

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Spinner } from '@/components/shared/Spinner';
import { spark } from '@/lib/api';
import type { SparkCompanyRow, SparkReportTrends } from '@/types/spark';

// Categorical palette, validated for colour-vision deficiency rather than
// picked by eye (worst adjacent pair ΔE 13.5 protan, floor is 8). The brand
// orange #E0792B is darkened to #C2661F because the original fails 3:1
// contrast against the white card.
//
// Assigned in this fixed order and NEVER cycled — a colour belongs to a report
// type, not to its rank, so filtering the list must not repaint the survivors.
// A 6th type folds into grey rather than inventing a hue.
const SERIES_COLORS = ['#4040C8', '#0D9488', '#C2661F', '#7C3AED', '#16A34A'];
const OVERFLOW_COLOR = '#9BA3C4';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const colorFor = (index: number) => SERIES_COLORS[index] ?? OVERFLOW_COLOR;

function Select({
  value,
  onChange,
  children,
  width,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  width: number;
  label: string;
}) {
  return (
    <select
      className="inp sel"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width, padding: '7px 26px 7px 10px', fontSize: 11.5, fontWeight: 600 }}
    >
      {children}
    </select>
  );
}

// Every series for the hovered month, biggest first, so the tooltip answers
// "which type led here" without counting bar heights.
function ChartTooltip({
  active,
  payload,
  labelText,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  labelText?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = [...payload].sort((a, b) => b.value - a.value);
  const total = rows.reduce((n, r) => n + (r.value ?? 0), 0);
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #E2E4F0',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,.08)',
        padding: '9px 11px',
        minWidth: 150,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: '#1A1D2E', marginBottom: 6 }}>
        {labelText}
      </div>
      {rows.map((r) => (
        <div
          key={r.name}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}
        >
          <span
            style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }}
          />
          <span style={{ fontSize: 11, color: '#5A6080', flex: 1 }}>{r.name}</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#1A1D2E',
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {r.value}
          </span>
        </div>
      ))}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid #F1F2F9',
          marginTop: 5,
          paddingTop: 5,
          fontSize: 10.5,
          color: '#9BA3C4',
          fontWeight: 700,
        }}
      >
        <span>Total</span>
        <span style={{ fontFamily: "'DM Mono', monospace" }}>{total}</span>
      </div>
    </div>
  );
}

export function ReportTrendsCard({ companies }: { companies: SparkCompanyRow[] }) {
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<string>(''); // '' = whole year
  const [companyId, setCompanyId] = useState<string>('');

  const [data, setData] = useState<SparkReportTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    spark
      .reportTrends({
        ...(year ? { year } : {}),
        ...(companyId ? { company_id: companyId } : {}),
      })
      .then((res) => {
        if (!alive) return;
        setData(res);
        // Adopt the newest year on first load — a year-bucketed chart of one
        // year is a single bar group, so the unfiltered view isn't the one
        // worth showing. Re-adopt if the selected year isn't in the new list
        // either: narrowing to a company that has no data for it would
        // otherwise leave the dropdown pointing at a year it no longer offers,
        // with an empty chart and no way back except a lucky click.
        // Max rather than the last element — nothing promises a sorted array.
        if (res.available_years.length > 0 && !res.available_years.includes(year as number)) {
          setYear(Math.max(...res.available_years));
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load trends.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [year, companyId]);

  // Recharts wants one flat row per bucket: { label, [typeKey]: count }.
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.buckets.map((b) => ({ ...b.counts, __label: b.label, __key: b.key }));
  }, [data]);

  // The month picker never refetches — it dims the other months, so the
  // selected one is read against the rest of the year instead of alone.
  const selectedIdx = month === '' ? -1 : chartData.findIndex((d) => d.__label === month);

  // Headline: which type leads the visible window. Recomputed client-side for
  // the selected month, so it tracks the dimming.
  const leader = useMemo(() => {
    if (!data || data.report_types.length === 0) return null;
    // One selected month reads off that bucket; the whole year reads the
    // window totals the normalizer already assembled — the same numbers the
    // legend shows, so headline and legend can't disagree.
    const perType =
      selectedIdx >= 0 ? (data.buckets[selectedIdx]?.counts ?? {}) : data.totals;
    // Summed from perType rather than taken from `data.total`, so the
    // percentage is always out of the figures being compared.
    const sum = data.report_types.reduce((n, t) => n + (perType[t.key] ?? 0), 0);
    if (sum === 0) return null;
    const top = data.report_types.reduce((best, t) =>
      (perType[t.key] ?? 0) > (perType[best.key] ?? 0) ? t : best,
    );
    const count = perType[top.key] ?? 0;
    return { label: top.label, count, sum, pct: Math.round((count / sum) * 100) };
  }, [data, selectedIdx]);

  const monthsAvailable = data?.buckets.map((b) => b.label).filter((l) => MONTHS.includes(l)) ?? [];
  // Keyed on the counts, which are what the bars are drawn from — not on the
  // reported `total`, so a backend total that disagrees with its own breakdown
  // can never hide a chart that plainly has bars in it.
  const hasData = (data?.buckets ?? []).some((b) =>
    Object.values(b.counts).some((v) => v > 0),
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      <div className="uhead" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div>
          <span className="uhead-title">Reports by type</span>
          <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
            {leader
              ? `${leader.label} leads — ${leader.count} of ${leader.sum} reports (${leader.pct}%)`
              : 'Which report type the platform is producing most'}
          </div>
        </div>
        {/* Filters in one row, above the chart. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select
            label="Filter by year"
            width={92}
            value={year ? String(year) : ''}
            onChange={(v) => {
              setYear(v ? Number(v) : null);
              setMonth('');
            }}
          >
            {(data?.available_years ?? []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Select
            label="Filter by month"
            width={110}
            value={month}
            onChange={setMonth}
          >
            <option value="">All months</option>
            {monthsAvailable.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Select
            label="Filter by company"
            width={160}
            value={companyId}
            onChange={(v) => setCompanyId(v)}
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div style={{ padding: '16px 18px 6px' }}>
        {loading && !data ? (
          <Spinner pad={60} />
        ) : error ? (
          <div style={{ padding: 40, textAlign: 'center', fontSize: 12, color: '#5A6080' }}>
            {error}
          </div>
        ) : !hasData ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>
              No reports in this period
            </div>
            <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 4 }}>
              Try another year, or clear the company filter.
            </div>
          </div>
        ) : (
          <>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, bottom: 0, left: -18 }}
                  barGap={2}
                  barCategoryGap="22%"
                >
                  {/* Recessive: horizontal rules only, no vertical clutter. */}
                  <CartesianGrid stroke="#F1F2F9" vertical={false} />
                  <XAxis
                    dataKey="__label"
                    tick={{ fontSize: 10, fill: '#9BA3C4' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#9BA3C4' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={38}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(64,64,200,.05)' }}
                    content={({ active, payload, label }) => (
                      <ChartTooltip
                        active={active}
                        payload={payload as never}
                        labelText={String(label ?? '')}
                      />
                    )}
                  />
                  {(data?.report_types ?? []).map((t, i) => (
                    <Bar
                      key={t.key}
                      dataKey={t.key}
                      name={t.label}
                      fill={colorFor(i)}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={18}
                      isAnimationActive={false}
                    >
                      {/* Per-bucket opacity is what makes the month picker a
                          highlight rather than a refetch. */}
                      {chartData.map((d, idx) => (
                        <Cell
                          key={d.__key}
                          fillOpacity={selectedIdx < 0 || selectedIdx === idx ? 1 : 0.22}
                        />
                      ))}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend is mandatory at 2+ series — identity must never be
                carried by colour alone. */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px 16px',
                padding: '12px 2px 10px',
                borderTop: '1px solid #F4F5FB',
                marginTop: 10,
              }}
            >
              {(data?.report_types ?? []).map((t, i) => (
                <span
                  key={t.key}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 3,
                      background: colorFor(i),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#5A6080', fontWeight: 600 }}>{t.label}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#9BA3C4',
                      fontFamily: "'DM Mono', monospace",
                    }}
                  >
                    {data?.totals[t.key] ?? 0}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default ReportTrendsCard;
