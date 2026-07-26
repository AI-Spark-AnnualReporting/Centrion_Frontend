import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { reports as reportsApi, quarterlyReports as quarterlyReportsApi, ApiError } from '@/lib/api';
import type { QuarterlyReportArea, ComparisonAvailability } from '@/lib/api';
import type { CompanyType, Voice, ReportTone, Comparison } from '@/types/quarterly';
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

// Per-file language-check status shown in the upload list.
type FileLangStatus = 'checking' | 'ok' | 'bad';
interface FileLangInfo {
  status: FileLangStatus;
  detected?: string;
}

const fileKey = (f: File) => `${f.name}:${f.size}`;
const langName = (l: string) => (l === 'arabic' ? 'Arabic' : 'English');

// Banner copy when a selected file is the wrong language.
function documentLanguageWarning(expected: string, detected?: string): string {
  const want = langName(expected);
  const got =
    detected === 'arabic' || detected === 'english' ? langName(detected) : null;
  const lead = got
    ? `This document looks like it's in ${got}, not ${want}.`
    : `This document doesn't look like it's in ${want}.`;
  return `${lead} This report is set to ${want} — please upload a ${want} document instead.`;
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

// Sentinel value for the "+ Add new…" option in the reporting-year select.
const ADD_NEW_SENTINEL = '__add_new__';

// ─── Confirm-context Q/A (embedded on this form) ──────────────────────────────
const CTX_COMPANY_TYPES: { label: string; value: CompanyType }[] = [
  { label: 'Bank', value: 'bank' },
  { label: 'Non-bank', value: 'non_bank' },
];

// Report tone — the prose style of the narrative. Default: formal_corporate.
const CTX_TONES: { label: string; value: ReportTone; desc: string }[] = [
  { label: 'Formal corporate', value: 'formal_corporate', desc: 'Measured, board-ready register' },
  { label: 'Investor-focused', value: 'investor_focused', desc: 'Leads with returns and outlook' },
  { label: 'Data-driven', value: 'data_driven', desc: 'Figures first, minimal narrative' },
  { label: 'Executive summary', value: 'executive_summary', desc: 'Concise, decision-oriented' },
  { label: 'Compliance-focused', value: 'compliance_focused', desc: 'Aligned to CMA / SAMA disclosure' },
  { label: 'Strategic / visionary', value: 'strategic_visionary', desc: 'Forward-looking, thematic' },
  { label: 'Simple and direct', value: 'simple_direct', desc: 'Plain language, no jargon' },
];

const CTX_VOICES: { label: string; value: Voice; locked?: boolean }[] = [
  { label: 'CEO statement · always', value: 'ceo', locked: true },
  { label: 'Chairman statement', value: 'chairman' },
  { label: 'CFO statement', value: 'cfo' },
];

// The comparison basis — single choice. Default: year-on-year.
const CTX_COMPARISONS: { label: string; value: Comparison; desc: string }[] = [
  { label: 'Year on year', value: 'yoy', desc: 'vs the same quarter last year' },
  { label: 'Previous quarter', value: 'qoq', desc: 'vs the immediately prior quarter' },
  { label: 'Both', value: 'both', desc: 'vs prior year and prior quarter' },
];

// Capsule pill — indigo border + light fill when selected; locked pills (CEO)
// render dashed/muted and are non-interactive.
function CtxPill({
  label,
  selected,
  locked,
  disabled,
  title,
  onClick,
}: {
  label: string;
  selected: boolean;
  locked?: boolean;
  // Unavailable option (e.g. no prior-period data to compare against): greyed,
  // not-allowed, non-interactive — distinct from `locked`'s dashed "always-on" look.
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}) {
  const off = locked || disabled;
  return (
    <button
      type="button"
      disabled={off}
      title={title}
      aria-pressed={selected}
      onClick={off ? undefined : onClick}
      style={{
        padding: '9px 16px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        transition: 'border-color .15s, background .15s, color .15s',
        cursor: disabled ? 'not-allowed' : locked ? 'default' : 'pointer',
        opacity: disabled ? 0.65 : 1,
        background: disabled ? '#F5F5F7' : locked ? '#F3F3FD' : selected ? '#EEEEFF' : '#fff',
        color: disabled ? '#A9ADBD' : locked ? '#8A8AC8' : selected ? '#2B2B8F' : '#3A3F5C',
        border: disabled
          ? '1.5px solid #E8E8EE'
          : locked
          ? '1.5px dashed #4040C8'
          : `1.5px solid ${selected ? '#4040C8' : '#E4E6F1'}`,
      }}
      onMouseEnter={(e) => {
        if (!off && !selected) {
          e.currentTarget.style.borderColor = '#C4C7F0';
          e.currentTarget.style.background = '#FAFAFF';
        }
      }}
      onMouseLeave={(e) => {
        if (!off && !selected) {
          e.currentTarget.style.borderColor = '#E4E6F1';
          e.currentTarget.style.background = '#fff';
        }
      }}
    >
      {label}
    </button>
  );
}

// Green "DETECTED" capsule — shown on a card whose value was auto-detected.
function DetectedBadge() {
  return (
    <span
      style={{
        flexShrink: 0,
        borderRadius: 999,
        background: '#E7F7EF',
        color: '#10B981',
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        padding: '3px 9px',
      }}
    >
      Detected
    </span>
  );
}

// Numbered question card for the embedded confirm-context questions.
function CtxCard({
  n,
  title,
  helper,
  detected,
  children,
}: {
  n: number;
  title: string;
  helper?: string;
  detected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: '1px solid #ECEEF8',
        borderRadius: 14,
        padding: '14px 16px 16px',
        background: '#fff',
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 8,
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 800,
            color: '#4040C8',
            background: '#EEEEFF',
          }}
        >
          {n}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1D2E', lineHeight: 1.4 }}>
            {title}
          </div>
          {helper && (
            <div style={{ fontSize: 12, color: '#5A6080', marginTop: 3, lineHeight: 1.4 }}>
              {helper}
            </div>
          )}
        </div>
        {detected && <DetectedBadge />}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginLeft: 34 }}>{children}</div>
    </div>
  );
}

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
  const location = useLocation();

  // Handed over when the user is routed back here to correct a period_not_found
  // error: `prefill*` seeds the pickers (parsed from the first available period)
  // and `periodError` drives the modal shown over this form. Read once.
  const nav = location.state as {
    prefillQuarter?: string;
    prefillYear?: number;
    periodError?: {
      requestedPeriod: string;
      availablePeriods: string[];
      message: string;
    };
  } | null;
  const prefillQuarter = QUARTERS.includes(nav?.prefillQuarter as Quarter)
    ? (nav?.prefillQuarter as Quarter)
    : null;
  const prefillYear =
    typeof nav?.prefillYear === 'number' ? nav.prefillYear : null;

  // The period_not_found modal shown over the form. Seeded from router state and
  // dismissible; once closed it stays closed for this mount.
  const [periodError, setPeriodError] = useState(nav?.periodError ?? null);

  // Collapsible card — mirrors the ESG "Validate Report" card, open by default.
  const [genOpen, setGenOpen] = useState(true);

  // Reporting-year dropdown state — mirrors the ESG flow: pick an existing
  // report or "+ Add new…" → year picker.
  const [customYear, setCustomYear] = useState<number | null>(prefillYear);
  const [isAddingNewPeriod, setIsAddingNewPeriod] = useState<boolean>(
    prefillYear == null && existingReports.length === 0,
  );
  // Starts UNSELECTED so the user must explicitly pick a quarter — the comparison
  // options stay disabled until both year and quarter are chosen (we can't know
  // which prior periods to check for data until the target period is known).
  const [quarter, setQuarter] = useState<Quarter | null>(prefillQuarter ?? null);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);

  // Language the generated report is written in. UI stays English/LTR — this
  // only drives the backend narrative, gap questions, and RTL export.
  const [language, setLanguage] = useState<'english' | 'arabic'>('english');

  // Existing-report mode — set when user picks an existing report from the dropdown.
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [existingSource, setExistingSource] = useState<'open' | 'upload'>('open');
  // Coverage summary for the selected existing report (doc count + period label).
  const [existingDocCount, setExistingDocCount] = useState<number | null>(null);
  const [existingPeriodLabel, setExistingPeriodLabel] = useState<string | null>(null);
  const [existingCoverageLoading, setExistingCoverageLoading] = useState(false);

  // Report areas come from the API. The picker UI is hidden; areas are always
  // all-selected and sent in the generate payload.
  const [areas, setAreas] = useState<AreaCard[]>([]);
  // Area whose full metric list is shown in the popup (null = closed).
  const [metricsModal, setMetricsModal] = useState<AreaCard | null>(null);

  // Confirm-context answers (embedded cards), held locally until submit and sent
  // in the single generate call. company_type is auto-selected from the detected
  // company sector (overridable); report tone starts unselected; voices defaults
  // to the always-on CEO.
  const [companyType, setCompanyType] = useState<CompanyType | null>(null);
  // Detected company type (from the detect-company-type endpoint). Drives the
  // DETECTED badge, shown while the selection still matches the detected value.
  const [detectedCompanyType, setDetectedCompanyType] = useState<CompanyType | null>(null);
  // No default — the user picks a tone (or leaves it unset; backend defaults).
  const [reportTone, setReportTone] = useState<ReportTone | null>(null);
  const [voices, setVoices] = useState<Voice[]>(['ceo']);
  // Comparison basis — single choice ("Confirm context" Q4). Default: YoY.
  const [comparison, setComparison] = useState<Comparison>('yoy');
  // Comparison-data gate. When a comparison + period are set we check the backend
  // for prior-period figures: Generate is disabled while 'checking'; 'missing'
  // pops the no-data dialog and keeps Generate disabled. New-report branch only.
  const [comparisonCheck, setComparisonCheck] =
    useState<'idle' | 'checking' | 'ok' | 'missing'>('idle');
  const [comparisonMissing, setComparisonMissing] = useState<ComparisonAvailability | null>(null);
  // Per-basis prior-data availability for the chosen year+quarter (null until both
  // are set). Drives which comparison pills are enabled. { qoq, yoy, both } where
  // both = qoq && yoy. From the backend `comparison-availability` specs[].present.
  const [compAvail, setCompAvail] = useState<Record<Comparison, boolean> | null>(null);

  const toggleVoice = (v: Voice) => {
    if (v === 'ceo') return; // always on, locked
    setVoices((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  // On mount (company known): detect the company type from its sector and
  // pre-select it. Detection only — no report exists yet. Fail-soft: if the
  // endpoint isn't available, the user picks manually (no badge).
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    quarterlyReportsApi
      .detectCompanyType(companyId)
      .then((res) => {
        if (cancelled) return;
        const detected = res.detected_company_type ?? null;
        setDetectedCompanyType(detected);
        // Pre-select only if the user hasn't already chosen.
        if (detected) setCompanyType((prev) => prev ?? detected);
      })
      .catch(() => {
        // No detection available — leave the pill unselected for manual choice.
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showFileCapWarning, setShowFileCapWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload-time per-file language check, keyed by `${name}:${size}`. Files are
  // checked the moment they're added and re-checked when the language toggles.
  const [fileLang, setFileLang] = useState<Record<string, FileLangInfo>>({});
  const languageRef = useRef(language);
  const filesRef = useRef(files);

  const [genError, setGenError] = useState<string | null>(null);
  const [isSubmittingGenerate, setIsSubmittingGenerate] = useState(false);
  const genRequestIdRef = useRef(0);

  // How many more documents can be added to the selected existing report.
  const remainingSlots =
    existingDocCount != null ? MAX_DOCUMENTS - existingDocCount : MAX_DOCUMENTS;

  const isUploadMode = !!selectedReportId;
  const isOpenMode = false;

  // The pills are pre-disabled for unavailable bases (see compAvail), so a click
  // only ever lands on a valid choice — just record it.
  const selectComparison = (v: Comparison) => setComparison(v);

  // Per-basis prior-data availability. Runs once BOTH year and quarter are set
  // (new-report branch only): a single 'both' call returns present flags for qoq
  // AND yoy, from which we derive which comparison pills are enabled. Fails open
  // (allow all) so a transient check error never blocks the user — the backend
  // still only renders a comparison where data actually exists.
  useEffect(() => {
    if (isUploadMode || isOpenMode || !companyId || customYear == null || quarter == null) {
      setCompAvail(null);
      setComparisonCheck('idle');
      return;
    }
    let cancelled = false;
    setComparisonCheck('checking');
    quarterlyReportsApi
      .checkComparisonAvailability(companyId, { year: customYear, quarter, comparison: 'both' })
      .then((res) => {
        if (cancelled) return;
        const present = (k: string) => res.specs.some((s) => s.key === k && s.present);
        const qoq = present('qoq');
        const yoy = present('yoy');
        setCompAvail({ qoq, yoy, both: qoq && yoy });
        setComparisonCheck('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setCompAvail({ qoq: true, yoy: true, both: true });
        setComparisonCheck('ok');
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, customYear, quarter, isUploadMode, isOpenMode]);

  // Keep the selection valid: if the chosen basis isn't available, fall back to an
  // available one (prefer YoY, then QoQ). When none are available the report is
  // generated current-period-only (the payload omits `comparison`).
  useEffect(() => {
    if (!compAvail || compAvail[comparison]) return;
    const next: Comparison | null = compAvail.yoy ? 'yoy' : compAvail.qoq ? 'qoq' : null;
    if (next && next !== comparison) setComparison(next);
  }, [compAvail, comparison]);

  // Fetch the report-area cards once on mount. The list is company-agnostic.
  // The picker is hidden — every area is always selected and sent in the
  // generate payload (report scope is not a user choice).
  useEffect(() => {
    let cancelled = false;
    reportsApi
      .getQuarterlyReportAreas()
      .then((res) => {
        if (cancelled) return;
        const cards = (res.areas ?? []).map(toAreaCard);
        setAreas(cards);
        setSelectedAreas(cards.map((c) => c.key)); // always select all
      })
      .catch(() => {
        // Areas failed to load — send none and let the backend default to all.
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

  // Auto-dismiss the error toast after 5 s.
  useEffect(() => {
    if (!genError) return;
    const t = setTimeout(() => setGenError(null), 5000);
    return () => clearTimeout(t);
  }, [genError]);

  // Close the metrics popup on Escape.
  useEffect(() => {
    if (!metricsModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMetricsModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [metricsModal]);

  // Close the period_not_found modal on Escape.
  useEffect(() => {
    if (!periodError) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPeriodError(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [periodError]);

  // Router state lives in window.history.state, which SURVIVES a page refresh —
  // so without this the modal (and prefill) would re-appear on every reload. We
  // captured everything into local state / initial state above, so strip the
  // history entry's state once on mount.
  useEffect(() => {
    if (nav) navigate(location.pathname, { replace: true, state: null });
    // Mount-only: `nav` is read once and cleared here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Keep refs current so the language-change effect can re-check the live file
  // list, and async check results can tell if the language changed mid-flight.
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Ask the backend whether each file is in `lang`. Fail-open: a network/check
  // error resolves the file to "ok" (the submit-time gate is the real backstop).
  // Stale results (language toggled while a check was in flight) are dropped.
  const runCheck = (list: File[], lang: 'english' | 'arabic') => {
    list.forEach((file) => {
      const id = fileKey(file);
      setFileLang((prev) => ({ ...prev, [id]: { status: 'checking' } }));
      reportsApi
        .checkLanguage(file, lang)
        .then((res) => {
          if (languageRef.current !== lang) return; // stale — a newer check owns it
          const detected =
            res.detected_language === 'arabic' || res.detected_language === 'english'
              ? res.detected_language
              : undefined;
          setFileLang((prev) => ({
            ...prev,
            [id]: { status: res.matches ? 'ok' : 'bad', detected },
          }));
        })
        .catch(() => {
          if (languageRef.current !== lang) return;
          setFileLang((prev) => ({ ...prev, [id]: { status: 'ok' } }));
        });
    });
  };

  // Re-check every selected file whenever the report language toggles, since a
  // file's correctness depends on the chosen language.
  useEffect(() => {
    languageRef.current = language;
    if (filesRef.current.length > 0) runCheck(filesRef.current, language);
    // runCheck is intentionally omitted — it is recreated each render and only
    // the language change should drive a re-check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

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
      // Genuinely-new files (not already in the list) get language-checked.
      const existing = new Set(files.map(fileKey));
      const fresh = accepted.filter((f) => !existing.has(fileKey(f)));
      setFiles((prev) => {
        // De-dupe by name + size so re-dropping the same file is a no-op.
        const seen = new Set(prev.map(fileKey));
        const merged = [...prev];
        accepted.forEach((f) => {
          const id = fileKey(f);
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
      if (fresh.length > 0) runCheck(fresh, language);
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
    const removed = files[index];
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (removed) {
      setFileLang((prev) => {
        const { [fileKey(removed)]: _drop, ...rest } = prev;
        return rest;
      });
    }
    setGenError(null);
  };

  // --- Upload-time language check (blocks Generate for new reports) --------
  const anyChecking = files.some((f) => fileLang[fileKey(f)]?.status === 'checking');
  const badFiles = files.filter((f) => fileLang[fileKey(f)]?.status === 'bad');
  const langBlocked = anyChecking || badFiles.length > 0;
  const languageWarning =
    badFiles.length > 0
      ? documentLanguageWarning(language, fileLang[fileKey(badFiles[0])]?.detected)
      : null;

  // --- Submit --------------------------------------------------------------
  const hasFiles = files.length > 0;

  // New-report submit requires a company type (pre-selected from detection, but
  // must be set). Report tone is default-selected and voices always has CEO, so
  // neither gates. Report areas are always all-selected behind the scenes.
  const contextComplete = companyType != null;

  // Comparison gate blocks the new-report branch only WHILE the availability
  // check is in flight. Missing prior data does NOT block generation — it just
  // pops a heads-up and the report skips the comparison where data is absent.
  const comparisonBlocked = comparisonCheck === 'checking';

  const canGenerate =
    !!companyId &&
    !isSubmittingGenerate &&
    (isOpenMode ||
      (isUploadMode && hasFiles) ||
      (!selectedReportId &&
        customYear != null &&
        quarter != null &&
        hasFiles &&
        !langBlocked &&
        !comparisonBlocked &&
        contextComplete));

  const disabledReason = isOpenMode
    ? undefined
    : isUploadMode
      ? !hasFiles
        ? 'Upload at least one source document to continue'
        : undefined
      : customYear == null
        ? 'Select a reporting year to continue'
        : quarter == null
          ? 'Select a reporting quarter to continue'
          : !hasFiles
            ? 'Upload at least one source document to continue'
            : anyChecking
              ? 'Checking document language…'
              : badFiles.length > 0
                ? 'Remove the wrong-language document to continue'
                : companyType == null
                  ? 'Select the company type to continue'
                  : comparisonCheck === 'checking'
                    ? 'Checking comparison data…'
                    : undefined;

  const extractApiError = (err: unknown): string => {
    if (err instanceof ApiError) {
      const body = err.body as
        | { detail?: string | { error?: string } | Array<{ msg?: string }> }
        | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
      if (detail && typeof detail === 'object' && 'error' in detail && detail.error) {
        return detail.error;
      }
    }
    if (err instanceof Error) return err.message;
    return 'Something went wrong. Please try again.';
  };

  const triggerGenerate = () => {
    if (!canGenerate || !companyId) return;

    // Branch A — open existing report: navigate straight to the outline.
    if (isOpenMode && selectedReportId) {
      navigate(`/quarterly-report/${selectedReportId}/outline`);
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

    // Branch C — new report. company_type is required (guaranteed by
    // `canGenerate`, re-checked here to narrow the nullable state type).
    if (customYear == null || quarter == null || companyType == null) return;
    const requestId = ++genRequestIdRef.current;
    setGenError(null);
    setIsSubmittingGenerate(true);

    // Single creation call — the report is created already configured with the
    // confirm-context answers. No separate PATCH /context (the report_id only
    // exists after this returns, which is what previously caused the 404).
    reportsApi
      .generateQuarterly(companyId, {
        files,
        year: customYear,
        quarter,
        areas: selectedAreas,
        content_language: language,
        company_type: companyType,
        voices,
        report_tone: reportTone ?? undefined,
        // Only send a basis we actually have prior data for; otherwise omit it so
        // the report is generated current-period-only (no empty comparison column).
        comparison: compAvail && compAvail[comparison] ? comparison : undefined,
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
        {/* Report language — English (default) or Arabic. Drives the generated
            report content + export only; the app UI stays English/LTR. */}
        <div style={{ marginBottom: 18 }}>
          <label className="fl-label">Report Language</label>
          {/* Arabic is hidden for now — English only. `language` stays 'english'. */}
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`tab ${language === 'english' ? 'act' : ''}`}
              onClick={() => setLanguage('english')}
            >
              English
            </button>
          </div>
        </div>

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
                  {yearPickerOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
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
                value={quarter ?? ''}
                onChange={(e) =>
                  setQuarter(e.target.value ? (e.target.value as Quarter) : null)
                }
              >
                <option value="" disabled>
                  Select quarter…
                </option>
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
            <select className="inp sel" value="upload" onChange={() => {}}>
              <option value="upload">Upload new documents</option>
            </select>
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
                {files.map((file, index) => {
                  const st = fileLang[fileKey(file)]?.status;
                  const isChecking = st === 'checking';
                  const isBad = st === 'bad';
                  return (
                    <div
                      key={`${file.name}:${file.size}:${index}`}
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        padding: '10px 10px 8px',
                        borderRadius: 8,
                        border: `1px solid ${isBad ? 'rgba(229,72,77,.45)' : '#4040C8'}`,
                        background: isBad ? 'rgba(229,72,77,.06)' : 'rgba(64,64,200,.04)',
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
                        <div
                          style={{
                            fontSize: 10,
                            color: isBad ? '#B33A3E' : '#9BA3C4',
                            fontWeight: isBad ? 700 : 400,
                            marginTop: 2,
                          }}
                        >
                          {isChecking
                            ? 'Checking language…'
                            : isBad
                              ? 'Wrong language'
                              : formatBytes(file.size)}
                        </div>
                      </div>
                      {st && (
                        <span
                          aria-hidden
                          title={
                            isChecking
                              ? 'Checking language'
                              : isBad
                                ? 'Wrong language'
                                : 'Language OK'
                          }
                          style={{
                            position: 'absolute',
                            top: 6,
                            right: 22,
                            fontSize: 11,
                            fontWeight: 800,
                            lineHeight: 1,
                            color: isChecking ? '#9BA3C4' : isBad ? '#E5484D' : '#2E9B57',
                          }}
                        >
                          {isChecking ? '⋯' : isBad ? '⚠' : '✓'}
                        </span>
                      )}
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
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Wrong-language banner (upload-time check) */}
        {languageWarning && (
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
            {languageWarning}
          </div>
        )}

        {/* Confirm context — new-report mode only. Held locally and sent inside
            the single generate call (no GET/PATCH context at creation). */}
        {!selectedReportId && (
          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span style={{ width: 18, height: 2, background: '#4040C8', borderRadius: 2 }} />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: '#4040C8',
                }}
              >
                Confirm Context
              </span>
            </div>

            {/* Card 1 — company type (auto-selected from detected sector) */}
            <CtxCard
              n={1}
              title="What kind of company is this report for?"
              helper="Sets which sections are required — banks vs non-banks differ."
              detected={detectedCompanyType != null && companyType === detectedCompanyType}
            >
              {CTX_COMPANY_TYPES.map((c) => (
                <CtxPill
                  key={c.value}
                  label={c.label}
                  selected={companyType === c.value}
                  onClick={() => setCompanyType(c.value)}
                />
              ))}
            </CtxCard>

            {/* Card 2 — report tone (single-select; default formal_corporate) */}
            <CtxCard
              n={2}
              title="What tone should the report take?"
              helper="Sets the writing style of the narrative."
            >
              {CTX_TONES.map((t) => (
                <CtxPill
                  key={t.value}
                  label={t.label}
                  title={t.desc}
                  selected={reportTone === t.value}
                  onClick={() => setReportTone(t.value)}
                />
              ))}
            </CtxCard>

            {/* Card 3 — executive voices (multi-select; CEO locked-on) */}
            <CtxCard
              n={3}
              title="Which executive voices will the report carry?"
              helper="CEO statement is always included; add the others if your report uses them."
            >
              {CTX_VOICES.map((v) => (
                <CtxPill
                  key={v.value}
                  label={v.label}
                  locked={v.locked}
                  selected={v.locked ? true : voices.includes(v.value)}
                  onClick={() => toggleVoice(v.value)}
                />
              ))}
            </CtxCard>

            {/* Card 4 — comparison basis (single-select; default YoY). Disabled
                until year+quarter are chosen, then each basis is enabled only if we
                have prior-period data for it (checked against qr_figures). */}
            {(() => {
              const periodChosen = customYear != null && quarter != null;
              const checking = comparisonCheck === 'checking';
              const unavailTitle: Record<Comparison, string> = {
                yoy: 'No same-quarter-last-year data to compare against',
                qoq: 'No previous-quarter data to compare against',
                both: 'Needs both prior-year and prior-quarter data',
              };
              return (
                <CtxCard
                  n={4}
                  title="What should this quarter be compared against?"
                  helper={
                    !periodChosen
                      ? 'Select the reporting year and quarter first.'
                      : checking
                        ? 'Checking which comparisons we have data for…'
                        : 'Only comparisons we have prior-period data for are enabled.'
                  }
                >
                  {CTX_COMPARISONS.map((c) => {
                    const avail = compAvail?.[c.value] ?? false;
                    const disabled = !periodChosen || checking || !avail;
                    const title = !periodChosen
                      ? 'Select the reporting year and quarter first'
                      : checking
                        ? 'Checking available data…'
                        : !avail
                          ? unavailTitle[c.value]
                          : c.desc;
                    return (
                      <CtxPill
                        key={c.value}
                        label={c.label}
                        title={title}
                        selected={comparison === c.value && avail}
                        disabled={disabled}
                        onClick={() => selectComparison(c.value)}
                      />
                    );
                  })}
                </CtxCard>
              );
            })()}
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

      {/* Error toast — slides in top-right, auto-dismisses after 5 s */}
      {genError && (
        <div
          role="alert"
          onClick={() => setGenError(null)}
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 1200,
            width: 'min(380px, calc(100vw - 40px))',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            padding: '14px 16px',
            borderRadius: 14,
            background: '#fff',
            border: '1px solid rgba(229,72,77,.2)',
            boxShadow: '0 16px 40px rgba(229,72,77,.18), 0 4px 12px rgba(20,22,40,.08)',
            cursor: 'pointer',
            overflow: 'hidden',
            animation: 'qr-toast-in .35s cubic-bezier(.21,1.02,.73,1)',
          }}
        >
          <style>{`
            @keyframes qr-toast-in {
              from { opacity: 0; transform: translateX(24px) scale(.96); }
              to   { opacity: 1; transform: translateX(0) scale(1); }
            }
            @keyframes qr-toast-bar {
              from { transform: scaleX(1); }
              to   { transform: scaleX(0); }
            }
          `}</style>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              flexShrink: 0,
              background: 'rgba(229,72,77,.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 6v5M10 14h.01" stroke="#E5484D" strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="10" r="8.5" stroke="#E5484D" strokeWidth="1.5" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E', marginBottom: 2 }}>
              Couldn't generate report
            </div>
            <div style={{ fontSize: 12, color: '#5A6080', lineHeight: 1.5, wordBreak: 'break-word' }}>
              {genError}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGenError(null);
            }}
            aria-label="Dismiss"
            title="Dismiss"
            style={{
              width: 22,
              height: 22,
              flexShrink: 0,
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
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          {/* Countdown progress bar */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: 3,
              width: '100%',
              background: '#E5484D',
              transformOrigin: 'left',
              animation: 'qr-toast-bar 5s linear forwards',
            }}
          />
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

      {/* Period-not-found modal — shown over the (pre-filled) form when a run
          failed because the requested quarter/year wasn't in the documents. */}
      {periodError && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Requested period not found"
          onClick={() => setPeriodError(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            background: 'rgba(20,22,40,.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            animation: 'fade-in .25s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(460px, 100%)',
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 24px 60px rgba(20,22,40,.28)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '18px 22px',
                borderBottom: '1px solid #ECEEF8',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'rgba(245,158,11,.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 6v5M10 14h.01"
                    stroke="#D97706"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="10" cy="10" r="8.5" stroke="#D97706" strokeWidth="1.5" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
                That period isn't in your documents
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 22px 20px' }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: '#3A3F5C',
                  lineHeight: 1.6,
                }}
              >
                {periodError.message ||
                  `The uploaded document doesn't contain data for ${formatPeriod(
                    periodError.requestedPeriod,
                  )}. Correct the quarter/year and upload again.`}
              </p>

              {periodError.availablePeriods.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '.5px',
                      textTransform: 'uppercase',
                      color: '#9BA3C4',
                      marginBottom: 8,
                    }}
                  >
                    Available period
                    {periodError.availablePeriods.length === 1 ? '' : 's'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {periodError.availablePeriods.map((p) => (
                      <span
                        key={p}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '6px 12px',
                          borderRadius: 999,
                          background: '#EEF0FB',
                          border: '1px solid #DDE0F2',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#3A3F5C',
                        }}
                      >
                        {formatPeriod(p)}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 22,
                }}
              >
                <button
                  type="button"
                  onClick={() => setPeriodError(null)}
                  style={{
                    padding: '10px 22px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#fff',
                    background: '#4040C8',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                  }}
                >
                  Correct &amp; re-upload
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison "no data" dialog — the chosen comparison period(s) have no
          figures in the DB. Placeholder handling for now (dismiss + Generate
          stays disabled until the user picks a comparison/period that has data). */}
      {comparisonMissing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="No data to compare against"
          onClick={() => setComparisonMissing(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1300,
            background: 'rgba(20,22,40,.45)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            animation: 'fade-in .25s ease-out',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(460px, 100%)',
              background: '#fff',
              borderRadius: 16,
              boxShadow: '0 24px 60px rgba(20,22,40,.28)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '18px 22px',
                borderBottom: '1px solid #ECEEF8',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: 'rgba(245,158,11,.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M10 6v5M10 14h.01" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="10" cy="10" r="8.5" stroke="#D97706" strokeWidth="1.5" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
                No data to compare against
              </div>
            </div>

            <div style={{ padding: '16px 22px 20px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#3A3F5C', lineHeight: 1.6 }}>
                We don't have data for{' '}
                <strong>
                  {comparisonMissing.specs
                    .filter((s) => !s.present)
                    .map((s) => s.label)
                    .join(' and ')}
                </strong>{' '}
                to compare this quarter against. Pick a different comparison or reporting period to
                continue.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
                <button
                  type="button"
                  onClick={() => setComparisonMissing(null)}
                  style={{
                    padding: '10px 22px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#fff',
                    background: '#4040C8',
                    border: 'none',
                    borderRadius: 10,
                    cursor: 'pointer',
                  }}
                >
                  Got it
                </button>
              </div>
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
