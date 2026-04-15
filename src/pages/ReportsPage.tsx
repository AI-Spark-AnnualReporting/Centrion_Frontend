export default function ReportsPage() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div><h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Reports</h2><p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>ESG, Annual, Quarterly & Sustainability</p></div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className="tab act">ESG & Sustainability</button>
          <button className="tab">Annual</button>
          <button className="tab">Quarterly</button>
          <button className="tab">Sustainability</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {[
          { title: 'ESG Sustainability Report', period: 'FY 2025 · GRI 2021 · IFRS S1/S2', score: 78, env: 82, soc: 74, gov: 79, metrics: '33/36', gaps: '3 gaps', date: 'Apr 12, 2025', gradient: 'linear-gradient(135deg,#3535B5,#4747CC)' },
          { title: 'Mid-Year ESG Review', period: 'H1 2025 · GRI 2021 · SAMA', score: 74, env: 78, soc: 70, gov: 75, metrics: '31/36', gaps: '5 gaps', date: 'Jul 8, 2024', gradient: 'linear-gradient(135deg,#059669,#10B981)' },
          { title: 'Annual ESG Report 2024', period: 'FY 2024 · GRI 2021 · TCFD', score: 74, env: 76, soc: 71, gov: 73, metrics: '30/36', gaps: '6 gaps', date: 'Apr 5, 2024', gradient: 'linear-gradient(135deg,#7C3AED,#8B5CF6)' },
        ].map((r, i) => (
          <div key={i} className="esg-rpt-card">
            <div style={{ background: r.gradient, padding: 18, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', marginBottom: 6 }}>{r.period}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{r.title}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{r.score}</span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>OVERALL</span>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.2)', borderRadius: 2, overflow: 'hidden', marginLeft: 8 }}><div style={{ width: `${r.score}%`, height: '100%', background: 'rgba(255,255,255,.6)', borderRadius: 2 }} /></div>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.6)' }}>{r.score}/100</span>
              </div>
            </div>
            <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-around' }}>
              {[{ label: 'ENV', val: r.env, color: '#22C55E' }, { label: 'SOC', val: r.soc, color: '#0891B2' }, { label: 'GOV', val: r.gov, color: '#7C3AED' }].map((p) => (
                <div key={p.label} style={{ textAlign: 'center' }}><div style={{ fontSize: 18, fontWeight: 800, color: p.color, fontFamily: "'DM Mono',monospace" }}>{p.val}</div><div style={{ fontSize: 9, color: '#9BA3C4', fontWeight: 700, textTransform: 'uppercase' }}>{p.label}</div></div>
              ))}
            </div>
            <div style={{ padding: '8px 18px 12px', borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
              <span style={{ color: '#4040C8', fontWeight: 700 }}>{r.metrics} metrics</span>
              <span style={{ color: '#EF4444', fontWeight: 700 }}>{r.gaps}</span>
              <span style={{ color: '#9BA3C4' }}>Generated {r.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
