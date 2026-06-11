import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reports as reportsApi, quarterlyReports as quarterlyReportsApi, ApiError } from '@/lib/api';
import type { QuarterlyReportArea } from '@/lib/api';
import type { ProcessingPageState } from '@/pages/ProcessingPage';

// Quarter options for the reporting-period selector.
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
type Quarter = (typeof QUARTERS)[number];

// The list of report areas comes from the API (source of truth) — see
// reportsApi.getQuarterlyReportAreas. The API does NOT return per-area
// descriptions, so this code → subtitle map supplies the gray copy. Codes
// without an entry simply render no subtitle.
const AREA_DESCRIPTIONS: Record<string, string> = {
  highlights: "Executive summary of the quarter's results and narrative.",
  income_review: 'Revenue, costs, operating & net income performance.',
  balance_sheet_review: 'Assets, liabilities, equity and liquidity position.',
};

// A card as rendered in the grid — API area joined with frontend copy.
interface AreaCard {
  key: string;
  title: string;
  desc: string;
  meta: string;
  metricCount: number;
  metrics: string[];
}

function toAreaCard(area: QuarterlyReportArea): AreaCard {
  return {
    key: area.code,
    title: area.title,
    desc: AREA_DESCRIPTIONS[area.code] ?? '',
    meta: `${area.metric_count} ${area.metric_count === 1 ? 'METRIC' : 'METRICS'}`,
    metricCount: area.metric_count,
    metrics: area.metrics ?? [],
  };
}

// Humanise a snake_case metric slug for display, e.g.
// "cash_and_equivalents" → "Cash And Equivalents".
function humaniseMetric(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Accepted upload types for quarterly financial documents.
const ACCEPTED_UPLOAD_EXT = ['.pdf', '.docx', '.xlsx', '.csv'] as const;
const ACCEPTED_UPLOAD_ATTR = ACCEPTED_UPLOAD_EXT.join(',');
const MAX_DOCUMENTS = 5;

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_UPLOAD_EXT.some((ext) => lower.endsWith(ext));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Year picker: current year ±10, newest first.
function yearPickerOptions(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = now + 10; y >= now - 10; y--) years.push(y);
  return years;
}

// Normalise API period strings like "Q1-2026" → "Q1 2026" for display.
function formatPeriod(period: string): string {
  return period.replace(/-/g, ' ').trim();
}

// Extract the 4-digit year from a period string like "Q1-2026".
function yearFromPeriod(period: string): number | null {
  const m = period.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

// Sentinel value for the "+ Add new…" option in the reporting-year select.
const ADD_NEW_SENTINEL = '__add_new__';

// Minimal shape of an existing quarterly report needed by the year dropdown.
interface QuarterlyReportOption {
  id: string;
  period: string;
}

interface QuarterlyReportFormProps {
  companyId: string | null;
  // Existing quarterly reports — populate the year dropdown like ESG.
  existingReports?: QuarterlyReportOption[];
  // True while the parent is still loading the reports list.
  periodsLoading?: boolean;
}

export default function QuarterlyReportForm({
  companyId,
  existingReports = [],
  periodsLoading = false,
}: QuarterlyReportFormProps) {
  const navigate = useNavigate();

  // Collapsible card — mirrors the ESG "Validate Report" card, open by default.
  const [genOpen, setGenOpen] = useState(true);

  // Reporting-year dropdown state — mirrors the ESG flow: pick an existing
  // report or "+ Add new…" → year picker.
  const [customYear, setCustomYear] = useState<number | null>(null);
  const [isAddingNewPeriod, setIsAddingNewPeriod] = useState<boolean>(
    existingReports.length === 0,
  );
  const [quarter, setQuarter] = useState<Quarter>('Q1');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // Existing-report mode — set when user picks an existing report from the dropdown.
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [existingSource, setExistingSource] = useState<'open' | 'upload'>('open');
  // Coverage summary for the selected existing report (doc count + period label).
  const [existingDocCount, setExistingDocCount] = useState<number | null>(null);
  const [existingPeriodLabel, setExistingPeriodLabel] = useState<string | null>(null);
  const [existingCoverageLoading, setExistingCoverageLoading] = useState(false);

  // Report areas come from the API — the source of truth for which cards show.
  const [areas, setAreas] = useState<AreaCard[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasError, setAreasError] = useState<string | null>(null);
  // Area whose full metric list is shown in the popup (null = closed).
  const [metricsModal, setMetricsModal] = useState<AreaCard | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showFileCapWarning, setShowFileCapWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [genError, setGenError] = useState<string | null>(null);
  const [isSubmittingGenerate, setIsSubmittingGenerate] = useState(false);
  const genRequestIdRef = useRef(0);

  const allSelected =
    areas.length > 0 && selectedAreas.length === areas.length;

  // How many more documents can be added to the selected existing report.
  const remainingSlots =
    existingDocCount != null ? MAX_DOCUMENTS - existingDocCount : MAX_DOCUMENTS;

  const isUploadMode = !!selectedReportId && existingSource === 'upload';
  const isOpenMode = !!selectedReportId && existingSource === 'open';

  // Fetch the report-area cards once on mount. The list is company-agnostic.
  useEffect(() => {
    let cancelled = false;
    setAreasLoading(true);
    setAreasError(null);
    reportsApi
      .getQuarterlyReportAreas()
      .then((res) => {
        if (cancelled) return;
        setAreas((res.areas ?? []).map(toAreaCard));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAreasError(
          err instanceof Error
            ? err.message
            : 'Failed to load report areas. Please retry.',
        );
      })
      .finally(() => {
        if (!cancelled) setAreasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch coverage for the selected existing report to get doc count + period label.
  useEffect(() => {
    if (!selectedReportId || !companyId) return;
    let cancelled = false;
    setExistingCoverageLoading(true);
    setExistingDocCount(null);
    setExistingPeriodLabel(null);
    quarterlyReportsApi
      .getCoverage(companyId, selectedReportId)
      .then((res) => {
        if (cancelled) return;
        setExistingDocCount(res.summary.documents_count);
        setExistingPeriodLabel(res.period_label);
      })
      .catch(() => {
        // Graceful fallback — backend 422 will surface on submit if needed.
      })
      .finally(() => {
        if (!cancelled) setExistingCoverageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedReportId, companyId]);

  // Auto-dismiss the file-cap warning after 3 s.
  useEffect(() => {
    if (!showFileCapWarning) return;
    const t = setTimeout(() => setShowFileCapWarning(false), 3000);
    return () => clearTimeout(t);
  }, [showFileCapWarning]);

  // Close the metrics popup on Escape.
  useEffect(() => {
    if (!metricsModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMetricsModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [metricsModal]);

  // Drop any selected codes that the API no longer returns (defensive — keeps
  // the generate payload in sync with the rendered cards).
  const areaKeys = useMemo(() => new Set(areas.map((a) => a.key)), [areas]);
  useEffect(() => {
    setSelectedAreas((prev) => prev.filter((k) => areaKeys.has(k)));
  }, [areaKeys]);

  // When the parent finishes loading the reports list, jump straight to the
  // year picker if there are no existing quarterly reports yet. Runs once.
  const didInitPeriod = useRef(false);
  useEffect(() => {
    if (periodsLoading || didInitPeriod.current) return;
    didInitPeriod.current = true;
    if (existingReports.length === 0) setIsAddingNewPeriod(true);
  }, [periodsLoading, existingReports.length]);

  // --- Reporting-year dropdown handlers ------------------------------------
  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === ADD_NEW_SENTINEL) {
      setIsAddingNewPeriod(true);
      setSelectedReportId(null);
      return;
    }
    if (value) {
      setSelectedReportId(value);
      setExistingSource('open');
      setFiles([]);
      setGenError(null);
    }
  };

  const pickCustomYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const picked = Number(e.target.value);
    if (!picked) return;
    setCustomYear(picked);
    setIsAddingNewPeriod(false);
  };

  const cancelAddNewPeriod = () => setIsAddingNewPeriod(false);
  const clearCustomYear = () => setCustomYear(null);

  const clearSelectedReport = () => {
    setSelectedReportId(null);
    setExistingSource('open');
    setExistingDocCount(null);
    setExistingPeriodLabel(null);
    setFiles([]);
    setGenError(null);
  };

  // Years already taken by an existing quarterly report — greyed out in the
  // year picker, mirroring the ESG dropdown.
  const usedYears = new Set<number>(
    existingReports
      .map((r) => yearFromPeriod(r.period))
      .filter((y): y is number => y != null),
  );

  const toggleArea = (key: string) => {
    setSelectedAreas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleSelectAll = () => {
    setSelectedAreas(allSelected ? [] : areas.map((a) => a.key));
  };

  // --- File handling (multiple) -------------------------------------------
  const openFilePicker = () => fileInputRef.current?.click();

  const acceptFiles = (incoming: FileList | File[]) => {
    const capLimit = MAX_DOCUMENTS;
    const accepted: File[] = [];
    let rejected = false;
    Array.from(incoming).forEach((f) => {
      if (hasAcceptedExtension(f.name)) accepted.push(f);
      else rejected = true;
    });
    if (rejected) {
      setGenError(
        `Unsupported file type. Allowed: ${ACCEPTED_UPLOAD_EXT.join(', ')}.`,
      );
    } else {
      setGenError(null);
    }
    if (accepted.length > 0) {
      setFiles((prev) => {
        // De-dupe by name + size so re-dropping the same file is a no-op.
        const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
        const merged = [...prev];
        accepted.forEach((f) => {
          const id = `${f.name}:${f.size}`;
          if (!seen.has(id)) {
            seen.add(id);
            merged.push(f);
          }
        });
        if (merged.length > capLimit) {
          setShowFileCapWarning(true);
          return merged.slice(0, capLimit);
        }
        return merged;
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) acceptFiles(e.target.files);
    // Reset so selecting the same file again re-fires onChange.
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      acceptFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setGenError(null);
  };

  // --- Submit --------------------------------------------------------------
  const hasFiles = files.length > 0;
  const hasAreas = selectedAreas.length > 0;

  const canGenerate =
    !!companyId &&
    !isSubmittingGenerate &&
    (isOpenMode ||
      (isUploadMode && hasFiles) ||
      (!selectedReportId && customYear != null && hasFiles && hasAreas));

  const disabledReason = isOpenMode
    ? undefined
    : isUploadMode
      ? !hasFiles
        ? 'Upload at least one source document to continue'
        : undefined
      : customYear == null
        ? 'Select a reporting year to continue'
        : !hasAreas
          ? 'Select at least one report area to continue'
          : !hasFiles
            ? 'Upload at least one source document to continue'
            : undefined;

  const extractApiError = (err: unknown): string => {
    if (err instanceof ApiError) {
      const body = err.body as { detail?: string | Array<{ msg?: string }> } | null;
      if (typeof body?.detail === 'string') return body.detail;
      if (Array.isArray(body?.detail) && body.detail[0]?.msg) return body.detail[0].msg;
    }
    if (err instanceof Error) return err.message;
    return 'Something went wrong. Please try again.';
  };

  const triggerGenerate = () => {
    if (!canGenerate || !companyId) return;

    // Branch A — open existing report: navigate straight to coverage.
    if (isOpenMode && selectedReportId) {
      navigate(`/quarterly-report/${selectedReportId}/coverage`);
      return;
    }

    // Branch B — upload new documents to an existing report.
    if (isUploadMode && selectedReportId) {
      const requestId = ++genRequestIdRef.current;
      setGenError(null);
      setIsSubmittingGenerate(true);
      const targetReportId = selectedReportId;
      reportsApi
        .addDocuments(companyId, targetReportId, { files })
        .then((handle) => {
          if (requestId !== genRequestIdRef.current) return;
          const processingState: ProcessingPageState = {
            runId: handle.runId,
            pollUrl: handle.pollUrl,
            reportId: handle.reportId ?? targetReportId,
            companyId,
            estimatedDurationSeconds: handle.estimatedDurationSeconds,
            fileName: files.length === 1 ? files[0].name : `${files.length} files`,
            isExisting: handle.isExisting,
            conflictMessage: handle.message,
            reportType: 'quarterly',
            period: existingPeriodLabel ?? undefined,
          };
          navigate('/reports/processing', { state: processingState });
        })
        .catch((err: unknown) => {
          if (requestId !== genRequestIdRef.current) return;
          setIsSubmittingGenerate(false);
          setGenError(extractApiError(err));
        });
      return;
    }

    // Branch C — new report.
    if (customYear == null) return;
    const requestId = ++genRequestIdRef.current;
    setGenError(null);
    setIsSubmittingGenerate(true);

    reportsApi
      .generateQuarterly(companyId, {
        files,
        year: customYear,
        quarter,
        areas: selectedAreas,
      })
      .then((handle) => {
        if (requestId !== genRequestIdRef.current) return;
        const processingState: ProcessingPageState = {
          runId: handle.runId,
          pollUrl: handle.pollUrl,
          reportId: handle.reportId,
          companyId,
          estimatedDurationSeconds: handle.estimatedDurationSeconds,
          fileName: files[0]?.name ?? null,
          isExisting: handle.isExisting,
          conflictMessage: handle.message,
          reportType: 'quarterly',
          period: `${quarter} ${customYear}`,
        };
        navigate('/reports/processing', { state: processingState });
      })
      .catch((err: unknown) => {
        if (requestId !== genRequestIdRef.current) return;
        setIsSubmittingGenerate(false);
        setGenError(extractApiError(err));
      });
  };

  // Friendly label for the submit button.
  const submitLabel = 'Generate Report';

  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      {/* Header — matches the ESG "Validate Report" card (collapsible) */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          cursor: 'pointer',
          borderBottom: genOpen ? '1px solid #ECEEF8' : 'none',
        }}
        onClick={() => setGenOpen(!genOpen)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#4040C8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z"
                fill="white"
              />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>
              Generate Quarterly Report
            </div>
            <div style={{ fontSize: 11, color: '#5A6080' }}>
              Configure parameters &amp; upload source documents
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>
            AI Powered
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{
              transform: genOpen ? 'rotate(180deg)' : 'rotate(0)',
              transition: '.2s',
            }}
          >
            <path
              d="M3 5l4 4 4-4"
              stroke="#5A6080"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>

      {genOpen && (
      <div style={{ padding: '18px 20px' }}>
        {/* Reporting period */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: selectedReportId ? '1fr' : '1fr 1fr',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <label className="fl-label">Reporting Year</label>
            {periodsLoading ? (
              <select className="inp sel" disabled>
                <option>Loading reporting years…</option>
              </select>
            ) : selectedReportId != null ? (
              /* Existing report selected — show label + × */
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div
                  className="inp sel"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#1A1D2E' }}>
                    {formatPeriod(
                      existingReports.find((r) => r.id === selectedReportId)?.period ?? '',
                    )}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#5A6080',
                      textTransform: 'uppercase',
                      letterSpacing: '.5px',
                    }}
                  >
                    Existing
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedReport}
                  aria-label="Change report"
                  title="Change report"
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
            ) : customYear != null ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <div
                  className="inp sel"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ fontWeight: 600, color: '#1A1D2E' }}>
                    {customYear}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#4040C8',
                      textTransform: 'uppercase',
                      letterSpacing: '.5px',
                    }}
                  >
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
                  <option value="" disabled>
                    Select year…
                  </option>
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
                value=""
                onChange={handlePeriodChange}
              >
                <option value="" disabled>
                  Select a reporting year…
                </option>
                {existingReports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatPeriod(r.period)}
                  </option>
                ))}
                <option value={ADD_NEW_SENTINEL}>+ Add new…</option>
              </select>
            )}
          </div>

          {/* Quarter selector — hidden when an existing report is selected */}
          {!selectedReportId && (
            <div>
              <label className="fl-label">Quarter</label>
              <select
                className="inp sel"
                value={quarter}
                onChange={(e) => setQuarter(e.target.value as Quarter)}
              >
                {QUARTERS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Source dropdown — shown only when an existing report is selected */}
        {selectedReportId && (
          <div style={{ marginBottom: 18 }}>
            <label className="fl-label">Source</label>
            <select
              className="inp sel"
              value={existingSource}
              onChange={(e) => {
                setExistingSource(e.target.value as 'open' | 'upload');
                setFiles([]);
                setGenError(null);
              }}
            >
              <option value="open">Generate report from DB</option>
              <option value="upload">Upload new documents</option>
            </select>
          </div>
        )}

        {/* Report areas — hidden when an existing report is selected */}
        {!selectedReportId && (
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <label className="fl-label" style={{ marginBottom: 0 }}>
                Report Areas{' '}
                <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>
              </label>
              {areas.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#4040C8',
                    background: 'transparent',
                    border: 0,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>

            {areasLoading ? (
              <div style={{ fontSize: 12, color: '#9BA3C4', padding: '8px 0' }}>
                Loading report areas…
              </div>
            ) : areasError ? (
              <div
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(229,72,77,.08)',
                  border: '1px solid rgba(229,72,77,.25)',
                  color: '#B33A3E',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {areasError}
              </div>
            ) : areas.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9BA3C4', padding: '8px 0' }}>
                No report areas available.
              </div>
            ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: 10,
              }}
            >
              {areas.map((area) => {
                const active = selectedAreas.includes(area.key);
                return (
                  <div
                    key={area.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setMetricsModal(area)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setMetricsModal(area);
                      }
                    }}
                    title="View metrics"
                    className={`fw-chip ${active ? 'sel' : ''}`}
                    style={{
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      gap: 6,
                      padding: '12px 14px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      background: active ? '#EEEEFF' : '#fff',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#1A1D2E',
                        }}
                      >
                        {area.title}
                      </span>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        aria-label={
                          active
                            ? `Deselect ${area.title}`
                            : `Select ${area.title}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleArea(area.key);
                        }}
                        style={{
                          width: 18,
                          height: 18,
                          padding: 0,
                          borderRadius: 5,
                          flexShrink: 0,
                          cursor: 'pointer',
                          border: active ? 'none' : '1.5px solid #C9CDE4',
                          background: active ? '#4040C8' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {active && (
                          <svg
                            width="11"
                            height="11"
                            viewBox="0 0 12 12"
                            fill="none"
                          >
                            <path
                              d="M2.5 6.2l2.2 2.2L9.5 3.6"
                              stroke="#fff"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    {area.desc && (
                      <span
                        style={{
                          fontSize: 11.5,
                          color: '#5A6080',
                          lineHeight: 1.4,
                        }}
                      >
                        {area.desc}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '.5px',
                        color: active ? '#4040C8' : '#9BA3C4',
                        marginTop: 2,
                      }}
                    >
                      {area.meta}
                    </span>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}

        {/* Upload — shown for new reports and upload-to-existing mode */}
        {!isOpenMode && (
          <div style={{ marginBottom: 18 }}>
            <label className="fl-label">
              Source Documents{' '}
              {!isOpenMode && <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>}{' '}
              <span
                style={{
                  fontWeight: 400,
                  textTransform: 'none',
                  color: '#9BA3C4',
                }}
              >
                {isUploadMode
                  ? existingCoverageLoading
                    ? '(loading…)'
                    : `(PDF, DOCX, XLSX, CSV — up to ${MAX_DOCUMENTS})`
                  : `(PDF, DOCX, XLSX, CSV — up to ${MAX_DOCUMENTS})`}
              </span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_UPLOAD_ATTR}
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />

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
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 3v10M6 7l4-4 4 4"
                  stroke="#9BA3C4"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <path
                  d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2"
                  stroke="#9BA3C4"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <span style={{ fontSize: 12, color: '#5A6080' }}>
                Click to upload or drag &amp; drop financial statements, prior-year
                report, management notes
              </span>
            </div>

            {files.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {files.map((file, index) => (
                  <div
                    key={`${file.name}:${file.size}:${index}`}
                    style={{
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: '10px 10px 8px',
                      borderRadius: 8,
                      border: '1px solid #4040C8',
                      background: 'rgba(64,64,200,.04)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                      <path
                        d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z"
                        stroke="#4040C8"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M12 2v4h4"
                        stroke="#4040C8"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div style={{ minWidth: 0, paddingRight: 16 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#1A1D2E',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {file.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
                        {formatBytes(file.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      aria-label="Remove file"
                      title="Remove file"
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        width: 16,
                        height: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        cursor: 'pointer',
                        color: '#9BA3C4',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 2l8 8M10 2l-8 8"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error banner */}
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

        {/* Submit */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={!canGenerate}
            onClick={triggerGenerate}
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
              cursor: canGenerate ? 'pointer' : 'not-allowed',
              opacity: canGenerate ? 1 : 0.55,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            {isSubmittingGenerate ? (
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="white"
                  strokeWidth="3"
                  strokeOpacity="0.3"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                <path
                  d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z"
                  fill="white"
                />
              </svg>
            )}
            {isSubmittingGenerate ? 'Starting…' : submitLabel}
          </button>
        </div>
      </div>
      )}

      {/* File cap warning — auto-dismisses after 3 s */}
      {showFileCapWarning && (
        <div
          onClick={() => setShowFileCapWarning(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            background: 'rgba(20,22,40,.35)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(400px, 100%)',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(20,22,40,.18)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 20px',
                borderBottom: '1px solid #ECEEF8',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'rgba(229,72,77,.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                  <path d="M10 6v5M10 14h.01" stroke="#E5484D" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="10" cy="10" r="8.5" stroke="#E5484D" strokeWidth="1.5" />
                </svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>
                File limit reached
              </div>
            </div>
            <div style={{ padding: '14px 20px 18px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#3A3F5C', lineHeight: 1.6 }}>
                {isUploadMode && existingDocCount != null ? (
                  <>
                    This report already has{' '}
                    <strong style={{ color: '#1A1D2E' }}>{existingDocCount} documents</strong>.
                    You can add at most {remainingSlots} more.
                  </>
                ) : (
                  <>
                    A quarterly report accepts at most{' '}
                    <strong style={{ color: '#1A1D2E' }}>{MAX_DOCUMENTS} documents</strong>.
                    Only the first {MAX_DOCUMENTS} files have been kept.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metrics popup — opened by clicking a report-area card. */}
      {metricsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${metricsModal.title} metrics`}
          onClick={() => setMetricsModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(20,22,40,.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              borderRadius: 14,
              boxShadow: '0 24px 60px rgba(20,22,40,.28)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 12,
                padding: '18px 20px',
                borderBottom: '1px solid #ECEEF8',
              }}
            >
              <div>
                <div
                  style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}
                >
                  {metricsModal.title}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '.5px',
                    color: '#9BA3C4',
                    marginTop: 3,
                  }}
                >
                  {metricsModal.meta}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMetricsModal(null)}
                aria-label="Close"
                title="Close"
                style={{
                  width: 30,
                  height: 30,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid #E5E7EF',
                  background: '#fff',
                  borderRadius: 8,
                  cursor: 'pointer',
                  color: '#5A6080',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 2l8 8M10 2l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Body — metric pills */}
            <div style={{ padding: '16px 20px', overflowY: 'auto' }}>
              {metricsModal.metrics.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9BA3C4' }}>
                  No metrics listed for this area.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  {metricsModal.metrics.map((m) => (
                    <span
                      key={m}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '6px 12px',
                        borderRadius: 999,
                        background: '#F4F5FB',
                        border: '1px solid #ECEEF8',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#3A3F5C',
                      }}
                    >
                      {humaniseMetric(m)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
