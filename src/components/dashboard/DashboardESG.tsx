export function DashboardESG() {
  return (
    <div>
      {/* Hero */}
      <div style={{ background: '#3535B5', borderRadius: 20, padding: '24px 28px', marginBottom: 16, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 24, alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: 80, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(100,116,255,.2),transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -60, left: 60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,197,94,.08),transparent 70%)', pointerEvents: 'none' }} />

        {/* Score ring */}
        <div style={{ position: 'relative', width: 90, height: 90, flexShrink: 0 }}>
          <svg width="90" height="90" viewBox="0 0 90 90" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="45" cy="45" r="37" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="6" />
            <circle cx="45" cy="45" r="37" fill="none" stroke="#818CF8" strokeWidth="6" strokeDasharray="232.5" strokeDashoffset="51.2" strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', lineHeight: 1 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono',monospace", display: 'block' }}>78</span>
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.4px' }}>/100</span>
          </div>
        </div>

        {/* Hero text */}
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 20, background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.25)', fontSize: 9, fontWeight: 700, color: '#86EFAC', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 9 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#86EFAC', animation: 'dpulse 2.5s infinite' }} />
            Strong performance · Q4 on track
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 5, letterSpacing: '-.2px' }}>Al-Noor Capital — FY 2025 ESG Report</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', lineHeight: 1.7, marginBottom: 8 }}>33 of 36 metrics disclosed · Confidence 91.7% · 3 critical gaps identified</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {[
              { label: 'ENV', score: 82, bg: 'rgba(34,197,94,.15)', border: 'rgba(34,197,94,.2)', dot: '#4ADE80', labelColor: '#86EFAC' },
              { label: 'SOC', score: 74, bg: 'rgba(20,184,166,.15)', border: 'rgba(20,184,166,.2)', dot: '#5EEAD4', labelColor: '#99F6E4' },
              { label: 'GOV', score: 79, bg: 'rgba(139,92,246,.15)', border: 'rgba(139,92,246,.2)', dot: '#C4B5FD', labelColor: '#DDD6FE' },
            ].map((p) => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: p.bg, border: `1px solid ${p.border}`, borderRadius: 8, padding: '5px 10px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.dot }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: p.labelColor }}>{p.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono',monospace" }}>{p.score}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div style={{ minWidth: 240, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.28)', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 9 }}>Disclosure Timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { dot: '#4ADE80', text: 'Q3 Report filed — Tadawul', badge: 'Done', badgeBg: 'rgba(74,222,128,.15)', badgeColor: '#86EFAC' },
              { dot: '#F87171', text: 'Board pack Q4', date: 'Dec 11', badge: 'Urgent', badgeBg: 'rgba(248,113,113,.18)', badgeColor: '#FCA5A5' },
              { dot: '#818CF8', text: 'Annual report submission', date: 'Mar 31' },
              { dot: '#FCD34D', text: 'AGM notice deadline', date: 'Mar 25' },
              { dot: 'rgba(255,255,255,.2)', text: 'Sustainability report', date: 'May 30', dim: true },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.dot, flexShrink: 0 }} />
                <span style={{ fontSize: 10.5, color: item.dim ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.6)' }}>{item.text}</span>
                {item.date && <span style={{ fontSize: 9, color: item.dim ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.28)', marginLeft: 'auto' }}>{item.date}</span>}
                {item.badge && <span style={{ fontSize: 9, background: item.badgeBg, color: item.badgeColor, padding: '1px 7px', borderRadius: 3, fontWeight: 700, marginLeft: item.date ? 4 : 'auto' }}>{item.badge}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pillar Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14, marginBottom: 16 }}>
        {[
          { emoji: '🌿', label: 'Environmental', score: 82, found: 10, missing: 2, coverage: '83%', gradient: 'linear-gradient(135deg,#14532D,#16A34A)', codeColor: '#16A34A', metrics: [
            { code: 'GRI 305-1', name: 'Scope 1 GHG', value: '1,842 tCO₂e', ok: true },
            { code: 'GRI 305-2', name: 'Scope 2 GHG', value: '3,210 tCO₂e', ok: true },
            { code: 'GRI 305-4', name: 'Carbon Intensity', value: 'Missing', ok: false },
            { code: 'GRI 302-1', name: 'Energy Consumed', value: '24,180 MWh', ok: true },
            { code: 'GRI 303-3', name: 'Water Recycled', value: '22%', ok: true },
            { code: 'GRI 305-3', name: 'Scope 3 GHG', value: 'Missing', ok: false },
          ]},
          { emoji: '👥', label: 'Social', score: 74, found: 11, missing: 1, coverage: '92%', gradient: 'linear-gradient(135deg,#0C4A6E,#0891B2)', codeColor: '#0891B2', metrics: [
            { code: 'GRI 401-1', name: 'Total Employees', value: '2,847 FTE', ok: true },
            { code: 'HRDF', name: 'Saudization Rate', value: '68.4%', ok: true, warn: true },
            { code: 'GRI 405-1', name: 'Gender Diversity', value: '38.2% women', ok: true },
            { code: 'GRI 403-9', name: 'LTIR', value: '0.42', ok: true },
            { code: 'GRI 404-1', name: 'Training Hrs/FTE', value: '42 hrs', ok: true },
            { code: 'GRI 201-1', name: 'Community Invest.', value: 'Missing', ok: false },
          ]},
          { emoji: '🏛', label: 'Governance', score: 79, found: 9, missing: 2, coverage: '75%', gradient: 'linear-gradient(135deg,#4C1D95,#7C3AED)', codeColor: '#7C3AED', metrics: [
            { code: 'GRI 2-9', name: 'Board Independence', value: '67%', ok: true },
            { code: 'GRI 2-9', name: 'Board Size', value: 'Missing', ok: false },
            { code: 'CMA 14', name: 'Women on Board', value: '2/5 (40%)', ok: true },
            { code: 'GRI 205-1', name: 'Anti-Corruption', value: '100%', ok: true },
            { code: 'GRI 2-18', name: 'Board Evaluation', value: 'Annual', ok: true },
            { code: 'GRI 2-21', name: 'Exec Pay Ratio', value: 'Missing', ok: false },
          ]},
        ].map((pillar) => (
          <div key={pillar.label} className="card" style={{ overflow: 'hidden' }}>
            <div style={{ background: pillar.gradient, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>{pillar.emoji} {pillar.label}</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono',monospace", lineHeight: 1, marginBottom: 8 }}>{pillar.score}</div>
              <div style={{ display: 'flex', gap: 7 }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,.15)', borderRadius: 7, padding: 6, textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{pillar.found}</div><div style={{ fontSize: 8, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', marginTop: 2 }}>Found</div></div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,.1)', borderRadius: 7, padding: 6, textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 800, color: '#FCA5A5', fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{pillar.missing}</div><div style={{ fontSize: 8, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', marginTop: 2 }}>Missing</div></div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,.1)', borderRadius: 7, padding: 6, textAlign: 'center' }}><div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{pillar.coverage}</div><div style={{ fontSize: 8, color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', marginTop: 2 }}>Coverage</div></div>
              </div>
            </div>
            <div style={{ padding: '13px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 9 }}>Key Metrics</div>
              {pillar.metrics.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < pillar.metrics.length - 1 ? '1px solid #ECEEF8' : 'none', ...(m.ok ? {} : { background: 'rgba(239,68,68,.04)', margin: '0 -16px', padding: '7px 16px' }) }}>
                  <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "'DM Mono',monospace", color: m.ok ? pillar.codeColor : '#EF4444', width: 56, flexShrink: 0 }}>{m.code}</span>
                  <span style={{ fontSize: 11, color: '#1A1D2E', flex: 1, margin: '0 6px' }}>{m.name}</span>
                  {m.ok ? (
                    <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: (m as any).warn ? '#F59E0B' : undefined }}>{m.value}</span>
                  ) : (
                    <span style={{ fontSize: 10, color: '#9BA3C4', fontStyle: 'italic' }}>Missing</span>
                  )}
                  <span style={{ fontSize: 9, background: m.ok ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', color: m.ok ? '#16A34A' : '#DC2626', padding: '1px 6px', borderRadius: 4, fontWeight: 700, marginLeft: 6 }}>{m.ok ? '✓' : '!'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Framework Compliance + Gaps + Score Trend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
        {/* Framework Compliance */}
        <div className="card">
          <div className="ch"><div className="ct">Framework Compliance</div><button className="btn bs bsm">Full →</button></div>
          <div style={{ padding: '10px 16px' }}>
            {[
              { name: 'GRI Universal 2021', pct: 92, color: '#22C55E' },
              { name: 'IFRS S1/S2 (ISSB)', pct: 88, color: '#4040C8' },
              { name: 'TCFD Framework', pct: 61, color: '#F59E0B' },
              { name: 'SAMA ESG', pct: 88, color: '#22C55E' },
              { name: 'CMA CGR', pct: 93, color: '#7C3AED' },
              { name: 'Saudi Green Initiative', pct: 81, color: '#22C55E' },
            ].map((fw, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < 5 ? '1px solid #ECEEF8' : 'none' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: fw.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: '#5A6080', flex: 1 }}>{fw.name}</span>
                <div style={{ flex: 1, height: 5, background: '#E8EAF5', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${fw.pct}%`, height: '100%', background: fw.color, borderRadius: 3 }} /></div>
                <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: fw.color === '#F59E0B' ? '#B45309' : fw.color === '#7C3AED' ? '#7C3AED' : '#16A34A', width: 26, textAlign: 'right' }}>{fw.pct}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Critical Gaps */}
        <div className="card">
          <div className="ch"><div className="ct">Critical Gaps — Impact</div><span style={{ background: 'rgba(239,68,68,.1)', color: '#DC2626', fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>3 gaps · −27 pts</span></div>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'Carbon Intensity', impact: '−12 pts', desc: 'GRI 305-4 · TCFD Physical Risk · ISSB S2 required', color: '#EF4444' },
              { name: 'Board Size', impact: '−9 pts', desc: 'GRI 2-9 · CMA CGR Article 14 · Tadawul mandatory', color: '#EF4444' },
              { name: 'Exec Pay Ratio', impact: '−6 pts', desc: 'GRI 2-21 · SAMA ESG Pillar 3 · Investor demand', color: '#F59E0B' },
            ].map((gap, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${gap.color}`, borderRadius: '0 8px 8px 0', padding: '10px 12px', background: gap.color === '#EF4444' ? 'rgba(239,68,68,.05)' : 'rgba(245,158,11,.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>{gap.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, background: gap.color === '#EF4444' ? 'rgba(239,68,68,.12)' : 'rgba(245,158,11,.12)', color: gap.color === '#EF4444' ? '#DC2626' : '#B45309', padding: '2px 7px', borderRadius: 5 }}>{gap.impact}</span>
                </div>
                <div style={{ fontSize: 10, color: '#5A6080', lineHeight: 1.5 }}>{gap.desc}</div>
                <button className="btn bs bsm" style={{ marginTop: 7, fontSize: 10 }}>Generate Question</button>
              </div>
            ))}
          </div>
        </div>

        {/* Score Trend */}
        <div className="card">
          <div className="ch"><div className="ct">Score Trend & Benchmark</div><span style={{ fontSize: 11, fontWeight: 800, color: '#22C55E', background: 'rgba(34,197,94,.1)', padding: '3px 9px', borderRadius: 20 }}>+4 pts YoY</span></div>
          <div style={{ padding: '14px 18px 8px' }}>
            <svg width="100%" height="100" viewBox="0 0 220 100" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
              <defs><linearGradient id="sgrd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4040C8" stopOpacity=".15" /><stop offset="100%" stopColor="#4040C8" stopOpacity="0" /></linearGradient></defs>
              <line x1="0" y1="0" x2="220" y2="0" stroke="#ECEEF8" strokeWidth="1" />
              <line x1="0" y1="33" x2="220" y2="33" stroke="#ECEEF8" strokeWidth="1" />
              <line x1="0" y1="66" x2="220" y2="66" stroke="#ECEEF8" strokeWidth="1" />
              <line x1="0" y1="100" x2="220" y2="100" stroke="#E2E4F0" strokeWidth="1" />
              <path d="M0,70 L55,63 L110,50 L165,35 L220,22 L220,100 L0,100 Z" fill="url(#sgrd)" />
              <polyline points="0,70 55,63 110,50 165,35 220,22" fill="none" stroke="#4040C8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="220" cy="22" r="4" fill="#4040C8" stroke="white" strokeWidth="2" />
              <polyline points="0,65 55,58 110,52 165,42 220,38" fill="none" stroke="#9BA3C4" strokeWidth="1.5" strokeDasharray="4,3" strokeLinecap="round" />
            </svg>
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#5A6080' }}><div style={{ width: 10, height: 3, background: '#4040C8', borderRadius: 2 }} />Al-Noor</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#5A6080' }}><div style={{ width: 10, height: 2, background: '#9BA3C4', borderRadius: 2 }} />Peer Avg</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
