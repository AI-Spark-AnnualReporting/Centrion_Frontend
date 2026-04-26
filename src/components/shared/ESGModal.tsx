import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getSectors, reports as reportsApi } from '@/lib/api';
import type { Sector } from '@/types/company';

interface ESGModalProps {
  onClose: () => void;
}

interface ReportSummary {
  id: string;
  period: string;
}

interface ReportsListResponse {
  reports: ReportSummary[];
}

const ACCEPTED_UPLOAD_EXT = ['.pdf', '.docx', '.txt', '.csv', '.xlsx'] as const;
const ACCEPTED_UPLOAD_ATTR = ACCEPTED_UPLOAD_EXT.join(',');
const GLOBAL_FRAMEWORKS = ['GRI 2021', 'IFRS'];
const DEFAULT_GLOBAL_CHECKED = ['GRI 2021'];
const ADD_NEW_SENTINEL = '__add_new__';

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_UPLOAD_EXT.some((ext) => lower.endsWith(ext));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function yearPickerOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + 10; y >= current - 10; y--) years.push(y);
  return years;
}

function yearFromPeriod(period: string): number | null {
  const m = period.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function frameworkLabelToCode(label: string): string {
  if (label.startsWith('GRI')) return 'GRI';
  if (label === 'IFRS') return 'IFRS';
  return label;
}

export function ESGModal({ onClose }: ESGModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // ---- Form state -----------------------------------------------------------
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [selectedSectorId, setSelectedSectorId] = useState('');
  const [existingPeriods, setExistingPeriods] = useState<string[]>([]);
  const [customYear, setCustomYear] = useState<number | null>(null);
  const [isAddingNewPeriod, setIsAddingNewPeriod] = useState(true);
  const [scope, setScope] = useState<'global' | 'regional'>('global');
  const [checkedFw, setCheckedFw] = useState<string[]>(DEFAULT_GLOBAL_CHECKED);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Generation state -----------------------------------------------------
  // The generate + coverage API chain actually runs on ReportsPage so the
  // full-width loading screen and subsequent report view are visible there.
  const [genError] = useState<string | null>(null);

  // ---- Load sectors + existing report periods (for used-year filtering) -----
  useEffect(() => {
    getSectors().then(setSectors).catch(() => setSectors([]));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    reportsApi
      .list<ReportsListResponse>(companyId)
      .then((data) => {
        const periods = (data?.reports ?? [])
          .map((r) => r.period)
          .filter((p): p is string => !!p);
        setExistingPeriods(periods);
      })
      .catch(() => setExistingPeriods([]));
  }, [companyId]);

  const usedYears = new Set<number>(
    existingPeriods
      .map((p) => yearFromPeriod(p))
      .filter((y): y is number => y != null),
  );

  // ---- Handlers -------------------------------------------------------------
  const toggleFw = (fw: string) =>
    setCheckedFw((prev) => (prev.includes(fw) ? prev.filter((f) => f !== fw) : [...prev, fw]));

  const handleScopeChange = (newScope: 'global' | 'regional') => {
    setScope(newScope);
    if (newScope === 'global') {
      setCheckedFw(DEFAULT_GLOBAL_CHECKED);
    } else {
      setCheckedFw([]);
      setUploadedFile(null);
      setUploadError(null);
      setIsDragging(false);
    }
  };

  const pickCustomYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const year = Number(e.target.value);
    if (!year) return;
    setCustomYear(year);
    setIsAddingNewPeriod(false);
  };

  const clearCustomYear = () => {
    setCustomYear(null);
    setIsAddingNewPeriod(true);
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

  const hasFramework = checkedFw.length > 0;
  const canGenerate =
    !!companyId &&
    scope === 'global' &&
    customYear !== null &&
    uploadedFile !== null &&
    hasFramework;

  const disabledReason =
    !companyId
      ? 'You must be signed in with a company to generate a report'
      : scope !== 'global'
        ? 'Regional generation is not available yet'
        : !hasFramework
          ? 'Select at least one ESG framework to continue'
          : customYear === null
            ? 'Select a reporting year to continue'
            : uploadedFile === null
              ? 'Upload a source document to continue'
              : undefined;

  const triggerGenerate = () => {
    if (!canGenerate || !companyId || !uploadedFile || customYear == null) return;

    const sectorIdForApi = selectedSectorId || sectors[0]?.id || '';
    // Close the modal and hand the payload to ReportsPage — it shows the
    // full-width GeneratingScreen and fires the API chain.
    onClose();
    navigate('/reports', {
      state: {
        pendingGenerate: {
          year: customYear,
          sector_id: sectorIdForApi,
          scope_type: scope,
          framework_codes: checkedFw.map(frameworkLabelToCode),
          file: uploadedFile,
        },
      },
    });
  };

  // ---------------------------------------------------------------------------
  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content" style={{ width: 720 }}>
        <>
          <div
            style={{
              padding: '22px 26px 18px',
              borderBottom: '1px solid #ECEEF8',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
            }}
          >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E', marginBottom: 2 }}>
                  Generate ESG Report
                </div>
                <div style={{ fontSize: 11, color: '#5A6080' }}>
                  Configure parameters &amp; upload source documents
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  border: '1.5px solid #E2E4F0',
                  background: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="#5A6080" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <div style={{ padding: '22px 26px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Row 1: Reporting Year + Industry Sector (display only) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label className="fl-label">Reporting Year</label>
                  {customYear != null ? (
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
                        <span style={{ fontWeight: 600, color: '#1A1D2E' }}>FY {customYear}</span>
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
                    <select
                      className="inp sel"
                      value=""
                      onChange={pickCustomYear}
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
                  ) : (
                    <select
                      className="inp sel"
                      value=""
                      onChange={(e) => {
                        if (e.target.value === ADD_NEW_SENTINEL) setIsAddingNewPeriod(true);
                      }}
                    >
                      <option value="" disabled>
                        Select a reporting year…
                      </option>
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
                  >
                    <option value="">None</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id} disabled>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Report Scope */}
              <div style={{ marginBottom: 16 }}>
                <label className="fl-label">Report Scope</label>
                <select
                  className="inp sel"
                  value={scope}
                  onChange={(e) => handleScopeChange(e.target.value as 'global' | 'regional')}
                >
                  <option value="global">Global</option>
                  <option value="regional">Regional</option>
                </select>
              </div>

              {/* ESG Frameworks (global scope) */}
              {scope === 'global' && (
                <div style={{ marginBottom: 16 }}>
                  <label className="fl-label">
                    ESG Frameworks <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2,1fr)',
                      gap: 8,
                      marginTop: 5,
                    }}
                  >
                    {GLOBAL_FRAMEWORKS.map((fw) => {
                      const isDisabled = fw === 'IFRS';
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
                </div>
              )}

              {/* Upload Source Document */}
              <div style={{ marginBottom: 4 }}>
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
                      <path
                        d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z"
                        stroke="#4040C8"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                      <path d="M12 2v4h4" stroke="#4040C8" strokeWidth="1.5" strokeLinejoin="round" />
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
                        {uploadedFile.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
                        {formatBytes(uploadedFile.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openFilePicker}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#4040C8',
                        background: 'transparent',
                        border: 0,
                        padding: '4px 8px',
                        cursor: 'pointer',
                      }}
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={clearUploadedFile}
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
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 3v10M6 7l4-4 4 4" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontSize: 12, color: '#5A6080' }}>
                      {scope === 'global'
                        ? 'Click to upload or drag & drop annual report, HR data, financial statements'
                        : 'Upload is only available in Global scope'}
                    </span>
                  </div>
                )}
                {uploadError && (
                  <div style={{ fontSize: 11, color: '#E5484D', marginTop: 6 }} role="alert">
                    {uploadError}
                  </div>
                )}
              </div>

              {genError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 12,
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
            </div>

            <div
              style={{
                padding: '14px 26px',
                borderTop: '1px solid #ECEEF8',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 9,
              }}
            >
              <button className="btn bs" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn bp"
                onClick={triggerGenerate}
                disabled={!canGenerate}
                title={disabledReason}
                style={{
                  cursor: canGenerate ? 'pointer' : 'not-allowed',
                  opacity: canGenerate ? 1 : 0.55,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="white" />
                </svg>
                Generate ESG Report
              </button>
            </div>
        </>
      </div>
    </div>
  );
}
