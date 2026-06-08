import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reports as reportsApi } from '@/lib/api';
import type { ProcessingPageState } from '@/pages/ProcessingPage';

// Quarter options for the reporting-period selector.
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
type Quarter = (typeof QUARTERS)[number];

// Report areas — `key` is the snake_case slug sent to the backend in `areas[]`.
// If the backend enum differs, this is the only place to adjust.
const QUARTERLY_AREAS = [
  {
    key: 'key_highlights',
    title: 'Key Highlights',
    desc: "Executive summary of the quarter's results and narrative.",
    meta: '6 METRICS',
  },
  {
    key: 'income_statement',
    title: 'Income Statement Review',
    desc: 'Revenue, costs, operating & net income performance.',
    meta: '9 METRICS',
  },
  {
    key: 'balance_sheet',
    title: 'Balance Sheet Review',
    desc: 'Assets, liabilities, equity and liquidity position.',
    meta: '7 METRICS',
  },
  {
    key: 'shareholder_returns',
    title: 'Shareholder Returns',
    desc: 'Dividends, gearing, ROACE and capital allocation.',
    meta: '5 METRICS',
  },
  {
    key: 'outlook',
    title: 'Outlook',
    desc: 'Forward guidance and management commentary.',
    meta: '3 METRICS',
  },
  {
    key: 'financial_tables',
    title: 'Financial Tables',
    desc: 'YoY + YTD comparative statements, fully tabulated.',
    meta: 'TABULAR · YOY + YTD',
  },
] as const;

// Accepted upload types for quarterly financial documents.
const ACCEPTED_UPLOAD_EXT = ['.pdf', '.docx', '.xlsx', '.csv'] as const;
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

// Year picker: current year ±10, newest first.
function yearPickerOptions(): number[] {
  const now = new Date().getFullYear();
  const years: number[] = [];
  for (let y = now + 10; y >= now - 10; y--) years.push(y);
  return years;
}

interface QuarterlyReportFormProps {
  companyId: string | null;
}

export default function QuarterlyReportForm({
  companyId,
}: QuarterlyReportFormProps) {
  const navigate = useNavigate();

  const [year, setYear] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<Quarter>('Q1');
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [genError, setGenError] = useState<string | null>(null);
  const [isSubmittingGenerate, setIsSubmittingGenerate] = useState(false);
  const genRequestIdRef = useRef(0);

  const allSelected = selectedAreas.length === QUARTERLY_AREAS.length;

  const toggleArea = (key: string) => {
    setSelectedAreas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const toggleSelectAll = () => {
    setSelectedAreas(allSelected ? [] : QUARTERLY_AREAS.map((a) => a.key));
  };

  // --- File handling (multiple) -------------------------------------------
  const openFilePicker = () => fileInputRef.current?.click();

  const acceptFiles = (incoming: FileList | File[]) => {
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
  };

  // --- Submit --------------------------------------------------------------
  const hasFiles = files.length > 0;
  const hasAreas = selectedAreas.length > 0;
  const canGenerate =
    !!companyId && year != null && hasFiles && hasAreas && !isSubmittingGenerate;

  const disabledReason =
    year == null
      ? 'Select a reporting year to continue'
      : !hasAreas
        ? 'Select at least one report area to continue'
        : !hasFiles
          ? 'Upload at least one source document to continue'
          : undefined;

  const triggerGenerate = () => {
    if (!canGenerate || !companyId || year == null) return;

    const requestId = ++genRequestIdRef.current;
    setGenError(null);
    setIsSubmittingGenerate(true);

    reportsApi
      .generateQuarterly(companyId, {
        files,
        year,
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
          period: `${quarter} ${year}`,
        };
        navigate('/reports/processing', { state: processingState });
      })
      .catch((err: unknown) => {
        if (requestId !== genRequestIdRef.current) return;
        setIsSubmittingGenerate(false);
        setGenError(
          err instanceof Error
            ? err.message
            : 'Generation failed. Please try again.',
        );
      });
  };

  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      {/* Header — matches the ESG "Validate Report" card */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          borderBottom: '1px solid #ECEEF8',
        }}
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
              New Quarterly Report
            </div>
            <div style={{ fontSize: 11, color: '#5A6080' }}>
              Select the reporting period and the areas to generate. We compare
              year-over-year and year-to-date.
            </div>
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#4040C8' }}>
          AI Powered
        </span>
      </div>

      <div style={{ padding: '18px 20px' }}>
        {/* Reporting period */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.4fr',
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <label className="fl-label">Reporting Year</label>
            <select
              className="inp sel"
              value={year ?? ''}
              onChange={(e) =>
                setYear(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="" disabled>
                Select year…
              </option>
              {yearPickerOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

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
        </div>

        {/* Report areas */}
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
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 10,
            }}
          >
            {QUARTERLY_AREAS.map((area) => {
              const active = selectedAreas.includes(area.key);
              return (
                <button
                  key={area.key}
                  type="button"
                  onClick={() => toggleArea(area.key)}
                  className={`fw-chip ${active ? 'sel' : ''}`}
                  style={{
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 6,
                    padding: '12px 14px',
                    textAlign: 'left',
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
                    <span
                      aria-hidden
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        flexShrink: 0,
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
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: '#5A6080',
                      lineHeight: 1.4,
                    }}
                  >
                    {area.desc}
                  </span>
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
                </button>
              );
            })}
          </div>
        </div>

        {/* Upload */}
        <div style={{ marginBottom: 18 }}>
          <label className="fl-label">
            Source Documents{' '}
            <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>{' '}
            <span
              style={{
                fontWeight: 400,
                textTransform: 'none',
                color: '#9BA3C4',
              }}
            >
              (PDF, DOCX, XLSX, CSV — one or more)
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
              padding: '26px 20px',
              borderColor: isDragging ? '#4040C8' : undefined,
              background: isDragging ? 'rgba(64,64,200,.06)' : undefined,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 20 20"
              fill="none"
              style={{ display: 'block', margin: '0 auto 8px' }}
            >
              <path
                d="M10 3v10M6 7l4-4 4 4"
                stroke="#4040C8"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2"
                stroke="#4040C8"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#4040C8' }}>
              Drag &amp; drop files here, or browse
            </div>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 4 }}>
              PDF, DOCX, XLSX, CSV · financial statements · prior-year report ·
              management notes
            </div>
          </div>

          {files.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginTop: 12,
              }}
            >
              {files.map((file, index) => (
                <div
                  key={`${file.name}:${file.size}:${index}`}
                  className="upload-z"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textAlign: 'left',
                    padding: '12px 14px',
                    cursor: 'default',
                    borderStyle: 'solid',
                    borderColor: '#4040C8',
                    background: 'rgba(64,64,200,.04)',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#1A1D2E',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {file.name}
                    </div>
                    <div
                      style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}
                    >
                      {formatBytes(file.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label="Remove file"
                    title="Remove file"
                    style={{
                      width: 22,
                      height: 22,
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
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
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
            {isSubmittingGenerate ? 'Starting…' : 'Validate Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
