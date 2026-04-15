export default function KPIPage() {
  const kpis = [
    { name: 'Scope 1 GHG Emissions', value: '1,842', unit: 'tCO₂e', change: '-8.2%', up: false },
    { name: 'Scope 2 GHG Emissions', value: '3,210', unit: 'tCO₂e', change: '-4.1%', up: false },
    { name: 'Total Energy Consumed', value: '24,180', unit: 'MWh', change: '-6.3%', up: false },
    { name: 'Water Recycled', value: '22', unit: '%', change: '+3.4%', up: true },
    { name: 'Total Employees (FTE)', value: '2,847', unit: 'FTE', change: '+12.1%', up: true },
    { name: 'Saudization Rate', value: '68.4', unit: '%', change: '+2.4%', up: true },
    { name: 'Gender Diversity', value: '38.2', unit: '%', change: '+4.1%', up: true },
    { name: 'Board Independence', value: '67', unit: '%', change: '0%', up: true },
    { name: 'Anti-Corruption Training', value: '100', unit: '%', change: '0%', up: true },
    { name: 'Lost Time Injury Rate', value: '0.42', unit: '', change: '-0.08', up: false },
  ];
  return (
    <div>
      <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>KPI Normalizer</h2><p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>Normalized ESG metrics across frameworks</p></div>
      <div className="card">
        <div className="ch"><div className="ct">All KPIs</div><span className="badge b-gn">New</span></div>
        <div style={{ padding: '4px 18px' }}>
          {kpis.map((k, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < kpis.length - 1 ? '1px solid #ECEEF8' : 'none' }}>
              <span style={{ fontSize: 12, color: '#1A1D2E', fontWeight: 500, flex: 1 }}>{k.name}</span>
              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "'DM Mono',monospace", marginLeft: 12, color: '#1A1D2E' }}>{k.value} {k.unit}</span>
              <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 8, width: 48, textAlign: 'right', color: k.change.startsWith('+') || k.change === '0%' ? '#22C55E' : '#EF4444' }}>{k.change}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
