import { useMemo, useState } from 'react';

type Sentiment = 'pos' | 'warn' | 'neg' | 'neutral';

interface Kpi {
  name: string;
  value: string;
  change: string;
  sentiment: Sentiment;
  valueColor?: string;
}

interface ExtractedRow {
  kpi: string;
  value: string;
  unit: string;
  framework: string;
  page: string;
  confidence: number;
}

interface ReportTab {
  id: string;
  label: string;
  period: string;
  framework: string;
  rows: ExtractedRow[];
}

const changeColor: Record<Sentiment, string> = {
  pos: '#16A34A',
  warn: '#F59E0B',
  neg: '#DC2626',
  neutral: '#9BA3C4',
};

const PAGE_SIZE = 8;

const esgKpis: Kpi[] = [
  { name: 'Scope 1 GHG Emissions (tCO₂e)', value: '1,842', change: '-8.4%', sentiment: 'pos' },
  { name: 'Scope 2 GHG Emissions (tCO₂e)', value: '3,210', change: '-4.2%', sentiment: 'pos' },
  { name: 'Renewable Energy %', value: '18.4%', change: '+2.1%', sentiment: 'warn' },
  { name: 'Water Withdrawal (m³)', value: '14,200', change: '-3.1%', sentiment: 'pos' },
  { name: 'Saudization Rate (Nitaqat)', value: '68.4%', change: '+0.4%', sentiment: 'warn' },
  { name: 'Gender Diversity', value: '38.2%', change: '+2.8%', sentiment: 'pos' },
  { name: 'Lost Time Injury Rate', value: '0.42', change: '-0.12', sentiment: 'pos' },
  { name: 'Board Independence', value: '67%', change: '—', sentiment: 'neutral' },
];

const finKpis: Kpi[] = [
  { name: 'AUM (SAR B)', value: '84.2', change: '+12.3%', sentiment: 'pos' },
  { name: 'Total Return (gross)', value: '18.4%', change: '+7.2pp', sentiment: 'pos' },
  { name: 'Net Profit (SAR M)', value: '412', change: '+29.6%', sentiment: 'pos' },
  { name: 'EBITDA Margin', value: '40.5%', change: '+1.3pp', sentiment: 'pos' },
  { name: 'Sharpe Ratio', value: '1.84', change: '+0.33', sentiment: 'pos' },
  { name: 'Leverage Ratio', value: '1.42×', change: '-0.25', sentiment: 'pos' },
  { name: 'Sector Concentration', value: '40.1%', change: '+5.9pp', sentiment: 'neg', valueColor: '#DC2626' },
  { name: 'Dividend per Unit (SAR)', value: '0.84', change: '+25.4%', sentiment: 'pos' },
];

const reportTabs: ReportTab[] = [
  {
    id: 'fy2024',
    label: 'FY 2024 Annual Report',
    period: 'FY 2024',
    framework: 'GRI 2021',
    rows: [
      { kpi: 'Scope 1 GHG Emissions', value: '1,842', unit: 'tCO₂e', framework: 'GRI 305-1', page: 'p. 42', confidence: 98 },
      { kpi: 'Scope 2 GHG Emissions', value: '3,210', unit: 'tCO₂e', framework: 'GRI 305-2', page: 'p. 43', confidence: 96 },
      { kpi: 'Scope 3 GHG Emissions', value: '12,480', unit: 'tCO₂e', framework: 'GRI 305-3', page: 'p. 44', confidence: 89 },
      { kpi: 'Total Energy Consumed', value: '24,180', unit: 'MWh', framework: 'GRI 302-1', page: 'p. 38', confidence: 99 },
      { kpi: 'Renewable Energy Share', value: '18.4', unit: '%', framework: 'GRI 302-1', page: 'p. 39', confidence: 95 },
      { kpi: 'Water Withdrawal', value: '14,200', unit: 'm³', framework: 'GRI 303-3', page: 'p. 51', confidence: 94 },
      { kpi: 'Water Recycled', value: '22', unit: '%', framework: 'GRI 303-3', page: 'p. 52', confidence: 91 },
      { kpi: 'Total Employees (FTE)', value: '2,847', unit: 'FTE', framework: 'GRI 2-7', page: 'p. 18', confidence: 100 },
      { kpi: 'Saudization Rate', value: '68.4', unit: '%', framework: 'GRI 405-1', page: 'p. 22', confidence: 99 },
      { kpi: 'Gender Diversity', value: '38.2', unit: '%', framework: 'GRI 405-1', page: 'p. 23', confidence: 98 },
      { kpi: 'Board Independence', value: '67', unit: '%', framework: 'GRI 2-9', page: 'p. 11', confidence: 100 },
      { kpi: 'Anti-Corruption Training', value: '100', unit: '%', framework: 'GRI 205-2', page: 'p. 28', confidence: 96 },
      { kpi: 'Lost Time Injury Rate', value: '0.42', unit: '', framework: 'GRI 403-9', page: 'p. 31', confidence: 92 },
      { kpi: 'Total Training Hours', value: '54,200', unit: 'hrs', framework: 'GRI 404-1', page: 'p. 26', confidence: 88 },
      { kpi: 'Community Investment', value: '8.2', unit: 'SAR M', framework: 'GRI 203-1', page: 'p. 61', confidence: 90 },
      { kpi: 'Supplier Code Adherence', value: '94', unit: '%', framework: 'GRI 308-1', page: 'p. 67', confidence: 87 },
    ],
  },
  {
    id: 'fy2023',
    label: 'FY 2023 Annual Report',
    period: 'FY 2023',
    framework: 'GRI 2021',
    rows: [
      { kpi: 'Scope 1 GHG Emissions', value: '2,008', unit: 'tCO₂e', framework: 'GRI 305-1', page: 'p. 40', confidence: 97 },
      { kpi: 'Scope 2 GHG Emissions', value: '3,352', unit: 'tCO₂e', framework: 'GRI 305-2', page: 'p. 41', confidence: 95 },
      { kpi: 'Scope 3 GHG Emissions', value: '11,920', unit: 'tCO₂e', framework: 'GRI 305-3', page: 'p. 42', confidence: 86 },
      { kpi: 'Total Energy Consumed', value: '25,810', unit: 'MWh', framework: 'GRI 302-1', page: 'p. 36', confidence: 99 },
      { kpi: 'Renewable Energy Share', value: '16.3', unit: '%', framework: 'GRI 302-1', page: 'p. 37', confidence: 93 },
      { kpi: 'Water Withdrawal', value: '14,650', unit: 'm³', framework: 'GRI 303-3', page: 'p. 49', confidence: 92 },
      { kpi: 'Total Employees (FTE)', value: '2,540', unit: 'FTE', framework: 'GRI 2-7', page: 'p. 17', confidence: 100 },
      { kpi: 'Saudization Rate', value: '66.0', unit: '%', framework: 'GRI 405-1', page: 'p. 21', confidence: 99 },
      { kpi: 'Gender Diversity', value: '36.5', unit: '%', framework: 'GRI 405-1', page: 'p. 21', confidence: 98 },
      { kpi: 'Board Independence', value: '67', unit: '%', framework: 'GRI 2-9', page: 'p. 10', confidence: 100 },
      { kpi: 'Lost Time Injury Rate', value: '0.50', unit: '', framework: 'GRI 403-9', page: 'p. 30', confidence: 90 },
      { kpi: 'Community Investment', value: '7.4', unit: 'SAR M', framework: 'GRI 203-1', page: 'p. 59', confidence: 89 },
    ],
  },
  {
    id: 'ifrs2024',
    label: 'FY 2024 IFRS Disclosure',
    period: 'FY 2024',
    framework: 'IFRS',
    rows: [
      { kpi: 'AUM', value: '84.2', unit: 'SAR B', framework: 'IFRS 7', page: 'p. 14', confidence: 100 },
      { kpi: 'Total Return (gross)', value: '18.4', unit: '%', framework: 'IFRS 9', page: 'p. 18', confidence: 99 },
      { kpi: 'Net Profit', value: '412', unit: 'SAR M', framework: 'IAS 1', page: 'p. 8', confidence: 100 },
      { kpi: 'EBITDA Margin', value: '40.5', unit: '%', framework: 'IAS 1', page: 'p. 9', confidence: 98 },
      { kpi: 'Sharpe Ratio', value: '1.84', unit: '', framework: 'IFRS 7', page: 'p. 22', confidence: 94 },
      { kpi: 'Leverage Ratio', value: '1.42', unit: '×', framework: 'IFRS 7', page: 'p. 24', confidence: 96 },
      { kpi: 'Sector Concentration', value: '40.1', unit: '%', framework: 'IFRS 7', page: 'p. 28', confidence: 93 },
      { kpi: 'Dividend per Unit', value: '0.84', unit: 'SAR', framework: 'IAS 33', page: 'p. 31', confidence: 100 },
      { kpi: 'Operating Cash Flow', value: '538', unit: 'SAR M', framework: 'IAS 7', page: 'p. 12', confidence: 99 },
      { kpi: 'Total Assets', value: '102.4', unit: 'SAR B', framework: 'IAS 1', page: 'p. 6', confidence: 100 },
    ],
  },
  {
    id: 'q3-2024',
    label: 'Q3 2024 Interim',
    period: 'Q3 2024',
    framework: 'IFRS',
    rows: [
      { kpi: 'AUM', value: '79.8', unit: 'SAR B', framework: 'IFRS 7', page: 'p. 4', confidence: 100 },
      { kpi: 'YTD Return (gross)', value: '13.1', unit: '%', framework: 'IFRS 9', page: 'p. 6', confidence: 98 },
      { kpi: 'Net Profit (Q3)', value: '108', unit: 'SAR M', framework: 'IAS 34', page: 'p. 3', confidence: 100 },
      { kpi: 'EBITDA Margin', value: '39.2', unit: '%', framework: 'IAS 34', page: 'p. 3', confidence: 97 },
      { kpi: 'Sharpe Ratio (rolling)', value: '1.71', unit: '', framework: 'IFRS 7', page: 'p. 9', confidence: 92 },
      { kpi: 'Leverage Ratio', value: '1.48', unit: '×', framework: 'IFRS 7', page: 'p. 10', confidence: 95 },
      { kpi: 'Sector Concentration', value: '38.6', unit: '%', framework: 'IFRS 7', page: 'p. 11', confidence: 91 },
    ],
  },
];

function confidenceBadge(c: number) {
  if (c >= 95) return 'b-gn';
  if (c >= 90) return 'b-bl';
  if (c >= 85) return 'b-am';
  return 'b-rd';
}

function renderKpiRows(rows: Kpi[]) {
  return rows.map((k, i) => (
    <div
      key={k.name}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '13px 0',
        borderBottom: i < rows.length - 1 ? '1px solid #ECEEF8' : 'none',
      }}
    >
      <span style={{ fontSize: 12, color: '#1A1D2E', fontWeight: 500, flex: 1 }}>{k.name}</span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          fontFamily: "'DM Mono',monospace",
          color: k.valueColor ?? '#1A1D2E',
          marginLeft: 12,
        }}
      >
        {k.value}
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          fontFamily: "'DM Mono',monospace",
          marginLeft: 14,
          width: 60,
          textAlign: 'right',
          color: changeColor[k.sentiment],
        }}
      >
        {k.change}
      </span>
    </div>
  ));
}

export default function KPIPage() {
  const [activeReportId, setActiveReportId] = useState<string>(reportTabs[0].id);
  const [page, setPage] = useState(1);

  const activeReport = useMemo(
    () => reportTabs.find((r) => r.id === activeReportId) ?? reportTabs[0],
    [activeReportId],
  );

  const totalRows = activeReport.rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, totalRows);
  const visibleRows = activeReport.rows.slice(startIdx, endIdx);

  const handleTabClick = (id: string) => {
    setActiveReportId(id);
    setPage(1);
  };

  return (
    <div>
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
        <button className="btn bp">Export</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="card">
          <div className="ch">
            <div className="ct">ESG Performance KPIs</div>
            <span className="badge b-gn">GRI 2021</span>
          </div>
          <div style={{ padding: '4px 18px 12px' }}>{renderKpiRows(esgKpis)}</div>
        </div>

        <div className="card">
          <div className="ch">
            <div className="ct">Financial Performance KPIs</div>
            <span className="badge b-bl">IFRS</span>
          </div>
          <div style={{ padding: '4px 18px 12px' }}>{renderKpiRows(finKpis)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="ch">
          <div className="ct">AI Insights</div>
          <span className="badge b-pp">AI Powered</span>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              background: '#EEEEFF',
              border: '1px solid rgba(64,64,200,.18)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#4040C8',
                flexShrink: 0,
                marginTop: 5,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#3535B5', marginBottom: 3 }}>
                Sector Concentration Breach
              </div>
              <div style={{ fontSize: 11.5, color: '#5A6080', lineHeight: 1.55 }}>
                Technology exposure at 40.1% exceeds SAMA 35% limit. Recommend rebalancing by Q2
                2025. Consider divesting SAR 4.3B in tech holdings to avoid formal regulatory action.
              </div>
            </div>
          </div>

          <div
            style={{
              background: '#F0FDF4',
              border: '1px solid rgba(34,197,94,.25)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#22C55E',
                flexShrink: 0,
                marginTop: 5,
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#15803D', marginBottom: 3 }}>
                Strong ESG Trajectory
              </div>
              <div style={{ fontSize: 11.5, color: '#5A6080', lineHeight: 1.55 }}>
                ESG score improved +4 pts YoY. Resolving 3 missing metrics (Carbon Intensity, Board
                Size, Executive Pay Ratio) could add +27 pts — placing Al-Noor in top quartile of
                GCC fund managers.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="ch" style={{ flexWrap: 'nowrap' }}>
          <div className="ct">Extracted Values by Report</div>
          <span style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>
            {totalRows} metrics · {activeReport.framework}
          </span>
        </div>

        <div
          style={{
            padding: '12px 18px 0',
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            borderBottom: '1px solid #ECEEF8',
          }}
        >
          {reportTabs.map((r) => {
            const isActive = r.id === activeReportId;
            return (
              <button
                key={r.id}
                onClick={() => handleTabClick(r.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px 10px 0 0',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #4040C8' : '2px solid transparent',
                  background: isActive ? '#EEEEFF' : 'transparent',
                  color: isActive ? '#4040C8' : '#5A6080',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: '.15s',
                  marginBottom: -1,
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ECEEF8' }}>
                  {['KPI', 'Value', 'Unit', 'Framework Ref', 'Source', 'Confidence'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        textAlign: i === 1 || i === 5 ? 'right' : 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#5A6080',
                        textTransform: 'uppercase',
                        letterSpacing: '.6px',
                        padding: '10px 12px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, i) => (
                  <tr
                    key={`${row.kpi}-${i}`}
                    style={{ borderBottom: i < visibleRows.length - 1 ? '1px solid #F2F3FA' : 'none' }}
                  >
                    <td style={{ padding: '12px', color: '#1A1D2E', fontWeight: 500 }}>{row.kpi}</td>
                    <td
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontFamily: "'DM Mono',monospace",
                        fontWeight: 700,
                        color: '#1A1D2E',
                      }}
                    >
                      {row.value}
                    </td>
                    <td style={{ padding: '12px', color: '#5A6080' }}>{row.unit || '—'}</td>
                    <td style={{ padding: '12px', color: '#5A6080' }}>{row.framework}</td>
                    <td style={{ padding: '12px', color: '#5A6080' }}>{row.page}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <span className={`badge ${confidenceBadge(row.confidence)}`}>
                        {row.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
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
              Showing <strong style={{ color: '#1A1D2E' }}>{startIdx + 1}–{endIdx}</strong> of{' '}
              <strong style={{ color: '#1A1D2E' }}>{totalRows}</strong>
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="btn bs bsm"
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ opacity: safePage === 1 ? 0.5 : 1, cursor: safePage === 1 ? 'not-allowed' : 'pointer' }}
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
        </div>
      </div>
    </div>
  );
}
