export function DashboardFinancial() {
  return (
    <div>
      {/* Financial KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total Revenue', value: 'SAR 149B', change: '↑ 6.2% vs 2024', up: true, color: '#4040C8' },
          { label: 'Net Profit', value: 'SAR 9.4B', change: '↓ 3.1% vs 2024', up: false, color: '#EF4444' },
          { label: 'AUM', value: 'SAR 84.2B', change: '↑ 12.3% vs 2024', up: true, color: '#22C55E' },
          { label: 'ESG Investment', value: 'SAR 4.2M', change: '↑ Community invest.', up: true, color: '#7C3AED' },
        ].map((kpi, i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid #E2E4F0', borderRadius: 14, padding: '16px 18px', borderTop: `3px solid ${kpi.color}`, boxShadow: '0 2px 8px rgba(64,64,200,.07)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>{kpi.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.6px', lineHeight: 1, marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: kpi.up ? '#22C55E' : '#EF4444' }}>{kpi.change}</div>
          </div>
        ))}
      </div>

      {/* Revenue + Profit + KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* Revenue Growth */}
        <div className="card">
          <div className="ch">
            <div><div className="ct">Revenue Growth 2020–2025</div><div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>SAR Billions</div></div>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#22C55E', background: 'rgba(34,197,94,.1)', padding: '3px 9px', borderRadius: 20 }}>+6.2% YoY</span>
          </div>
          <div style={{ padding: '16px 18px 10px' }}>
            <svg width="100%" height="140" viewBox="0 0 340 140" preserveAspectRatio="xMidYMax meet">
              <line x1="0" y1="0" x2="340" y2="0" stroke="#ECEEF8" strokeWidth="1" />
              <line x1="0" y1="35" x2="340" y2="35" stroke="#ECEEF8" strokeWidth="1" />
              <line x1="0" y1="70" x2="340" y2="70" stroke="#ECEEF8" strokeWidth="1" />
              <line x1="0" y1="105" x2="340" y2="105" stroke="#ECEEF8" strokeWidth="1" />
              <line x1="0" y1="140" x2="340" y2="140" stroke="#E2E4F0" strokeWidth="1" />
              <rect x="22" y="63" width="32" height="77" rx="4" fill="#E8EAF5" />
              <rect x="76" y="57" width="32" height="83" rx="4" fill="#E8EAF5" />
              <rect x="130" y="49" width="32" height="91" rx="4" fill="#BFBFF8" />
              <rect x="184" y="41" width="32" height="99" rx="4" fill="#8484E8" opacity=".65" />
              <rect x="238" y="28" width="32" height="112" rx="4" fill="#6060D8" />
              <rect x="292" y="21" width="32" height="119" rx="4" fill="#4040C8" />
              <text x="38" y="152" textAnchor="middle" fontSize="9" fill="#9BA3C4">2020</text>
              <text x="92" y="152" textAnchor="middle" fontSize="9" fill="#9BA3C4">2021</text>
              <text x="146" y="152" textAnchor="middle" fontSize="9" fill="#9BA3C4">2022</text>
              <text x="200" y="152" textAnchor="middle" fontSize="9" fill="#9BA3C4">2023</text>
              <text x="254" y="152" textAnchor="middle" fontSize="9" fill="#9BA3C4">2024</text>
              <text x="308" y="152" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4040C8">2025</text>
            </svg>
          </div>
        </div>

        {/* Profitability Trend */}
        <div className="card">
          <div className="ch"><div><div className="ct">Profitability Trend</div><div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>Net Profit & Margin %</div></div></div>
          <div style={{ padding: '16px 18px 8px' }}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.4px', lineHeight: 1 }}>SAR 9.4B</div><div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>Net Profit FY 2025</div></div>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.4px', lineHeight: 1 }}>6.3%</div><div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>Net Margin</div></div>
            </div>
            <svg width="100%" height="90" viewBox="0 0 240 90" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
              <defs><linearGradient id="pgrd2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4040C8" stopOpacity=".15" /><stop offset="100%" stopColor="#4040C8" stopOpacity="0" /></linearGradient></defs>
              <path d="M0,43 L48,35 L96,27 L144,11 L192,11 L240,17 L240,90 L0,90 Z" fill="url(#pgrd2)" />
              <polyline points="0,43 48,35 96,27 144,11 192,11 240,17" fill="none" stroke="#4040C8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="240" cy="17" r="4" fill="#4040C8" stroke="white" strokeWidth="2" />
              <polyline points="0,63 48,53 96,45 144,30 192,33 240,43" fill="none" stroke="#EF4444" strokeWidth="1.8" strokeDasharray="5,3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#5A6080' }}><div style={{ width: 10, height: 3, background: '#4040C8', borderRadius: 2 }} />Net Profit</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#5A6080' }}><div style={{ width: 10, height: 2, background: '#EF4444', borderRadius: 2 }} />Margin %</div>
            </div>
          </div>
        </div>

        {/* Key Financial KPIs */}
        <div className="card">
          <div className="ch"><div className="ct">Key Financial KPIs</div><span className="badge b-or">IFRS</span></div>
          <div style={{ padding: '8px 16px' }}>
            {[
              { name: 'AUM (SAR B)', value: '84.2', change: '+12.3%', up: true },
              { name: 'Total Return', value: '18.4%', change: '+4.2pp', up: true, valueColor: '#22C55E' },
              { name: 'EBITDA Margin', value: '40.5%', change: '+1.3pp', up: true },
              { name: 'Sharpe Ratio', value: '1.84', change: '+0.33', up: true },
              { name: 'Tech Concentration', value: '40.1%', change: 'Breach', up: false, valueColor: '#EF4444' },
            ].map((kpi, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < 4 ? '1px solid #ECEEF8' : 'none' }}>
                <span style={{ fontSize: 12, color: '#5A6080', fontWeight: 500 }}>{kpi.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: kpi.valueColor || '#1A1D2E' }}>{kpi.value}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: kpi.up ? '#22C55E' : '#EF4444', background: kpi.up ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', padding: '1px 6px', borderRadius: 4 }}>{kpi.change}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
