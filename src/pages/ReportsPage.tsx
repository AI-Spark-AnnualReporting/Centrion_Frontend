import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSectors, lookups, reports as reportsApi } from '@/lib/api';
import {
  clearActivePipeline,
  loadActivePipeline,
  type ActivePipelineRecord,
} from '@/lib/active-pipeline';
import { useAuth } from '@/context/AuthContext';
import type { Sector } from '@/types/company';
import type {
  CountriesResponse,
  CountryLookup,
  RegionsResponse,
  RegulatorLookup,
  RegulatorsResponse,
} from '@/types/lookups';
import type { ProcessingPageState } from './ProcessingPage';

interface ReportGenerationConfig {
  region?: string | null;
  sector_id?: string | null;
  country_id?: string | null;
  scope_type?: string;
  regulator_ids?: string[];
  framework_codes?: string[];
  gri_scope?: 'standard' | 'full' | string | null;
}

interface ReportPillarCoverage {
  total: number;
  found: number;
  partial: number;
  not_disclosed: number;
  percentage: number;
}

interface ReportCoverage {
  percentage: number;
  metrics_total: number;
  metrics_disclosed: number;
  gaps: number;
  by_pillar?: Partial<Record<'E' | 'S' | 'G' | 'ESG', ReportPillarCoverage>>;
}

interface ReportRegulatorSummary {
  id?: string;
  code: string;
  full_name?: string;
}

interface ReportSummary {
  id: string;
  period: string;
  generation_config?: ReportGenerationConfig;
  title?: string;
  scope_type?: string;
  frameworks?: string[];
  regulators?: ReportRegulatorSummary[];
  generated_at?: string;
  coverage?: ReportCoverage;
}

interface ReportsListResponse {
  reports: ReportSummary[];
}

// Normalise API period strings like "FY-2026" → "FY 2026" for display.
function formatPeriod(period: string): string {
  return period.replace(/-/g, ' ').trim();
}

// "2026-04-26T07:47:38..." → "Apr 26, 2026" for the gallery card footer.
function formatGenDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Cycles through three brand-aligned gradients so consecutive cards look
// distinct without forcing per-report styling on the backend.
const REPORT_CARD_GRADIENTS = [
  'linear-gradient(135deg,#3535B5,#4747CC)',
  'linear-gradient(135deg,#059669,#10B981)',
  'linear-gradient(135deg,#7C3AED,#8B5CF6)',
] as const;

// Rough "3 min" / "2 h" humaniser for the resume-run banner.
function formatSince(timestampMs: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h`;
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
// IFRS currently maps to a single "IFRS" code — the option is disabled for
// generation today, so this mapping only matters when it's eventually wired up.
function frameworkLabelToCode(label: string): string {
  if (label.startsWith('GRI')) return 'GRI';
  if (label === 'IFRS') return 'IFRS';
  return label;
}

// Extract the 4-digit year from a period string like "FY-2026".
function yearFromPeriod(period: string): number | null {
  const m = period.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}


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

const globalFrameworks = ['GRI', 'IFRS'];
// Only GRI is wired for generation today — IFRS is visible but disabled
// and should not be pre-checked.
const defaultGlobalCheckedFrameworks = ['GRI'];

// Regions / countries / regulators are loaded from /api/v1/lookups/* — no
// hard-coded region map here.


export default function ReportsPage() {
  const [genOpen, setGenOpen] = useState(true);
  const [scope, setScope] = useState<'global' | 'regional'>('global');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [checkedFw, setCheckedFw] = useState<string[]>(defaultGlobalCheckedFrameworks);
  // Region / country / regulator data loaded from /api/v1/lookups/*.
  const [regions, setRegions] = useState<string[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [countries, setCountries] = useState<CountryLookup[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [regulators, setRegulators] = useState<RegulatorLookup[]>([]);
  const [regulatorsLoading, setRegulatorsLoading] = useState(false);
  // GRI indicator scope: "standard" → 85 indicators, "full" → all 128.
  const [griScope, setGriScope] = useState<'standard' | 'full'>('standard');
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

  // Populated from localStorage on mount when a pipeline run is still tracked
  // as active — lets the user resume watching it from /reports/processing.
  const [resumableRun, setResumableRun] = useState<ActivePipelineRecord | null>(
    null,
  );

  useEffect(() => {
    setResumableRun(loadActivePipeline());
  }, []);

  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const location = useLocation();
  const navigate = useNavigate();

  // Dashboard "Generate ESG Report" modal hands off a payload here. We show
  // the full-width loading screen and run the same generate → coverage chain
  // the rest of this page uses, then clear the router state.
  useEffect(() => {
    const state = location.state as
      | {
          pendingGenerate?: {
            year: number;
            sector_id?: string;
            scope_type: string;
            framework_codes: string[];
            gri_scope?: 'standard' | 'full';
            file: File;
          };
        }
      | null;
    const pending = state?.pendingGenerate;
    if (!pending || !companyId) return;

    const requestId = ++genRequestIdRef.current;
    setGenError(null);
    setGenWarning(null);
    setIsSubmittingGenerate(true);

    // Clear the router state early so a refresh of /reports doesn't re-fire
    // this effect with the same pendingGenerate payload.
    navigate(location.pathname, { replace: true, state: null });

    reportsApi
      .generate(companyId, {
        files: [pending.file],
        year: pending.year,
        ...(pending.sector_id ? { sector_id: pending.sector_id } : {}),
        scope_type: pending.scope_type,
        report_type: 'esg',
        framework_codes: pending.framework_codes,
        ...(pending.gri_scope ? { gri_scope: pending.gri_scope } : {}),
      })
      .then((handle) => {
        if (requestId !== genRequestIdRef.current) return;
        const processingState: ProcessingPageState = {
          runId: handle.runId,
          pollUrl: handle.pollUrl,
          reportId: handle.reportId,
          companyId,
          estimatedDurationSeconds: handle.estimatedDurationSeconds,
          fileName: pending.file.name,
          isExisting: handle.isExisting,
          conflictMessage: handle.message,
        };
        navigate('/reports/processing', { replace: true, state: processingState });
      })
      .catch((err: unknown) => {
        if (requestId !== genRequestIdRef.current) return;
        setIsSubmittingGenerate(false);
        setGenError(
          err instanceof Error ? err.message : 'Generation failed. Please try again.',
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, companyId]);


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
    setSelectedCountryId(cfg.country_id ?? '');
    setUploadedFile(null);
    setUploadError(null);
    // Mirror the report's stored GRI indicator scope onto the radio. Backend
    // values are "standard" or "full"; if it's null/undefined we treat the
    // report as having been generated against the full 128-indicator set.
    setGriScope(cfg.gri_scope === 'standard' ? 'standard' : 'full');
  };

  const resetFormForNewReport = () => {
    setScope('global');
    // Sector is optional on the backend — leaving the dropdown on "None"
    // omits sector_id from the request entirely.
    setSelectedSectorId('');
    setCheckedFw(defaultGlobalCheckedFrameworks);
    setSelectedRegion('');
    setSelectedCountryId('');
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
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  // True from click → /reports/processing navigation. Lets us disable the
  // submit button during the POST without changing the visible screen.
  const [isSubmittingGenerate, setIsSubmittingGenerate] = useState(false);
  const genRequestIdRef = useRef(0);

  const triggerGenerate = () => {
    if (!companyId) return;

    // Branch A — existing report + "Generate report from DB": just open the
    // detail page, which fetches /coverage on its own.
    if (selectedReport && existingReportSource === 'db') {
      navigate(`/reports/${selectedReport.id}`);
      return;
    }

    // Branch C — existing report + "Upload new documents": POST files to
    // /reports/{company_id}/{report_id}/documents. The backend reads year,
    // sector, frameworks, and regulators from the report's stored
    // generation_config, so the form values on this page are ignored — the
    // only input is the file(s). Response shape and polling handoff match
    // Branch B.
    if (
      selectedReport &&
      existingReportSource === 'upload' &&
      uploadedFile
    ) {
      const requestId = ++genRequestIdRef.current;
      setGenError(null);
      setGenWarning(null);
      setIsSubmittingGenerate(true);
      const submittedFile = uploadedFile;
      const targetReportId = selectedReport.id;

      reportsApi
        .addDocuments(companyId, targetReportId, {
          files: [submittedFile],
        })
        .then((handle) => {
          if (requestId !== genRequestIdRef.current) return;
          const processingState: ProcessingPageState = {
            runId: handle.runId,
            pollUrl: handle.pollUrl,
            // The backend may or may not echo reportId in the 202 envelope;
            // fall back to the report we uploaded against so /coverage can be
            // fetched on completion.
            reportId: handle.reportId ?? targetReportId,
            companyId,
            estimatedDurationSeconds: handle.estimatedDurationSeconds,
            fileName: submittedFile.name,
            isExisting: handle.isExisting,
            conflictMessage: handle.message,
          };
          navigate('/reports/processing', { state: processingState });
        })
        .catch((err: unknown) => {
          if (requestId !== genRequestIdRef.current) return;
          setIsSubmittingGenerate(false);
          setGenError(
            err instanceof Error ? err.message : 'Upload failed. Please try again.',
          );
        });
      return;
    }

    // Branch B — new report: requires a year picked via "+ Add new…" + a file.
    if (customYear == null || selectedReport !== null || !uploadedFile) return;

    const requestId = ++genRequestIdRef.current;
    setGenError(null);
    setGenWarning(null);
    setIsSubmittingGenerate(true);

    const submittedFile = uploadedFile;

    const griSelected = checkedFw.some((fw) => fw.startsWith('GRI'));

    // Forward region / country / regulator picks only when the user is on the
    // regional flow — the global flow ignores them.
    const regionalExtras: {
      region?: string;
      country_id?: string;
      regulator_ids?: string[];
    } =
      scope === 'regional'
        ? {
            ...(selectedRegion ? { region: selectedRegion } : {}),
            ...(selectedCountryId ? { country_id: selectedCountryId } : {}),
            // The chip set is keyed on regulator.code, so map each checked code
            // back to its regulator id for the API.
            ...(checkedFw.length > 0
              ? {
                  regulator_ids: regulators
                    .filter((r) => checkedFw.includes(r.code))
                    .map((r) => r.id),
                }
              : {}),
          }
        : {};

    reportsApi
      .generate(companyId, {
        files: [submittedFile],
        year: customYear,
        ...(selectedSectorId ? { sector_id: selectedSectorId } : {}),
        scope_type: scope,
        report_type: 'esg',
        framework_codes: checkedFw.map(frameworkLabelToCode),
        ...(griSelected ? { gri_scope: griScope } : {}),
        ...regionalExtras,
      })
      .then((handle) => {
        if (requestId !== genRequestIdRef.current) return;
        const processingState: ProcessingPageState = {
          runId: handle.runId,
          pollUrl: handle.pollUrl,
          reportId: handle.reportId,
          companyId,
          estimatedDurationSeconds: handle.estimatedDurationSeconds,
          fileName: submittedFile.name,
          isExisting: handle.isExisting,
          conflictMessage: handle.message,
        };
        // Don't reset isSubmittingGenerate — the component unmounts on
        // navigate anyway, and keeping it true prevents a flash of an
        // re-enabled button in the frame before navigation commits.
        navigate('/reports/processing', { state: processingState });
      })
      .catch((err: unknown) => {
        if (requestId !== genRequestIdRef.current) return;
        setIsSubmittingGenerate(false);
        setGenError(
          err instanceof Error ? err.message : 'Generation failed. Please try again.',
        );
      });
  };

  // Click on a Recent Report card → open the dedicated detail page, which
  // handles its own coverage fetch and back-navigation.
  const handleReportCardClick = (report: ReportSummary) => {
    navigate(`/reports/${report.id}`);
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

  // Load regions once on mount.
  useEffect(() => {
    let cancelled = false;
    setRegionsLoading(true);
    lookups
      .regions<RegionsResponse>()
      .then((res) => {
        if (cancelled) return;
        setRegions(res.regions ?? []);
      })
      .catch(() => {
        if (!cancelled) setRegions([]);
      })
      .finally(() => {
        if (!cancelled) setRegionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load countries whenever the user picks (or clears) a region.
  useEffect(() => {
    if (!selectedRegion) {
      setCountries([]);
      return;
    }
    let cancelled = false;
    setCountriesLoading(true);
    lookups
      .countries<CountriesResponse>(selectedRegion)
      .then((res) => {
        if (cancelled) return;
        setCountries(res.countries ?? []);
      })
      .catch(() => {
        if (!cancelled) setCountries([]);
      })
      .finally(() => {
        if (!cancelled) setCountriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRegion]);

  // Load regulators whenever the user picks (or clears) a country. Each
  // regulator's `code` (ADX, CBB, CMA, …) becomes one ESG-framework chip.
  // When an existing report is selected the chips stay locked to its saved
  // framework_codes so we don't auto-overwrite them here.
  useEffect(() => {
    if (!selectedCountryId) {
      setRegulators([]);
      return;
    }
    let cancelled = false;
    setRegulatorsLoading(true);
    lookups
      .regulators<RegulatorsResponse>(selectedCountryId)
      .then((res) => {
        if (cancelled) return;
        const list = res.regulators ?? [];
        setRegulators(list);
        if (selectedReportId === null) {
          // Auto-check every regulator code for this country.
          setCheckedFw(list.map((r) => r.code));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRegulators([]);
          if (selectedReportId === null) setCheckedFw([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRegulatorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCountryId, selectedReportId]);

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
      setSelectedCountryId('');
      setCheckedFw(defaultGlobalCheckedFrameworks);
    } else {
      setCheckedFw([]);
    }
  };

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedCountryId('');
    setCheckedFw([]);
  };

  const handleCountryChange = (countryId: string) => {
    setSelectedCountryId(countryId);
    // Frameworks are populated by the regulators useEffect once it finishes
    // loading for the chosen country.
  };

  const availableFrameworks: string[] = scope === 'global'
    ? globalFrameworks
    : regulators.map((r) => r.code);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div><h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Reports</h2><p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>ESG, Annual, Quarterly & Sustainability</p></div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className="tab act">ESG & Sustainability</button>
          {/* Other report types hidden until they're wired up.
          <button className="tab">Annual</button>
          <button className="tab">Quarterly</button>
          <button className="tab">Sustainability</button>
          */}
        </div>
      </div>

      {resumableRun && (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 10,
            background: 'rgba(64,64,200,.06)',
            border: '1px solid rgba(64,64,200,.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, fontSize: 12, color: '#1A1D2E' }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              A report is still processing
            </div>
            <div style={{ color: '#5A6080' }}>
              {resumableRun.fileName
                ? `"${resumableRun.fileName}" — started ${formatSince(resumableRun.savedAt)} ago.`
                : `Started ${formatSince(resumableRun.savedAt)} ago.`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              clearActivePipeline();
              setResumableRun(null);
            }}
            style={{
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: '#5A6080',
              background: 'transparent',
              border: '1px solid #E2E4F0',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={() => {
              navigate('/reports/processing', {
                state: {
                  runId: resumableRun.runId,
                  pollUrl: resumableRun.pollUrl,
                  reportId: resumableRun.reportId,
                  companyId: resumableRun.companyId,
                  estimatedDurationSeconds: resumableRun.estimatedDurationSeconds,
                  fileName: resumableRun.fileName,
                  isExisting: true,
                },
              });
            }}
            style={{
              padding: '6px 14px',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              background: '#4040C8',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Resume watching
          </button>
        </div>
      )}

      {/* Generate New ESG Report — collapsible */}
      <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', cursor: 'pointer', borderBottom: genOpen ? '1px solid #ECEEF8' : 'none' }} onClick={() => setGenOpen(!genOpen)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4040C8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>Validate ESG Report</div>
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
                <select
                  className="inp sel"
                  value={selectedSectorId}
                  onChange={(e) => setSelectedSectorId(e.target.value)}
                  disabled={selectedReport !== null}
                >
                  {sectorsLoading ? (
                    <option value="" disabled>Loading sectors…</option>
                  ) : (
                    <>
                      <option value="">None</option>
                      {sectors.map((s) => (
                        <option key={s.id} value={s.id}>
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
                <select
                  className="inp sel"
                  value={scope}
                  onChange={e => handleScopeChange(e.target.value as 'global' | 'regional')}
                  disabled={selectedReport !== null}
                >
                  <option value="global">Global</option>
                  <option value="regional">Regional</option>
                </select>
              </div>
              {scope === 'regional' && (
                <>
                  <div>
                    <label className="fl-label">Region</label>
                    <select
                      className="inp sel"
                      value={selectedRegion}
                      onChange={e => handleRegionChange(e.target.value)}
                      disabled={selectedReport !== null || regionsLoading}
                    >
                      <option value="">{regionsLoading ? 'Loading regions…' : 'None'}</option>
                      {regions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="fl-label">Country</label>
                    <select
                      className="inp sel"
                      value={selectedCountryId}
                      onChange={e => handleCountryChange(e.target.value)}
                      disabled={selectedReport !== null || !selectedRegion || countriesLoading}
                    >
                      <option value="">
                        {!selectedRegion
                          ? 'Pick a region first'
                          : countriesLoading
                            ? 'Loading countries…'
                            : 'None'}
                      </option>
                      {countries.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {/* ESG Frameworks — dynamic based on scope */}
            <div style={{ marginBottom: 18 }}>
              <label className="fl-label">
                ESG Frameworks <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>
                {scope === 'regional' && selectedCountryId && (
                  <span style={{ fontWeight: 400, textTransform: 'none', color: '#4040C8' }}>
                    {' '}· {countries.find((c) => c.id === selectedCountryId)?.name ?? ''}
                  </span>
                )}
              </label>
              {availableFrameworks.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(availableFrameworks.length, 5)},1fr)`, gap: 8, marginTop: 5 }}>
                  {availableFrameworks.map(fw => {
                    // In global scope, IFRS is preview-only for now.
                    const isPreviewOnly = scope === 'global' && fw === 'IFRS';
                    const isLocked = selectedReport !== null;
                    const isDisabled = isPreviewOnly || isLocked;
                    return (
                      <label
                        key={fw}
                        className={`fw-chip ${checkedFw.includes(fw) ? 'sel' : ''}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 12px',
                          opacity: isPreviewOnly ? 0.5 : 1,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                        }}
                        title={
                          isPreviewOnly
                            ? 'Not available yet'
                            : isLocked
                              ? 'Locked — frameworks come from the selected report'
                              : undefined
                        }
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
                  {scope === 'regional'
                    ? regulatorsLoading
                      ? 'Loading frameworks for this country…'
                      : selectedCountryId
                        ? 'No regulators registered for this country.'
                        : 'Select a region and country to see applicable frameworks'
                    : 'No frameworks available'}
                </div>
              )}
            </div>

            {/* GRI indicator scope — only shown when a GRI framework is selected.
                Outer grid mirrors the framework checkbox grid so the two radios
                sit inside the GRI column footprint instead of spanning full width. */}
            {checkedFw.some((fw) => fw.startsWith('GRI')) && (
              <div style={{ marginBottom: 18 }}>
                <label className="fl-label">GRI Indicator Scope</label>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(availableFrameworks.length || 2, 5)},1fr)`,
                    gap: 8,
                    marginTop: 5,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {(
                      [
                        { value: 'standard', title: 'Standard', subtitle: '85 core indicators' },
                        { value: 'full', title: 'Full', subtitle: 'All 128 indicators' },
                      ] as const
                    ).map((opt) => {
                      const active = griScope === opt.value;
                      const isLocked = selectedReport !== null;
                      return (
                        <label
                          key={opt.value}
                          className={`fw-chip ${active ? 'sel' : ''}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 12px',
                            cursor: isLocked ? 'not-allowed' : 'pointer',
                          }}
                          title={isLocked ? 'Locked — scope comes from the selected report' : undefined}
                        >
                          <input
                            type="radio"
                            name="gri_scope"
                            value={opt.value}
                            checked={active}
                            onChange={() => setGriScope(opt.value)}
                            disabled={isLocked}
                            style={{ accentColor: '#4040C8' }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>{opt.title}</span>
                            <span style={{ fontSize: 10, color: '#5A6080', marginTop: 2 }}>{opt.subtitle}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

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
                  tabIndex={0}
                  onClick={openFilePicker}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openFilePicker();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!isDragging) setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className="upload-z"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '16px 20px',
                    cursor: 'pointer',
                    borderColor: isDragging ? '#4040C8' : undefined,
                    background: isDragging ? 'rgba(64,64,200,.06)' : undefined,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v10M6 7l4-4 4 4" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" /><path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  <span style={{ fontSize: 12, color: '#5A6080' }}>
                    Click to upload or drag &amp; drop annual report, HR data, financial statements
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
              {/* Enabled for any of: a brand-new report (Global + file + year),
                  an existing report in "Generate from DB" mode, or adding new
                  documents to an existing report (reuses the stored generation
                  config — frameworks / year / sector are read from the backend,
                  not the form). */}
              {(() => {
                const hasFramework = checkedFw.length > 0;
                const regionalReady =
                  scope !== 'regional' || (selectedRegion !== '' && selectedCountryId !== '');
                const canGenerateNew =
                  selectedReport === null &&
                  customYear !== null &&
                  uploadedFile !== null &&
                  hasFramework &&
                  regionalReady;
                const canGenerateFromDb =
                  selectedReport !== null &&
                  existingReportSource === 'db' &&
                  hasFramework;
                // Backend pulls year/sector/frameworks from the report's stored
                // generation_config, so the local hasFramework check is not
                // required here — only a file is needed.
                const canAddDocs =
                  selectedReport !== null &&
                  existingReportSource === 'upload' &&
                  uploadedFile !== null;
                const canGenerate = canGenerateNew || canGenerateFromDb || canAddDocs;
                const disabledReason =
                  scope === 'regional' && selectedRegion === ''
                    ? 'Select a region to continue'
                    : scope === 'regional' && selectedCountryId === ''
                      ? 'Select a country to continue'
                      : selectedReport !== null && existingReportSource === 'upload' && uploadedFile === null
                        ? 'Upload a document to add to this report'
                        : !hasFramework && !(selectedReport !== null && existingReportSource === 'upload')
                          ? 'Select at least one ESG framework to continue'
                          : selectedReport === null && customYear === null
                            ? 'Select a reporting year to continue'
                            : selectedReport === null && uploadedFile === null
                              ? 'Upload a source document to continue'
                              : undefined;
                const isBusy = isSubmittingGenerate;
                const btnEnabled = canGenerate && !isBusy;
                return (
                  <button
                    type="button"
                    disabled={!btnEnabled}
                    onClick={() => {
                      if (!btnEnabled) return;
                      triggerGenerate();
                    }}
                    className="btn bp"
                    title={!canGenerate ? disabledReason : undefined}
                    style={{
                      padding: '11px 24px',
                      fontSize: 13,
                      fontWeight: 700,
                      borderRadius: 10,
                      border: 'none',
                      background: '#4040C8',
                      color: '#fff',
                      cursor: btnEnabled ? 'pointer' : 'not-allowed',
                      opacity: btnEnabled ? 1 : 0.55,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    {isBusy ? (
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{ animation: 'spin 1s linear infinite' }}
                      >
                        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeOpacity="0.3" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 12 12" fill="none"><path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" /></svg>
                    )}
                    {isBusy ? 'Starting…' : 'Validate Report'}
                  </button>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Recent Reports — driven by GET /api/v1/reports/{company_id}. */}
      {existingReports.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
          {existingReports.map((r, idx) => {
            const score = Math.round(r.coverage?.percentage ?? 0);
            const env = r.coverage?.by_pillar?.E?.found ?? 0;
            const soc = r.coverage?.by_pillar?.S?.found ?? 0;
            const gov = r.coverage?.by_pillar?.G?.found ?? 0;
            const metricsDisclosed = r.coverage?.metrics_disclosed ?? 0;
            const metricsTotal = r.coverage?.metrics_total ?? 0;
            const gaps = r.coverage?.gaps ?? 0;
            // Regional reports surface regulator codes (e.g. "QFMA"); other
            // scopes keep the framework codes already returned by the API.
            const reportScope = r.scope_type ?? r.generation_config?.scope_type;
            const regulatorCodes = (r.regulators ?? [])
              .map((reg) => reg.code)
              .filter((code): code is string => Boolean(code));
            const headerCodes = reportScope === 'regional' && regulatorCodes.length > 0
              ? regulatorCodes
              : (r.frameworks ?? []);
            const headerLine = [formatPeriod(r.period), ...headerCodes].filter(Boolean).join(' · ');
            const gradient = REPORT_CARD_GRADIENTS[idx % REPORT_CARD_GRADIENTS.length];
            return (
              <div
                key={r.id}
                onClick={() => handleReportCardClick(r)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleReportCardClick(r);
                  }
                }}
                title="Open this report"
                style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1px solid #E2E4F0', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'transform .15s ease, box-shadow .15s ease' }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 22px rgba(26,29,46,.08)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'none';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}
              >
                <div style={{ background: gradient, padding: '16px 18px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: -30, right: -30, width: 110, height: 110, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', opacity: .75, marginBottom: 6 }}>
                    {headerLine}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{r.title || 'ESG Report'}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontSize: 30, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{score}%</span>
                      <span style={{ fontSize: 10, fontWeight: 700, opacity: .7 }}>Coverage</span>
                    </div>
                    <div style={{ fontSize: 10, opacity: .7, fontFamily: "'DM Mono',monospace" }}>{score}%</div>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,.18)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${score}%`, height: '100%', background: '#22C55E' }} />
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, opacity: .55, marginTop: 4 }}>OVERALL COVERAGE</div>
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {([['ENV', env, '#059669', 'rgba(5,150,105,.08)'], ['SOC', soc, '#0891B2', 'rgba(8,145,178,.08)'], ['GOV', gov, '#7C3AED', 'rgba(124,58,237,.08)']] as const).map(([label, value, color, bg]) => (
                      <div key={label} style={{ background: bg, borderRadius: 8, padding: '10px 0', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'DM Mono',monospace", color, lineHeight: 1 }}>{value}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#5A6080', marginTop: 4, letterSpacing: '.5px' }}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', background: 'rgba(34,197,94,.12)', padding: '3px 8px', borderRadius: 999 }}>
                        {metricsDisclosed}/{metricsTotal} metrics
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: 'rgba(239,68,68,.12)', padding: '3px 8px', borderRadius: 999 }}>
                        {gaps} {gaps === 1 ? 'gap' : 'gaps'}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: '#9BA3C4' }}>Generated {formatGenDate(r.generated_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
