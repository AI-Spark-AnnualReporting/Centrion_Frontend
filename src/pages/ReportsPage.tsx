import { useEffect, useRef, useState } from 'react';
import { getSectors } from '@/lib/api';
import type { Sector } from '@/types/company';
import { GeneratingScreen } from '@/components/reports/GeneratingScreen';

const ACCEPTED_UPLOAD_EXT = ['.pdf', '.docx', '.txt', '.csv', '.xlsx'] as const;
const ACCEPTED_UPLOAD_ATTR = ACCEPTED_UPLOAD_EXT.join(',');

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_UPLOAD_EXT.some((ext) => lower.endsWith(ext));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const reportData = [
  { title: 'ESG Sustainability Report', period: 'FY 2025 · GRI 2021 · IFRS S1/S2', score: 78, env: 82, soc: 74, gov: 79, metrics: '33/36', gaps: '3 gaps', date: 'Apr 12, 2025', gradient: 'linear-gradient(135deg,#3535B5,#4747CC)', frameworks: ['GRI 2021', 'IFRS S1/S2', 'SAMA', 'TCFD'], confidence: 91.7, company: 'Al-Noor Capital' },
  { title: 'Mid-Year ESG Review', period: 'H1 2025 · GRI 2021 · SAMA', score: 74, env: 78, soc: 70, gov: 75, metrics: '31/36', gaps: '5 gaps', date: 'Jul 8, 2024', gradient: 'linear-gradient(135deg,#059669,#10B981)', frameworks: ['GRI 2021', 'SAMA'], confidence: 87.2, company: 'Al-Noor Capital' },
  { title: 'Annual ESG Report 2024', period: 'FY 2024 · GRI 2021 · TCFD', score: 74, env: 76, soc: 71, gov: 73, metrics: '30/36', gaps: '6 gaps', date: 'Apr 5, 2024', gradient: 'linear-gradient(135deg,#7C3AED,#8B5CF6)', frameworks: ['GRI 2021', 'TCFD'], confidence: 85.1, company: 'Al-Noor Capital' },
];

const envMetrics = [
  { code: 'GRI 305-1', name: 'Scope 1 GHG Emissions', value: '1,842', unit: 'tCO₂e', status: 'found' },
  { code: 'GRI 305-2', name: 'Scope 2 GHG (market)', value: '3,218', unit: 'tCO₂e', status: 'found' },
  { code: 'GRI 305-4', name: 'Carbon Intensity', value: 'Missing', unit: 'tCO₂/M', status: 'missing' },
  { code: 'GRI 302-1', name: 'Total Energy Consumed', value: '24,180', unit: 'MWh', status: 'found' },
  { code: 'GRI 302-4', name: 'Energy Reduction', value: '8.4%', unit: '', status: 'found' },
  { code: 'GRI 303-3', name: 'Water Recycled', value: '22%', unit: '', status: 'found' },
  { code: 'GRI 306-3', name: 'Waste Generated', value: '142', unit: 'tonnes', status: 'found' },
  { code: 'GRI 301-1', name: 'Materials Used', value: '18.4%', unit: 'recov.', status: 'found' },
  { code: 'GRI 304-1', name: 'Biodiversity Impact', value: 'Low', unit: '', status: 'found' },
  { code: 'GRI 305-3', name: 'Scope 3 GHG Emissions', value: 'Missing', unit: 'tCO₂e', status: 'missing' },
];

const socMetrics = [
  { code: 'GRI 401-1', name: 'Total Employees (FTE)', value: '2,847', unit: 'FTE', status: 'found' },
  { code: 'HRDP', name: 'Saudization Rate', value: '68.4%', unit: '', status: 'found' },
  { code: 'GRI 405-1', name: 'Gender Diversity', value: '38.2%', unit: 'women', status: 'found' },
  { code: 'GRI 403-9', name: 'Lost Time Injury Rate', value: '0.42', unit: '', status: 'found' },
  { code: 'GRI 404-1', name: 'Training Hours / Employee', value: '42', unit: 'hrs', status: 'found' },
  { code: 'GRI 401-3', name: 'Parental Leave Return Rate', value: '94%', unit: '', status: 'found' },
  { code: 'GRI 406-1', name: 'Discrimination Incidents', value: '0', unit: '', status: 'found' },
  { code: 'GRI 413-1', name: 'Community Engagement', value: 'SAR 4.2M', unit: '', status: 'found' },
  { code: 'GRI 418-1', name: 'Data Privacy Breaches', value: '0', unit: '', status: 'found' },
  { code: 'GRI 407-1', name: 'Freedom of Association', value: 'Full', unit: '', status: 'found' },
  { code: 'GRI 201-1', name: 'Community Investment SAR', value: 'Missing', unit: '', status: 'missing' },
];

const govMetrics = [
  { code: 'GRI 2-9', name: 'Board Independence', value: '67%', unit: '', status: 'found' },
  { code: 'GRI 2-9', name: 'Board Size', value: 'Missing', unit: '', status: 'missing' },
  { code: 'GRI 2-18', name: 'Board Evaluation', value: 'Annual', unit: '', status: 'found' },
  { code: 'GRI 2-24', name: 'Commitments Embedded', value: 'Yes', unit: '', status: 'found' },
  { code: 'CMA 14', name: 'Women on Board', value: '2/5', unit: '40%', status: 'found' },
  { code: 'GRI 205-1', name: 'Anti-Corruption Policy', value: '100%', unit: '', status: 'found' },
  { code: 'GRI 206-1', name: 'Anti-Competitive Cases', value: '0', unit: '', status: 'found' },
  { code: 'GRI 207-1', name: 'Tax Transparency', value: 'Full', unit: '', status: 'found' },
  { code: 'GRI 2-30', name: 'Collective Bargaining', value: 'N/A', unit: '', status: 'found' },
  { code: 'GRI 2-21', name: 'Executive Pay Ratio', value: 'Missing', unit: '', status: 'missing' },
];

const missingMetrics = [
  { title: 'Carbon Intensity (GRI 305-4)', category: 'Environmental · GRI 300 Series · IFRS S2 Physical', desc: 'Investors require carbon intensity ratio to benchmark emissions efficiency. Without this metric, TCFD Physical Risk alignment is incomplete and ISSB S2 compliance cannot be confirmed. This metric is mandatory for top-quartile GCC ESG ratings.', impact: '+12 pts', severity: 'CRITICAL' },
  { title: 'Board Size (GRI 2-9)', category: 'Governance · GRI 200 Series · CMA CGR Article 14', desc: 'CMA Corporate Governance Regulations Article 14 mandates disclosure of board composition. Missing this metric creates a CMA compliance gap and directly reduces Governance pillar score. Required for all listed entities on Tadawul.', impact: '+9 pts', severity: 'CRITICAL' },
  { title: 'Executive Pay Ratio (GRI 2-21)', category: 'Governance · GRI 200 Series · SAMA ESG Framework', desc: 'CEO-to-median-pay ratio is an increasingly demanded metric by ESG-focused investors including GPIF and BlackRock. Absence signals governance opacity. Required for SAMA ESG framework Pillar 3 compliance by 2026.', impact: '+6 pts', severity: 'HIGH' },
];

const globalFrameworks = ['GRI 2021', 'IFRS S1', 'IFRS S2'];

const regionData: Record<string, { countries: string[]; frameworks: Record<string, string[]> }> = {
  'Middle East': {
    countries: ['Saudi Arabia', 'UAE', 'Qatar', 'Bahrain', 'Oman', 'Kuwait', 'Jordan'],
    frameworks: {
      'Saudi Arabia': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'SAMA ESG', 'CMA CGR', 'SGI', 'SASB'],
      'UAE': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'ADX ESG', 'SCA Guidelines', 'SASB'],
      'Qatar': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'QSE ESG', 'SASB'],
      'Bahrain': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'CBB ESG', 'SASB'],
      'Oman': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'CMA Oman ESG', 'SASB'],
      'Kuwait': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'CMA Kuwait', 'SASB'],
      'Jordan': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'JSC ESG', 'SASB'],
    },
  },
  'Europe': {
    countries: ['United Kingdom', 'Germany', 'France', 'Netherlands', 'Sweden', 'Switzerland'],
    frameworks: {
      'United Kingdom': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'UK SDR', 'FCA ESG', 'SASB'],
      'Germany': ['GRI 2021', 'IFRS S1/S2', 'CSRD', 'EU Taxonomy', 'SFDR', 'SASB'],
      'France': ['GRI 2021', 'IFRS S1/S2', 'CSRD', 'EU Taxonomy', 'SFDR', 'Article 29'],
      'Netherlands': ['GRI 2021', 'IFRS S1/S2', 'CSRD', 'EU Taxonomy', 'SFDR', 'SASB'],
      'Sweden': ['GRI 2021', 'IFRS S1/S2', 'CSRD', 'EU Taxonomy', 'SFDR', 'SASB'],
      'Switzerland': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'Swiss CO Ordinance', 'SASB'],
    },
  },
  'Asia Pacific': {
    countries: ['Singapore', 'Hong Kong', 'Japan', 'Australia', 'India', 'South Korea'],
    frameworks: {
      'Singapore': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'SGX Core ESG', 'SASB'],
      'Hong Kong': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'HKEX ESG', 'SASB'],
      'Japan': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'SSBJ Standards', 'SASB'],
      'Australia': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'ASRS Standards', 'SASB'],
      'India': ['GRI 2021', 'IFRS S1/S2', 'BRSR', 'SEBI ESG', 'SASB'],
      'South Korea': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'KSSB Standards', 'SASB'],
    },
  },
  'Africa': {
    countries: ['South Africa', 'Nigeria', 'Kenya', 'Egypt', 'Morocco'],
    frameworks: {
      'South Africa': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'King IV', 'JSE ESG', 'SASB'],
      'Nigeria': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'NGX ESG', 'SASB'],
      'Kenya': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'NSE ESG', 'SASB'],
      'Egypt': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'EGX ESG', 'SASB'],
      'Morocco': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'AMMC ESG', 'SASB'],
    },
  },
  'Americas': {
    countries: ['United States', 'Canada', 'Brazil', 'Mexico', 'Chile'],
    frameworks: {
      'United States': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'SEC Climate', 'SASB', 'CDP'],
      'Canada': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'CSSB Standards', 'SASB', 'CDP'],
      'Brazil': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'CVM ESG', 'SASB'],
      'Mexico': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'BMV ESG', 'SASB'],
      'Chile': ['GRI 2021', 'IFRS S1/S2', 'TCFD', 'CMF ESG', 'SASB'],
    },
  },
};

const regions = Object.keys(regionData);

function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="4" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={size * 0.34} fontWeight="800" fontFamily="'DM Mono',monospace" style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>{score}</text>
    </svg>
  );
}

function MetricRow({ m }: { m: typeof envMetrics[0] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #ECEEF8', fontSize: 11, gap: 8 }}>
      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: m.code.startsWith('GRI') ? '#4040C8' : m.code === 'HRDP' ? '#059669' : '#7C3AED', background: m.code.startsWith('GRI') ? 'rgba(64,64,200,.08)' : m.code === 'HRDP' ? 'rgba(5,150,105,.08)' : 'rgba(124,58,237,.08)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{m.code}</span>
      <span style={{ flex: 1, color: '#1A1D2E', fontWeight: 500 }}>{m.name}</span>
      <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: m.status === 'missing' ? '#EF4444' : '#1A1D2E' }}>{m.value}</span>
      {m.unit && <span style={{ fontSize: 9, color: '#9BA3C4', marginLeft: 2 }}>{m.unit}</span>}
      {m.status === 'found' ? (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#22C55E" /><path d="M4 6.5l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#EF4444" /><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [expandedReport, setExpandedReport] = useState<number | null>(null);
  const [genOpen, setGenOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scope, setScope] = useState<'global' | 'regional'>('global');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [checkedFw, setCheckedFw] = useState<string[]>(globalFrameworks);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorsLoading, setSectorsLoading] = useState(true);
  const [selectedSectorId, setSelectedSectorId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    if (!hasAcceptedExtension(file.name)) {
      setUploadError(`Unsupported file type. Allowed: ${ACCEPTED_UPLOAD_EXT.join(', ')}`);
      return;
    }
    setUploadError(null);
    setUploadedFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0] ?? undefined);
    // Reset so selecting the same file again re-fires onChange.
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0] ?? undefined);
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const clearUploadedFile = () => {
    setUploadedFile(null);
    setUploadError(null);
  };

  useEffect(() => {
    getSectors()
      .then((data) => setSectors(data))
      .catch(() => setSectors([]))
      .finally(() => setSectorsLoading(false));
  }, []);

  const toggleFw = (fw: string) => setCheckedFw(prev => prev.includes(fw) ? prev.filter(f => f !== fw) : [...prev, fw]);

  const handleScopeChange = (newScope: 'global' | 'regional') => {
    setScope(newScope);
    // Upload is only allowed in global scope — clear any prior file on switch.
    if (newScope !== 'global') {
      setUploadedFile(null);
      setUploadError(null);
      setIsDragging(false);
    }
    if (newScope === 'global') {
      setSelectedRegion('');
      setSelectedCountry('');
      setCheckedFw(globalFrameworks);
    } else {
      setCheckedFw([]);
    }
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedCountry('');
    setCheckedFw([]);
  };

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    if (selectedRegion && regionData[selectedRegion]?.frameworks[country]) {
      setCheckedFw(regionData[selectedRegion].frameworks[country]);
    }
  };

  const availableCountries = selectedRegion ? regionData[selectedRegion]?.countries || [] : [];
  const availableFrameworks = scope === 'global'
    ? globalFrameworks
    : (selectedCountry && selectedRegion ? regionData[selectedRegion]?.frameworks[selectedCountry] || [] : []);

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

      {isGenerating ? (
        <GeneratingScreen
          onComplete={() => setIsGenerating(false)}
          onCancel={() => setIsGenerating(false)}
        />
      ) : (
      <>

      {/* Generate New ESG Report — collapsible */}
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', cursor: 'pointer', borderBottom: genOpen ? '1px solid #ECEEF8' : 'none' }} onClick={() => setGenOpen(!genOpen)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4040C8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>Generate New ESG Report</div>
              <div style={{ fontSize: 11, color: '#5A6080' }}>Configure parameters & upload source documents</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>AI Powered</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: genOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '.2s' }}><path d="M3 5l4 4 4-4" stroke="#5A6080" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
        </div>
        {genOpen && (
          <div style={{ padding: '18px 20px' }}>
            {/* Row 1: Reporting Year, Industry Sector (from live API) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <label className="fl-label">Reporting Year</label>
                <select className="inp sel">
                  <option>FY 2025</option>
                  <option>FY 2024</option>
                  <option>FY 2023</option>
                </select>
              </div>
              <div>
                <label className="fl-label">Industry Sector</label>
                {/* Selection is disabled for now — user can open the list to preview
                    all sectors, but none are pickable. Wire onChange + remove option
                    disables when the generate flow is ready. */}
                <select
                  className="inp sel"
                  value={selectedSectorId}
                  onChange={(e) => setSelectedSectorId(e.target.value)}
                >
                  {sectorsLoading ? (
                    <option value="" disabled>Loading sectors…</option>
                  ) : (
                    <>
                      <option value="">None</option>
                      {sectors.map((s) => (
                        <option key={s.id} value={s.id} disabled>
                          {s.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
            </div>

            {/* Row 2: Scope + conditional Region/Country */}
            <div style={{ display: 'grid', gridTemplateColumns: scope === 'regional' ? '1fr 1fr 1fr' : '1fr', gap: 12, marginBottom: 18 }}>
              <div>
                <label className="fl-label">Report Scope</label>
                <select className="inp sel" value={scope} onChange={e => handleScopeChange(e.target.value as 'global' | 'regional')}>
                  <option value="global">Global</option>
                  <option value="regional">Regional</option>
                </select>
              </div>
              {scope === 'regional' && (
                <>
                  <div>
                    <label className="fl-label">Region</label>
                    {/* Selection disabled for now — options visible as preview only. */}
                    <select className="inp sel" value={selectedRegion} onChange={e => handleRegionChange(e.target.value)}>
                      <option value="">None</option>
                      {regions.map(r => <option key={r} value={r} disabled>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="fl-label">Country</label>
                    {/* Selection disabled for now — options visible as preview only. */}
                    <select className="inp sel" value={selectedCountry} onChange={e => handleCountryChange(e.target.value)}>
                      <option value="">None</option>
                      {Object.values(regionData).flatMap(r => r.countries).map(c => (
                        <option key={c} value={c} disabled>{c}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* ESG Frameworks — dynamic based on scope */}
            <div style={{ marginBottom: 18 }}>
              <label className="fl-label">ESG Frameworks {scope === 'regional' && selectedCountry && <span style={{ fontWeight: 400, textTransform: 'none', color: '#4040C8' }}>· {selectedCountry}</span>}</label>
              {availableFrameworks.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(availableFrameworks.length, 5)},1fr)`, gap: 8, marginTop: 5 }}>
                  {availableFrameworks.map(fw => {
                    // In global scope, IFRS S1 / IFRS S2 are preview-only for now.
                    const isDisabled = scope === 'global' && (fw === 'IFRS S1' || fw === 'IFRS S2');
                    return (
                      <label
                        key={fw}
                        className={`fw-chip ${checkedFw.includes(fw) ? 'sel' : ''}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 12px',
                          opacity: isDisabled ? 0.5 : 1,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                        title={isDisabled ? 'Not available yet' : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={checkedFw.includes(fw)}
                          onChange={() => toggleFw(fw)}
                          disabled={isDisabled}
                          style={{ accentColor: '#4040C8' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1D2E' }}>{fw}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div style={{ padding: '14px', background: '#F2F3FA', borderRadius: 10, fontSize: 12, color: '#9BA3C4', marginTop: 5 }}>
                  {scope === 'regional' ? 'Select a region and country to see applicable frameworks' : 'No frameworks available'}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 18 }}>
              <label className="fl-label">
                Upload Source Document <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>{' '}
                <span style={{ fontWeight: 400, textTransform: 'none', color: '#9BA3C4' }}>
                  (PDF, DOCX, TXT, CSV, XLSX — one file)
                </span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_UPLOAD_ATTR}
                onChange={handleFileInputChange}
                disabled={scope !== 'global'}
                style={{ display: 'none' }}
              />
              {uploadedFile ? (
                <div
                  className="upload-z"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '14px 16px',
                    borderColor: '#4040C8',
                    background: 'rgba(64,64,200,.04)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke="#4040C8" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M12 2v4h4" stroke="#4040C8" strokeWidth="1.5" strokeLinejoin="round" />
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {uploadedFile.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>{formatBytes(uploadedFile.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    style={{ fontSize: 11, fontWeight: 600, color: '#4040C8', background: 'transparent', border: 0, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={clearUploadedFile}
                    aria-label="Remove file"
                    title="Remove file"
                    style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: '#9BA3C4' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={scope === 'global' ? 0 : -1}
                  aria-disabled={scope !== 'global'}
                  onClick={scope === 'global' ? openFilePicker : undefined}
                  onKeyDown={(e) => {
                    if (scope !== 'global') return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openFilePicker();
                    }
                  }}
                  onDragOver={(e) => {
                    if (scope !== 'global') return;
                    e.preventDefault();
                    if (!isDragging) setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={scope === 'global' ? handleDrop : (e) => e.preventDefault()}
                  className="upload-z"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '16px 20px',
                    cursor: scope === 'global' ? 'pointer' : 'not-allowed',
                    opacity: scope === 'global' ? 1 : 0.55,
                    borderColor: isDragging && scope === 'global' ? '#4040C8' : undefined,
                    background: isDragging && scope === 'global' ? 'rgba(64,64,200,.06)' : undefined,
                  }}
                  title={scope === 'global' ? undefined : 'Upload is only available in Global scope'}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 7l4-4 4 4" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" /><path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  <span style={{ fontSize: 12, color: '#5A6080' }}>
                    {scope === 'global'
                      ? 'Click to upload or drag & drop annual report, HR data, financial statements'
                      : 'Upload is only available in Global scope'}
                  </span>
                </div>
              )}
              {uploadError && (
                <div style={{ fontSize: 11, color: '#E5484D', marginTop: 6 }} role="alert">{uploadError}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {/* Enabled only for Global scope + uploaded source document for now. */}
              {(() => {
                const canGenerate = scope === 'global' && uploadedFile !== null;
                const disabledReason =
                  scope !== 'global'
                    ? 'Regional generation is not available yet'
                    : 'Upload a source document to continue';
                return (
                  <button
                    type="button"
                    disabled={!canGenerate}
                    className="btn bp"
                    title={canGenerate ? undefined : disabledReason}
                    style={{
                      padding: '11px 24px',
                      fontSize: 13,
                      fontWeight: 700,
                      borderRadius: 10,
                      border: 'none',
                      background: '#4040C8',
                      color: '#fff',
                      cursor: canGenerate ? 'pointer' : 'not-allowed',
                      opacity: canGenerate ? 1 : 0.55,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" /></svg>
                    Generate Report
                  </button>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Report cards — hidden for now; will render real reports from API later. */}
      {/*
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 14 }}>
        {reportData.map((r, i) => (
          <div key={i} className="esg-rpt-card" onClick={() => setExpandedReport(expandedReport === i ? null : i)}>
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
              {[{ label: 'ENV', val: r.env, color: '#22C55E' }, { label: 'SOC', val: r.soc, color: '#0891B2' }, { label: 'GOV', val: r.gov, color: '#7C3AED' }].map(p => (
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
      */}

      {/* Expanded Report Detail View */}
      {expandedReport !== null && (
        <div style={{ marginTop: 18 }}>
          {(() => {
            const r = reportData[expandedReport];
            const metricsFound = parseInt(r.metrics.split('/')[0]);
            const metricsTotal = parseInt(r.metrics.split('/')[1]);
            const gapsCount = parseInt(r.gaps);
            return (
              <>
                {/* Header bar */}
                <div style={{ background: 'linear-gradient(135deg,#1A1D2E,#2D3154)', borderRadius: 14, padding: '18px 22px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <ScoreRing score={r.score} size={52} />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, background: '#22C55E', color: '#fff', padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>★ Report Generated</span>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>ESG Sustainability Report — {r.period.split('·')[0].trim()}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>{r.company} · {metricsFound} of {metricsTotal} metrics disclosed · Confidence {r.confidence}%</div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                        {r.frameworks.map(fw => (
                          <span key={fw} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)' }}>{fw}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '10px 18px', border: '1px solid rgba(255,255,255,.1)' }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                      <div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#22C55E' }}>{metricsFound}</div></div>
                      <div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#EF4444' }}>{gapsCount}</div></div>
                    </div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Disclosed &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Gaps</div>
                  </div>
                </div>

                {/* Three pillar sections */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
                  {/* Environmental */}
                  <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0' }}>
                    <div style={{ background: 'linear-gradient(135deg,#065F46,#059669)', padding: '14px 16px', color: '#fff' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .7, marginBottom: 2 }}>🌿 Environmental</div>
                      <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1, marginBottom: 8 }}>{r.env}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>10<br /><span style={{ fontSize: 8, opacity: .6 }}>FOUND</span></span>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>2<br /><span style={{ fontSize: 8, opacity: .6 }}>MISSING</span></span>
                        <span style={{ flex: 2, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>83%<br /><span style={{ fontSize: 8, opacity: .6 }}>COVERAGE</span></span>
                      </div>
                    </div>
                    <div style={{ padding: '8px 14px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>GRI 300 Series Metrics</div>
                      {envMetrics.map((m, i) => <MetricRow key={i} m={m} />)}
                    </div>
                  </div>

                  {/* Social */}
                  <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0' }}>
                    <div style={{ background: 'linear-gradient(135deg,#0369A1,#0891B2)', padding: '14px 16px', color: '#fff' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .7, marginBottom: 2 }}>👥 Social</div>
                      <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1, marginBottom: 8 }}>{r.soc}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>11<br /><span style={{ fontSize: 8, opacity: .6 }}>FOUND</span></span>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>1<br /><span style={{ fontSize: 8, opacity: .6 }}>MISSING</span></span>
                        <span style={{ flex: 2, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>92%<br /><span style={{ fontSize: 8, opacity: .6 }}>COVERAGE</span></span>
                      </div>
                    </div>
                    <div style={{ padding: '8px 14px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>GRI 400 Series Metrics</div>
                      {socMetrics.map((m, i) => <MetricRow key={i} m={m} />)}
                    </div>
                  </div>

                  {/* Governance */}
                  <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0' }}>
                    <div style={{ background: 'linear-gradient(135deg,#4C1D95,#7C3AED)', padding: '14px 16px', color: '#fff' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .7, marginBottom: 2 }}>🏛 Governance</div>
                      <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1, marginBottom: 8 }}>{r.gov}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>9<br /><span style={{ fontSize: 8, opacity: .6 }}>FOUND</span></span>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>2<br /><span style={{ fontSize: 8, opacity: .6 }}>MISSING</span></span>
                        <span style={{ flex: 2, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>75%<br /><span style={{ fontSize: 8, opacity: .6 }}>COVERAGE</span></span>
                      </div>
                    </div>
                    <div style={{ padding: '8px 14px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>GRI 200 / CMA CGR Metrics</div>
                      {govMetrics.map((m, i) => <MetricRow key={i} m={m} />)}
                    </div>
                  </div>
                </div>

                {/* Missing Metrics — Impact Analysis */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>Missing Metrics — Impact Analysis</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>{gapsCount} critical gaps · ~27 pts potential</span>
                  </div>
                  {missingMetrics.map((mm, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #E2E4F0', borderLeft: `4px solid ${mm.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B'}`, borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>{mm.title}</div>
                          <div style={{ fontSize: 10, color: '#5A6080' }}>{mm.category}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>{mm.impact}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: mm.severity === 'CRITICAL' ? '#EF4444' : '#F59E0B', color: '#fff' }}>{mm.severity}</span>
                        </div>
                      </div>
                      <p style={{ fontSize: 11, color: '#5A6080', lineHeight: 1.5, marginBottom: 10 }}>{mm.desc}</p>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer' }}>Generate Question</button>
                        <button style={{ padding: '5px 12px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid #E2E4F0', background: '#fff', color: '#1A1D2E', cursor: 'pointer' }}>View Template</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
