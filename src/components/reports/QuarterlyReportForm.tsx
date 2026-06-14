import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { getSectors, lookups, reports as reportsApi } from '@/lib/api';
import type { Sector } from '@/types/company';
import type {
  CountriesResponse,
  CountryLookup,
  RegionsResponse,
  RegulatorLookup,
  RegulatorsResponse,
} from '@/types/lookups';

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
const MAX_DOCUMENTS = 3;
const GLOBAL_FRAMEWORKS = ['GRI', 'IFRS'];
// Pre-select GRI on the global scope (matches the Reports page default).
const DEFAULT_GLOBAL_CHECKED = ['GRI'];

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

// Mirrors the Reports page's Validate Report form 1:1, but locked to creating
// a brand-new report — no existing-report dropdown, no DB-vs-upload source
// selector. On submit it hands off to ReportsPage via `pendingGenerate` so the
// full-width GeneratingScreen and post-generation report view show up there.
export function ESGModal({ onClose }: ESGModalProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // ---- Form state -----------------------------------------------------------
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [sectorsLoading, setSectorsLoading] = useState(true);
  const [selectedSectorId, setSelectedSectorId] = useState('');
  const [existingPeriods, setExistingPeriods] = useState<string[]>([]);
  const [customYear, setCustomYear] = useState<number | null>(null);
  const [scope, setScope] = useState<'global' | 'regional'>('global');
  const [checkedFw, setCheckedFw] = useState<string[]>(DEFAULT_GLOBAL_CHECKED);
  const [griScope, setGriScope] = useState<'standard' | 'full'>('standard');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showFileCapWarning, setShowFileCapWarning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Regional lookups — loaded lazily once the user switches to regional scope
  // and picks a region / country.
  const [regions, setRegions] = useState<string[]>([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [countries, setCountries] = useState<CountryLookup[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(false);
  const [selectedCountryId, setSelectedCountryId] = useState('');
  const [regulators, setRegulators] = useState<RegulatorLookup[]>([]);
  const [regulatorsLoading, setRegulatorsLoading] = useState(false);

  // ---- Load sectors + existing report periods (for used-year filtering) -----
  useEffect(() => {
    getSectors()
      .then((data) => setSectors(data))
      .catch(() => setSectors([]))
      .finally(() => setSectorsLoading(false));
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

  // Regions load once on mount.
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

  // Countries reload whenever the user picks (or clears) a region.
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

  // Regulators reload whenever the user picks (or clears) a country. Each
  // regulator's `code` becomes one ESG framework chip; we auto-check all of
  // them so the user doesn't have to opt in to every one.
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
        setCheckedFw(list.map((r) => r.code));
      })
      .catch(() => {
        if (!cancelled) {
          setRegulators([]);
          setCheckedFw([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRegulatorsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCountryId]);

  const usedYears = new Set<number>(
    existingPeriods
      .map((p) => yearFromPeriod(p))
      .filter((y): y is number => y != null),
  );

  // Auto-dismiss the file-cap warning after 3 s.
  useEffect(() => {
    if (!showFileCapWarning) return;
    const t = setTimeout(() => setShowFileCapWarning(false), 3000);
    return () => clearTimeout(t);
  }, [showFileCapWarning]);

  // ---- Handlers -------------------------------------------------------------
  // Multi-toggle used by regional regulator chips — global scope uses radios
  // and bypasses this.
  const toggleFw = (fw: string) =>
    setCheckedFw((prev) =>
      prev.includes(fw) ? prev.filter((f) => f !== fw) : [...prev, fw],
    );

  const handleScopeChange = (newScope: 'global' | 'regional') => {
    setScope(newScope);
    if (newScope === 'global') {
      setSelectedRegion('');
      setSelectedCountryId('');
      setCheckedFw(DEFAULT_GLOBAL_CHECKED);
    } else {
      // Regional mode is built from regulator chips that are populated by the
      // country effect — clear any global selection so we don't leak GRI /
      // IFRS into the request payload.
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
    // The regulators effect populates `checkedFw` once it resolves.
  };

  const pickCustomYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const year = Number(e.target.value);
    if (!year) return;
    setCustomYear(year);
  };

  const clearCustomYear = () => {
    setCustomYear(null);
  };

  const acceptFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const accepted: File[] = [];
    let rejected = false;
    list.forEach((f) => {
      if (hasAcceptedExtension(f.name)) accepted.push(f);
      else rejected = true;
    });
    if (rejected) {
      setUploadError(`Unsupported file type. Allowed: ${ACCEPTED_UPLOAD_EXT.join(', ')}`);
    } else {
      setUploadError(null);
    }
    if (accepted.length > 0) {
      setUploadedFiles((prev) => {
        const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
        const merged = [...prev];
        accepted.forEach((f) => {
          const id = `${f.name}:${f.size}`;
          if (!seen.has(id)) { seen.add(id); merged.push(f); }
        });
        if (merged.length > MAX_DOCUMENTS) {
          setShowFileCapWarning(true);
          return merged.slice(0, MAX_DOCUMENTS);
        }
        return merged;
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) acceptFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) acceptFiles(e.dataTransfer.files);
  };

  const openFilePicker = () => fileInputRef.current?.click();
  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setUploadError(null);
  };
  const clearUploadedFiles = () => {
    setUploadedFiles([]);
    setUploadError(null);
  };

  const availableFrameworks: string[] =
    scope === 'global' ? GLOBAL_FRAMEWORKS : regulators.map((r) => r.code);

  const hasFramework = checkedFw.length > 0;
  const regionalReady =
    scope !== 'regional' || (selectedRegion !== '' && selectedCountryId !== '');
  const canGenerate =
    !!companyId &&
    customYear !== null &&
    uploadedFiles.length > 0 &&
    hasFramework &&
    regionalReady;

  const disabledReason = !companyId
    ? 'You must be signed in with a company to generate a report'
    : scope === 'regional' && selectedRegion === ''
      ? 'Select a region to continue'
      : scope === 'regional' && selectedCountryId === ''
        ? 'Select a country to continue'
        : !hasFramework
          ? 'Select at least one ESG framework to continue'
          : customYear === null
            ? 'Select a reporting year to continue'
            : uploadedFiles.length === 0
              ? 'Upload a source document to continue'
              : undefined;

  const triggerGenerate = () => {
    if (!canGenerate || !companyId || uploadedFiles.length === 0 || customYear == null) return;

    const griSelected = checkedFw.some((fw) => fw.startsWith('GRI'));

    // Regional flow needs the region/country/regulator_ids passed through;
    // global ignores them. Mirrors ReportsPage.triggerGenerate exactly.
    const regionalExtras: {
      region?: string;
      country_id?: string;
      regulator_ids?: string[];
    } =
      scope === 'regional'
        ? {
            ...(selectedRegion ? { region: selectedRegion } : {}),
            ...(selectedCountryId ? { country_id: selectedCountryId } : {}),
            ...(checkedFw.length > 0
              ? {
                  regulator_ids: regulators
                    .filter((r) => checkedFw.includes(r.code))
                    .map((r) => r.id),
                }
              : {}),
          }
        : {};

    onClose();
    navigate('/reports', {
      state: {
        pendingGenerate: {
          year: customYear,
          ...(selectedSectorId ? { sector_id: selectedSectorId } : {}),
          scope_type: scope,
          framework_codes: checkedFw.map(frameworkLabelToCode),
          ...(griSelected ? { gri_scope: griScope } : {}),
          ...regionalExtras,
          files: uploadedFiles,
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
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: '#1A1D2E',
                marginBottom: 2,
              }}
            >
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
              <path
                d="M2 2l8 8M10 2l-8 8"
                stroke="#5A6080"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div style={{ padding: '22px 26px', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Row 1: Reporting Year + Industry Sector */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 16,
            }}
          >
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
                    <span style={{ fontWeight: 600, color: '#1A1D2E' }}>
                      FY {customYear}
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
              ) : (
                <select className="inp sel" value="" onChange={pickCustomYear}>
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
              )}
            </div>
            <div>
              <label className="fl-label">Industry Sector</label>
              <select
                className="inp sel"
                value={selectedSectorId}
                onChange={(e) => setSelectedSectorId(e.target.value)}
              >
                {sectorsLoading ? (
                  <option value="" disabled>
                    Loading sectors…
                  </option>
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

          {/* Row 2: Scope + conditional Region / Country */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: scope === 'regional' ? '1fr 1fr 1fr' : '1fr',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <label className="fl-label">Report Scope</label>
              <select
                className="inp sel"
                value={scope}
                onChange={(e) =>
                  handleScopeChange(e.target.value as 'global' | 'regional')
                }
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
                    onChange={(e) => handleRegionChange(e.target.value)}
                    disabled={regionsLoading}
                  >
                    <option value="">
                      {regionsLoading ? 'Loading regions…' : 'None'}
                    </option>
                    {regions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="fl-label">Country</label>
                  <select
                    className="inp sel"
                    value={selectedCountryId}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    disabled={!selectedRegion || countriesLoading}
                  >
                    <option value="">
                      {!selectedRegion
                        ? 'Pick a region first'
                        : countriesLoading
                          ? 'Loading countries…'
                          : 'None'}
                    </option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          {/* ESG Frameworks — single-select for global, multi-select for regional. */}
          <div style={{ marginBottom: 16 }}>
            <label className="fl-label">
              ESG Frameworks{' '}
              <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>
              {scope === 'regional' && selectedCountryId && (
                <span
                  style={{
                    fontWeight: 400,
                    textTransform: 'none',
                    color: '#4040C8',
                  }}
                >
                  {' '}
                  ·{' '}
                  {countries.find((c) => c.id === selectedCountryId)?.name ?? ''}
                </span>
              )}
            </label>
            {availableFrameworks.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(availableFrameworks.length, 5)},1fr)`,
                  gap: 8,
                  marginTop: 5,
                }}
              >
                {availableFrameworks.map((fw) => {
                  const isGlobal = scope === 'global';
                  const isSelected = checkedFw.includes(fw);
                  return (
                    <label
                      key={fw}
                      className={`fw-chip ${isSelected ? 'sel' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '10px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type={isGlobal ? 'radio' : 'checkbox'}
                        name={isGlobal ? 'esgmodal_global_framework' : undefined}
                        checked={isSelected}
                        onChange={() => {
                          if (isGlobal) setCheckedFw([fw]);
                          else toggleFw(fw);
                        }}
                        style={{ accentColor: '#4040C8' }}
                      />
                      <span
                        style={{ fontSize: 12, fontWeight: 600, color: '#1A1D2E' }}
                      >
                        {fw}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  padding: '14px',
                  background: '#F2F3FA',
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#9BA3C4',
                  marginTop: 5,
                }}
              >
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

          {/* GRI indicator scope — only when GRI is selected. Outer grid mirrors
              the framework chip grid so the radios sit under the GRI column. */}
          {checkedFw.some((fw) => fw.startsWith('GRI')) && (
            <div style={{ marginBottom: 16 }}>
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
                    return (
                      <label
                        key={opt.value}
                        className={`fw-chip ${active ? 'sel' : ''}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '10px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="radio"
                          name="esgmodal_gri_scope"
                          value={opt.value}
                          checked={active}
                          onChange={() => setGriScope(opt.value)}
                          style={{ accentColor: '#4040C8' }}
                        />
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            lineHeight: 1.2,
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>
                            {opt.title}
                          </span>
                          <span style={{ fontSize: 10, color: '#5A6080', marginTop: 2 }}>
                            {opt.subtitle}
                          </span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Upload Source Documents */}
          <div style={{ marginBottom: 4 }}>
            <label className="fl-label">
              Upload Source Documents{' '}
              <span style={{ color: '#E5484D', fontWeight: 700 }}>*</span>{' '}
              <span style={{ fontWeight: 400, textTransform: 'none', color: '#9BA3C4' }}>
                (PDF, DOCX, TXT, CSV, XLSX — up to {MAX_DOCUMENTS} files)
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
            {uploadedFiles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {uploadedFiles.map((f, i) => (
                  <div
                    key={`${f.name}:${f.size}`}
                    className="upload-z"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      textAlign: 'left',
                      padding: '10px 14px',
                      borderColor: '#4040C8',
                      background: 'rgba(64,64,200,.04)',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                      <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke="#4040C8" strokeWidth="1.5" strokeLinejoin="round" />
                      <path d="M12 2v4h4" stroke="#4040C8" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 1 }}>
                        {formatBytes(f.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`Remove ${f.name}`}
                      title="Remove file"
                      style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: '#9BA3C4' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
                {uploadedFiles.length < MAX_DOCUMENTS && (
                  <button
                    type="button"
                    onClick={openFilePicker}
                    style={{ fontSize: 11, fontWeight: 600, color: '#4040C8', background: 'transparent', border: '1px dashed #C5C9E0', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    + Add more files ({uploadedFiles.length}/{MAX_DOCUMENTS})
                  </button>
                )}
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
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 3v10M6 7l4-4 4 4" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: 12, color: '#5A6080' }}>
                  Click to upload or drag &amp; drop annual report, HR data,
                  financial statements
                </span>
              </div>
            )}
            {showFileCapWarning && (
              <div style={{ fontSize: 11, color: '#E5484D', marginTop: 6 }} role="alert">
                You can upload a maximum of {MAX_DOCUMENTS} documents at a time. Please split your files into smaller batches.
              </div>
            )}
            {uploadError && (
              <div style={{ fontSize: 11, color: '#E5484D', marginTop: 6 }} role="alert">
                {uploadError}
              </div>
            )}
          </div>
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
              <path
                d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z"
                fill="white"
              />
            </svg>
            Generate ESG Report
          </button>
        </div>
      </div>
    </div>
  );
}
