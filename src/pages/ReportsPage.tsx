import { useEffect, useRef, useState } from 'react';
import { getSectors, reports as reportsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Sector } from '@/types/company';
import type {
  CoverageIndicator,
  CoverageResponse,
  GenerateReportResponse,
} from '@/types/report';
import { GeneratingScreen } from '@/components/reports/GeneratingScreen';

interface ReportGenerationConfig {
  region?: string | null;
  sector_id?: string | null;
  country_id?: string | null;
  scope_type?: string;
  regulator_ids?: string[];
  framework_codes?: string[];
}

interface ReportSummary {
  id: string;
  period: string;
  generation_config?: ReportGenerationConfig;
}

interface ReportsListResponse {
  reports: ReportSummary[];
}

// Normalise API period strings like "FY-2026" → "FY 2026" for display.
function formatPeriod(period: string): string {
  return period.replace(/-/g, ' ').trim();
}

// Secondary picker for "+ Add new…" — current year ±10 → 21 options (year numbers only).
function yearPickerOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + 10; y >= current - 10; y--) years.push(y);
  return years;
}

const ADD_NEW_SENTINEL = '__add_new__';

// UI labels → backend framework codes for POST /api/v1/reports/{id}/generate.
function frameworkLabelToCode(label: string): string {
  if (label.startsWith('GRI')) return 'GRI';
  if (label === 'IFRS S1') return 'IFRS_S1';
  if (label === 'IFRS S2') return 'IFRS_S2';
  return label;
}

// Extract the 4-digit year from a period string like "FY-2026".
function yearFromPeriod(period: string): number | null {
  const m = period.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

// Coverage rendering helpers -------------------------------------------------
function indicatorDisplayValue(i: CoverageIndicator): string {
  if (i.status === 'NOT_DISCLOSED') return 'Missing';
  if (i.value !== null && i.value !== undefined) return String(i.value);
  if (i.text_value) return i.text_value;
  if (i.bool_value !== null) return i.bool_value ? 'Yes' : 'No';
  return '—';
}

// Display order: numeric values first, then booleans, then narratives,
// then everything else, and finally NOT_DISCLOSED (missing) at the end.
function indicatorSortRank(i: CoverageIndicator): number {
  if (i.status === 'NOT_DISCLOSED') return 4;
  if (i.value !== null && i.value !== undefined) return 0;
  if (i.bool_value !== null && i.bool_value !== undefined) return 1;
  if (i.text_value !== null && i.text_value !== undefined && i.text_value !== '') return 2;
  return 3;
}

function sortIndicators(list: CoverageIndicator[]): CoverageIndicator[] {
  return [...list].sort((a, b) => {
    const rankDiff = indicatorSortRank(a) - indicatorSortRank(b);
    if (rankDiff !== 0) return rankDiff;
    // Stable secondary order by source code for predictable display.
    return a.source_code.localeCompare(b.source_code, undefined, { numeric: true });
  });
}

function pillarBaseKey(p: string): 'E' | 'S' | 'G' | 'ESG' | 'OTHER' {
  if (p === 'E' || p === 'S' || p === 'G' || p === 'ESG') return p;
  return 'OTHER';
}

function coveragePercent(found: number, total: number): number {
  if (!total) return 0;
  return Math.round((found / total) * 100);
}

const PILLAR_STYLES: Record<
  'E' | 'S' | 'G' | 'ESG',
  { label: string; emoji: string; gradient: string; accent: string }
> = {
  E: {
    label: 'Environmental',
    emoji: '🌿',
    gradient: 'linear-gradient(135deg,#065F46,#059669)',
    accent: '#059669',
  },
  S: {
    label: 'Social',
    emoji: '👥',
    gradient: 'linear-gradient(135deg,#0369A1,#0891B2)',
    accent: '#0891B2',
  },
  G: {
    label: 'Governance',
    emoji: '🏛',
    gradient: 'linear-gradient(135deg,#4C1D95,#7C3AED)',
    accent: '#7C3AED',
  },
  ESG: {
    label: 'Universal (ESG)',
    emoji: '♻️',
    gradient: 'linear-gradient(135deg,#1E293B,#4040C8)',
    accent: '#4040C8',
  },
};

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
// Only GRI is wired for generation today — IFRS S1/S2 are visible but disabled
// and should not be pre-checked.
const defaultGlobalCheckedFrameworks = ['GRI 2021'];

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
  const [hasGenerated, setHasGenerated] = useState(false);
  const [coverage, setCoverage] = useState<CoverageResponse | null>(null);
  const [scope, setScope] = useState<'global' | 'regional'>('global');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [checkedFw, setCheckedFw] = useState<string[]>(defaultGlobalCheckedFrameworks);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorsLoading, setSectorsLoading] = useState(true);
  const [selectedSectorId, setSelectedSectorId] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // When an existing report is selected, user chooses between reloading from
  // the DB or attaching more documents to that report.
  const [existingReportSource, setExistingReportSource] =
    useState<'db' | 'upload'>('db');

  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const [existingReports, setExistingReports] = useState<ReportSummary[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState<boolean>(!!companyId);
  // Selecting an existing report puts the form into read-from-report mode;
  // picking "+ Add new…" + a year puts the form into create-new mode.
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [customYear, setCustomYear] = useState<number | null>(null);
  const [isAddingNewPeriod, setIsAddingNewPeriod] = useState<boolean>(false);

  const selectedReport =
    selectedReportId != null
      ? existingReports.find((r) => r.id === selectedReportId) ?? null
      : null;
  const selectedPeriod = selectedReport
    ? selectedReport.period
    : customYear != null
      ? `FY-${customYear}`
      : '';

  useEffect(() => {
    if (!companyId) {
      setExistingReports([]);
      setPeriodsLoading(false);
      setIsAddingNewPeriod(true);
      return;
    }

    let cancelled = false;
    setPeriodsLoading(true);
    reportsApi
      .list<ReportsListResponse>(companyId)
      .then((data) => {
        if (cancelled) return;
        const list = (data?.reports ?? []).filter((r) => r && r.period);
        list.sort((a, b) => b.period.localeCompare(a.period));
        setExistingReports(list);
        // If the company has no reports yet, jump straight to the year picker.
        setIsAddingNewPeriod(list.length === 0);
      })
      .catch(() => {
        if (!cancelled) {
          setExistingReports([]);
          setIsAddingNewPeriod(true);
        }
      })
      .finally(() => {
        if (!cancelled) setPeriodsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const applyReportToForm = (report: ReportSummary) => {
    const cfg = report.generation_config ?? {};
    setScope(cfg.scope_type === 'regional' ? 'regional' : 'global');
    setSelectedSectorId(cfg.sector_id ?? '');
    setCheckedFw(cfg.framework_codes ?? []);
    setSelectedRegion(cfg.region ?? '');
    // Country auto-fill skipped — our UI uses country names, API returns ids.
    setSelectedCountry('');
    setUploadedFile(null);
    setUploadError(null);
  };

  const resetFormForNewReport = () => {
    setScope('global');
    // Display-wise the sector stays "None"; submission still sends a real
    // sector_id (falls back to the first loaded sector) — see triggerGenerate.
    setSelectedSectorId('');
    setCheckedFw(defaultGlobalCheckedFrameworks);
    setSelectedRegion('');
    setSelectedCountry('');
    // Leave uploadedFile alone — user may have uploaded before choosing a year.
  };

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === ADD_NEW_SENTINEL) {
      setSelectedReportId(null);
      setIsAddingNewPeriod(true);
      return;
    }
    // User picked an existing report — auto-fill form; source defaults to DB.
    setCustomYear(null);
    setSelectedReportId(value);
    setExistingReportSource('db');
    const report = existingReports.find((r) => r.id === value);
    if (report) applyReportToForm(report);
  };

  const pickCustomYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const year = Number(e.target.value);
    if (!year) return;
    setSelectedReportId(null);
    setCustomYear(year);
    setIsAddingNewPeriod(false);
    resetFormForNewReport();
  };

  const cancelAddNewPeriod = () => {
    setIsAddingNewPeriod(false);
  };

  const clearCustomYear = () => {
    setCustomYear(null);
  };

  // Years already taken by an existing report — blocked in the year picker
  // so one ESG report per year is enforced.
  const usedYears = new Set<number>(
    existingReports
      .map((r) => yearFromPeriod(r.period))
      .filter((y): y is number => y != null),
  );

  // --- Report generation submission -----------------------------------------
  // The loading screen stays mounted for the full duration of the API call.
  // We ignore GeneratingScreen's own animation timer — transitions are driven
  // by the response from POST /api/v1/reports/{company_id}/generate.
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  const genRequestIdRef = useRef(0);

  const triggerGenerate = () => {
    if (!companyId || scope !== 'global') return;

    // Branch A — existing report + "Generate report from DB": skip /generate
    // and render the stored coverage directly. Loading screen stays up until
    // /coverage responds.
    if (selectedReport && existingReportSource === 'db') {
      const requestId = ++genRequestIdRef.current;
      setGenError(null);
      setGenWarning(null);
      setHasGenerated(false);
      setCoverage(null);
      setExpandedReport(null);
      setIsGenerating(true);

      reportsApi
        .getCoverage<CoverageResponse>(companyId, selectedReport.id)
        .then((cov) => {
          if (requestId !== genRequestIdRef.current) return;
          setCoverage(cov);
          setIsGenerating(false);
          setHasGenerated(true);
          setGenOpen(false);
          setExpandedReport(0);
        })
        .catch((err: unknown) => {
          if (requestId !== genRequestIdRef.current) return;
          setIsGenerating(false);
          setGenError(
            err instanceof Error ? err.message : 'Failed to load report from DB.',
          );
        });
      return;
    }

    // Branch B — new report: requires a year picked via "+ Add new…" + a file.
    if (customYear == null || selectedReport !== null || !uploadedFile) return;

    const requestId = ++genRequestIdRef.current;
    setGenError(null);
    setGenWarning(null);
    setHasGenerated(false);
    setCoverage(null);
    setExpandedReport(null);
    setIsGenerating(true);

    // The dropdown displays "None" by default, but the backend requires a
    // valid sector_id — fall back to the first loaded sector.
    const sectorIdForApi = selectedSectorId || sectors[0]?.id || '';

    // Captured inside the chain so we can surface it after /coverage resolves.
    let alreadyProcessedWarning: string | null = null;

    reportsApi
      .generate<GenerateReportResponse>(companyId, {
        files: [uploadedFile],
        year: customYear,
        sector_id: sectorIdForApi,
        scope_type: scope,
        report_type: 'esg',
        framework_codes: checkedFw.map(frameworkLabelToCode),
      })
      .then((gen) => {
        if (requestId !== genRequestIdRef.current) return null;
        if (!gen?.report_id) {
          throw new Error('Report generated but no report_id returned.');
        }

        // Detect files the backend skipped because they were already processed.
        const skipped = (gen.documents ?? []).filter(
          (d) => d.status === 'skipped' && d.reason === 'file already processed',
        );
        if (skipped.length > 0) {
          const names = skipped.map((d) => d.filename).join(', ');
          alreadyProcessedWarning =
            skipped.length === 1
              ? `"${names}" was already processed. Showing the existing report.`
              : `These documents were already processed: ${names}. Showing the existing report.`;
        }

        // Chain: pull the indicator coverage so we can render the detail view.
        return reportsApi.getCoverage<CoverageResponse>(companyId, gen.report_id);
      })
      .then((cov) => {
        if (cov == null) return;
        if (requestId !== genRequestIdRef.current) return;
        setCoverage(cov);
        setIsGenerating(false);
        setHasGenerated(true);
        setExpandedReport(0);
        if (alreadyProcessedWarning) {
          // Redirect the user back to the form so they see the explanation;
          // still render the returned report below.
          setGenWarning(alreadyProcessedWarning);
          setGenOpen(true);
          setUploadedFile(null);
        } else {
          setGenWarning(null);
          setGenOpen(false);
        }
      })
      .catch((err: unknown) => {
        if (requestId !== genRequestIdRef.current) return;
        setIsGenerating(false);
        setGenError(
          err instanceof Error ? err.message : 'Generation failed. Please try again.',
        );
      });
  };

  const handleGeneratingCancel = () => {
    // Bump the request id so the outstanding promise's callbacks become no-ops.
    genRequestIdRef.current += 1;
    setIsGenerating(false);
  };

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
      setCheckedFw(defaultGlobalCheckedFrameworks);
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
          // No-op — we stay on the loading screen until the API responds.
          onComplete={() => undefined}
          onCancel={handleGeneratingCancel}
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
                {periodsLoading ? (
                  <select className="inp sel" disabled>
                    <option>Loading reporting years…</option>
                  </select>
                ) : customYear != null ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    <div
                      className="inp sel"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <span style={{ fontWeight: 600, color: '#1A1D2E' }}>
                        {formatPeriod(`FY-${customYear}`)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#4040C8', textTransform: 'uppercase', letterSpacing: '.5px' }}>
                        New report
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearCustomYear}
                      aria-label="Change year"
                      title="Change year"
                      style={{
                        width: 38,
                        border: '1px solid #E5E7EF',
                        background: '#fff',
                        borderRadius: 8,
                        cursor: 'pointer',
                        color: '#5A6080',
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : isAddingNewPeriod ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                    <select
                      className="inp sel"
                      value=""
                      onChange={pickCustomYear}
                      style={{ flex: 1 }}
                    >
                      <option value="" disabled>Select year…</option>
                      {yearPickerOptions().map((y) => {
                        const taken = usedYears.has(y);
                        return (
                          <option key={y} value={y} disabled={taken}>
                            {taken ? `${y} — already has a report` : y}
                          </option>
                        );
                      })}
                    </select>
                    {existingReports.length > 0 && (
                      <button
                        type="button"
                        onClick={cancelAddNewPeriod}
                        aria-label="Cancel"
                        title="Cancel"
                        style={{
                          width: 38,
                          border: '1px solid #E5E7EF',
                          background: '#fff',
                          borderRadius: 8,
                          cursor: 'pointer',
                          color: '#5A6080',
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ) : (
                  <select
                    className="inp sel"
                    value={selectedReportId ?? ''}
                    onChange={handlePeriodChange}
                  >
                    <option value="" disabled>Select a reporting year…</option>
                    {existingReports.map((r) => (
                      <option key={r.id} value={r.id}>{formatPeriod(r.period)}</option>
                    ))}
                    <option value={ADD_NEW_SENTINEL}>+ Add new…</option>
                  </select>
                )}
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

            {selectedReport && (
              <div style={{ marginBottom: 18 }}>
                <label className="fl-label">Source</label>
                <select
                  className="inp sel"
                  value={existingReportSource}
                  onChange={(e) =>
                    setExistingReportSource(e.target.value as 'db' | 'upload')
                  }
                >
                  <option value="db">Generate report from DB</option>
                  <option value="upload">Upload new documents</option>
                </select>
              </div>
            )}
            <div
              style={{
                marginBottom: 18,
                // Hide the upload field when the user wants to use DB data only.
                display: selectedReport && existingReportSource === 'db' ? 'none' : undefined,
              }}
            >
              <label className="fl-label">
                Upload Source Document{!selectedReport && (
                  <>
                    {' '}
                    <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>
                  </>
                )}{' '}
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
            {genError && (
              <div
                role="alert"
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(229,72,77,.08)',
                  border: '1px solid rgba(229,72,77,.25)',
                  color: '#B33A3E',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {genError}
              </div>
            )}
            {genWarning && (
              <div
                role="status"
                style={{
                  marginBottom: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(245,158,11,.08)',
                  border: '1px solid rgba(245,158,11,.3)',
                  color: '#B4730B',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {genWarning}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {/* Enabled for either: a brand-new report (Global + file + year) or
                  an existing report in "Generate from DB" mode. Upload-new-
                  documents flow for existing reports is not wired yet. */}
              {(() => {
                const canGenerateNew =
                  scope === 'global' &&
                  selectedReport === null &&
                  customYear !== null &&
                  uploadedFile !== null;
                const canGenerateFromDb =
                  scope === 'global' &&
                  selectedReport !== null &&
                  existingReportSource === 'db';
                const canGenerate = canGenerateNew || canGenerateFromDb;
                const disabledReason =
                  scope !== 'global'
                    ? 'Regional generation is not available yet'
                    : selectedReport !== null && existingReportSource === 'upload'
                      ? 'Uploading new documents for an existing report is not available yet'
                      : selectedReport === null && customYear === null
                        ? 'Select a reporting year to continue'
                        : selectedReport === null && uploadedFile === null
                          ? 'Upload a source document to continue'
                          : undefined;
                return (
                  <button
                    type="button"
                    disabled={!canGenerate}
                    onClick={() => {
                      if (!canGenerate) return;
                      triggerGenerate();
                    }}
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

      {/* Generated-report detail view — driven by GET /.../coverage. */}
      {hasGenerated && coverage && (() => {
        const summary = coverage.summary;
        return (
          <div style={{ marginTop: 4 }}>
            {/* Header bar */}
            <div style={{ background: 'linear-gradient(135deg,#1A1D2E,#2D3154)', borderRadius: 14, padding: '18px 22px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <ScoreRing score={coveragePercent(summary.found_count, summary.total_indicators)} size={52} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, background: '#22C55E', color: '#fff', padding: '2px 8px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>★ Report Generated</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>
                    ESG Sustainability Report — {formatPeriod(coverage.period)}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                    {summary.found_count} of {summary.total_indicators} indicators disclosed · Disclosure rate {Math.round((summary.disclosure_rate || 0) * 100)}%
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                    {coverage.frameworks.map((fw) => (
                      <span key={fw} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,.15)', color: 'rgba(255,255,255,.8)' }}>{fw}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'center', background: 'rgba(255,255,255,.08)', borderRadius: 12, padding: '10px 18px', border: '1px solid rgba(255,255,255,.1)' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                  <div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#22C55E' }}>{summary.found_count}</div></div>
                  <div><div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'DM Mono',monospace", color: '#EF4444' }}>{summary.not_disclosed_count}</div></div>
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Disclosed &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Gaps</div>
              </div>
            </div>

            {/* Three pillar sections driven by coverage.indicators + by_pillar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
              {(['E', 'S', 'G'] as const).map((pk) => {
                const style = PILLAR_STYLES[pk];
                const p = summary.by_pillar?.[pk] ?? { total: 0, found: 0, partial: 0, not_disclosed: 0 };
                const coveragePct = coveragePercent(p.found, p.total);
                const score = coveragePct;
                // Narrative (text_block) indicators are rendered in the dedicated
                // "Narrative Disclosures" section below — hide them from pillar cards.
                const pillarIndicators = sortIndicators(
                  coverage.indicators.filter(
                    (i) => pillarBaseKey(i.pillar) === pk && i.data_type !== 'text_block',
                  ),
                );
                return (
                  <div key={pk} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0' }}>
                    <div style={{ background: style.gradient, padding: '14px 16px', color: '#fff' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .7, marginBottom: 2 }}>
                        {style.emoji} {style.label}
                      </div>
                      <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1, marginBottom: 8 }}>{score}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{p.found}<br /><span style={{ fontSize: 8, opacity: .6 }}>FOUND</span></span>
                        <span style={{ flex: 1, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{p.not_disclosed}<br /><span style={{ fontSize: 8, opacity: .6 }}>MISSING</span></span>
                        <span style={{ flex: 2, background: 'rgba(255,255,255,.2)', borderRadius: 4, padding: '4px 0', textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{coveragePct}%<br /><span style={{ fontSize: 8, opacity: .6 }}>COVERAGE</span></span>
                      </div>
                    </div>
                    <div style={{ padding: '8px 14px', maxHeight: 420, overflowY: 'auto' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                        {coverage.frameworks.join(' / ')} metrics
                      </div>
                      {pillarIndicators.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#9BA3C4', padding: '10px 0' }}>No indicators for this pillar.</div>
                      ) : (
                        pillarIndicators.map((ind) => {
                          const isFound = ind.status === 'FOUND';
                          const isMissing = ind.status === 'NOT_DISCLOSED';
                          return (
                            <div
                              key={ind.framework_indicator_id}
                              style={{ display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #ECEEF8', fontSize: 11, gap: 8 }}
                            >
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: '#4040C8', background: 'rgba(64,64,200,.08)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                {ind.framework} {ind.source_code}
                              </span>
                              <span style={{ flex: 1, color: '#1A1D2E', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ind.indicator_label}>
                                {ind.indicator_label}
                              </span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: isMissing ? '#EF4444' : '#1A1D2E' }}>
                                {indicatorDisplayValue(ind)}
                              </span>
                              {ind.unit && <span style={{ fontSize: 9, color: '#9BA3C4', marginLeft: 2 }}>{ind.unit}</span>}
                              {isFound ? (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#22C55E" /><path d="M4 6.5l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                              ) : isMissing ? (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#EF4444" /><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                              ) : (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#F59E0B" /><path d="M6.5 4v3M6.5 9v.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ESG (Universal) — full-width card, expanded layout */}
            {(() => {
              const pk = 'ESG' as const;
              const style = PILLAR_STYLES[pk];
              const p = summary.by_pillar?.[pk] ?? { total: 0, found: 0, partial: 0, not_disclosed: 0 };
              if (p.total === 0) return null;
              const coveragePct = coveragePercent(p.found, p.total);
              const score = coveragePct;
              // Narrative (text_block) indicators are rendered in the dedicated
              // "Narrative Disclosures" section below — hide them from this card.
              const pillarIndicators = sortIndicators(
                coverage.indicators.filter(
                  (i) => pillarBaseKey(i.pillar) === pk && i.data_type !== 'text_block',
                ),
              );
              return (
                <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0', marginBottom: 14 }}>
                  <div style={{ background: style.gradient, padding: '18px 22px', color: '#fff', display: 'flex', alignItems: 'center', gap: 24 }}>
                    <div style={{ flex: '0 0 auto' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .7, marginBottom: 2 }}>
                        {style.emoji} {style.label}
                      </div>
                      <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{score}</div>
                      <div style={{ fontSize: 10, opacity: .6, marginTop: 2 }}>Overall coverage</div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                      <span style={{ flex: 1, background: 'rgba(255,255,255,.15)', borderRadius: 6, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                        {p.found}<br /><span style={{ fontSize: 9, fontWeight: 700, opacity: .65, letterSpacing: '.5px' }}>FOUND</span>
                      </span>
                      <span style={{ flex: 1, background: 'rgba(255,255,255,.15)', borderRadius: 6, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                        {p.not_disclosed}<br /><span style={{ fontSize: 9, fontWeight: 700, opacity: .65, letterSpacing: '.5px' }}>MISSING</span>
                      </span>
                      <span style={{ flex: 2, background: 'rgba(255,255,255,.15)', borderRadius: 6, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 800 }}>
                        {coveragePct}%<br /><span style={{ fontSize: 9, fontWeight: 700, opacity: .65, letterSpacing: '.5px' }}>COVERAGE</span>
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
                      {coverage.frameworks.join(' / ')} universal indicators
                    </div>
                    {pillarIndicators.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#9BA3C4', padding: '10px 0' }}>No universal indicators for this report.</div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 20, rowGap: 0 }}>
                        {pillarIndicators.map((ind) => {
                          const isFound = ind.status === 'FOUND';
                          const isMissing = ind.status === 'NOT_DISCLOSED';
                          return (
                            <div
                              key={ind.framework_indicator_id}
                              style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #ECEEF8', fontSize: 11, gap: 8 }}
                            >
                              <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, fontWeight: 700, color: '#4040C8', background: 'rgba(64,64,200,.08)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                                {ind.framework} {ind.source_code}
                              </span>
                              <span style={{ flex: 1, color: '#1A1D2E', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ind.indicator_label}>
                                {ind.indicator_label}
                              </span>
                              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: isMissing ? '#EF4444' : '#1A1D2E' }}>
                                {indicatorDisplayValue(ind)}
                              </span>
                              {ind.unit && <span style={{ fontSize: 9, color: '#9BA3C4', marginLeft: 2 }}>{ind.unit}</span>}
                              {isFound ? (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#22C55E" /><path d="M4 6.5l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                              ) : isMissing ? (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#EF4444" /><path d="M4.5 4.5l4 4M8.5 4.5l-4 4" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" /></svg>
                              ) : (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5.5" fill="#F59E0B" /><path d="M6.5 4v3M6.5 9v.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" /></svg>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Narrative disclosures — every text_block indicator across all pillars. */}
            {(() => {
              const narratives = sortIndicators(
                coverage.indicators.filter((i) => i.data_type === 'text_block'),
              );
              if (narratives.length === 0) return null;
              return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4040C8' }} />
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>Narrative Disclosures</span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>
                      {narratives.length} {narratives.length === 1 ? 'indicator' : 'indicators'}
                    </span>
                  </div>
                  {narratives.map((nn) => {
                    const pk = pillarBaseKey(nn.pillar);
                    // Use the pillar label the indicator is rendered under, not the
                    // raw esg_category (which for GRI 200 series says "Economic" even
                    // though those indicators live under Governance).
                    const pillarLabel =
                      pk !== 'OTHER' ? PILLAR_STYLES[pk].label : nn.esg_category;
                    const pillarLabelForBody =
                      pk !== 'OTHER' ? PILLAR_STYLES[pk].label : 'overall';
                    const body =
                      nn.status === 'NOT_DISCLOSED'
                        ? `Not disclosed in the uploaded documents. Add evidence for this indicator to raise the ${pillarLabelForBody} pillar score.`
                        : nn.text_value && nn.text_value.trim().length > 0
                          ? nn.text_value
                          : 'Disclosed, but no narrative text was captured.';
                    return (
                      <div
                        key={nn.framework_indicator_id}
                        style={{ background: '#fff', border: '1px solid #E2E4F0', borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}
                      >
                        <div style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>
                            {nn.indicator_label}{' '}
                            <span style={{ fontSize: 10, color: '#9BA3C4', fontWeight: 600 }}>
                              ({nn.framework} {nn.source_code})
                            </span>
                          </div>
                          <div style={{ fontSize: 10, color: '#5A6080' }}>
                            {pillarLabel} · {nn.framework} · {nn.data_type.replace(/_/g, ' ')}
                          </div>
                        </div>
                        <p style={{ fontSize: 11, color: '#5A6080', lineHeight: 1.5, margin: 0 }}>
                          {body}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        );
      })()}
      </>
      )}
    </div>
  );
}
