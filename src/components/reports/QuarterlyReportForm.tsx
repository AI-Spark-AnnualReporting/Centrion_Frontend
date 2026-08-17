import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  reports as reportsApi,
  quarterlyReports as quarterlyReportsApi,
  companies as companiesApi,
  ApiError,
} from '@/lib/api';
import type {
  QuarterlyReportArea,
  ComparisonAvailability,
  QuarterlySystemMetricsResponse,
} from '@/lib/api';
import type { CompanyType, Voice, ReportTone, Comparison, MetricsMode } from '@/types/quarterly';
import type { ProcessingPageState } from '@/pages/ProcessingPage';
import {
  REPORTING_CURRENCIES,
  FINANCIAL_SCALES,
  DEFAULT_CURRENCY,
  isKnownCurrency,
  normaliseCurrencyCode,
  type FinancialScale,
} from '@/constants/currency';

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

// Same idea for the financial lane, where the question is "can we read any figures
// out of this". A .docx is read as TABLES ONLY, so a Word file of prose is an empty
// file to us and the report would come out with every number blank.
type FinTableStatus = 'checking' | 'ok' | 'none';
interface FinTableInfo {
  status: FinTableStatus;
  tableCount?: number;
  message?: string;
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

// Two upload lanes with no overlap: narrative documents (PDF/DOCX) supply the
// prose and NO figures, and the financial-data lane (Excel/CSV/Word) supplies
// every number, read as exact cells with no OCR in the path.
const ACCEPTED_UPLOAD_EXT = ['.pdf', '.docx'] as const;
const ACCEPTED_UPLOAD_ATTR = ACCEPTED_UPLOAD_EXT.join(',');
const ACCEPTED_FIN_EXT = ['.xlsx', '.csv', '.docx'] as const;
const ACCEPTED_FIN_ATTR = ACCEPTED_FIN_EXT.join(',');
const MAX_DOCUMENTS = 10;  // combined cap across both lanes (backend: MAX_QUARTERLY_DOCUMENTS)

function hasAcceptedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_UPLOAD_EXT.some((ext) => lower.endsWith(ext));
}

function hasFinExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_FIN_EXT.some((ext) => lower.endsWith(ext));
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

// "a" → "a"; "a","b" → "a and b"; "a","b","c" → "a, b and c".
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Sentinel value for the "+ Add new…" option in the reporting-year select.
const ADD_NEW_SENTINEL = '__add_new__';

// ─── Confirm-context Q/A (embedded on this form) ──────────────────────────────
const CTX_COMPANY_TYPES: { label: string; value: CompanyType }[] = [
  // Display labels only — values stay bank/non_bank so all backend logic is unchanged.
  { label: 'Financial', value: 'bank' },
  { label: 'Non-financial', value: 'non_bank' },
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
  note,
  children,
}: {
  n: number;
  title: string;
  helper?: string;
  detected?: boolean;
  // Optional block rendered under the options, at the same indent — used by the
  // comparison card for the cross-metrics caution.
  note?: React.ReactNode;
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
      {note && <div style={{ marginLeft: 34, marginTop: 12 }}>{note}</div>}
    </div>
  );
}

// The "?" affordance that sits inside a `.fl-label` and explains what the field
// wants. Opens on hover and pins on click, so pointer and keyboard users get the
// same panel. The parent owns `openId` rather than each instance owning a boolean
// — that is what keeps two panels from being open at once.
function LabelHelp({
  id,
  openId,
  onOpenChange,
  ariaLabel,
  panelLabel,
  heading,
  children,
  width = 290,
}: {
  id: string;
  openId: string | null;
  onOpenChange: (next: string | null) => void;
  ariaLabel: string;
  panelLabel: string;
  heading?: string;
  children: React.ReactNode;
  width?: number;
}) {
  const open = openId === id;
  const pinnedRef = useRef(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  // Same 120/180ms pacing as the metrics catalogue: the open delay stops a flash
  // when the pointer merely crosses the label, the close delay lets it travel
  // into the panel.
  const handleEnter = () => {
    clearTimers();
    openTimer.current = setTimeout(() => onOpenChange(id), 120);
  };

  const handleLeave = () => {
    clearTimers();
    if (pinnedRef.current) return;
    closeTimer.current = setTimeout(() => onOpenChange(null), 180);
  };

  const togglePin = () => {
    clearTimers();
    const next = !(pinnedRef.current && open);
    pinnedRef.current = next;
    onOpenChange(next ? id : null);
  };

  useEffect(() => () => clearTimers(), []);

  // A panel closed by the parent (Escape, or another "?" opening) must drop its
  // pin too, or the next hover-out would refuse to close it.
  useEffect(() => {
    if (!open) pinnedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(null);
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      onOpenChange(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, onOpenChange]);

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onFocus={handleEnter}
        onClick={togglePin}
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '1px solid #9BA3C4',
          background: open ? '#4040C8' : 'transparent',
          color: open ? '#fff' : '#9BA3C4',
          fontSize: 10,
          fontWeight: 800,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          flexShrink: 0,
        }}
      >
        ?
      </button>

      {open && (
        <div
          role="note"
          aria-label={panelLabel}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          style={{
            position: 'absolute',
            top: 'calc(100% + 9px)',
            left: -10,
            zIndex: 40,
            width,
            padding: '12px 14px',
            borderRadius: 12,
            border: '1px solid #ECEEF8',
            background: '#fff',
            boxShadow: '0 12px 32px rgba(20,22,40,.16)',
            // The parent .fl-label is uppercase + letter-spaced; reset so the
            // help copy reads as normal prose.
            textTransform: 'none',
            letterSpacing: 'normal',
            fontSize: 11.5,
            fontWeight: 400,
            color: '#5A6080',
            lineHeight: 1.55,
            cursor: 'default',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -5,
              left: 14,
              width: 9,
              height: 9,
              background: '#fff',
              borderLeft: '1px solid #ECEEF8',
              borderTop: '1px solid #ECEEF8',
              transform: 'rotate(45deg)',
            }}
          />
          {heading && (
            <div style={{ color: '#1A1D2E', fontWeight: 700, marginBottom: 6 }}>{heading}</div>
          )}
          {children}
        </div>
      )}
    </span>
  );
}

// Bulleted list inside a LabelHelp panel. A real <ul> so screen readers announce
// the item count instead of reading a run-on sentence.
function HelpList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 16 }}>
      {items.map((it) => (
        <li key={it} style={{ marginBottom: 2 }}>
          {it}
        </li>
      ))}
    </ul>
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
  // The raw specs behind compAvail, kept so the card can distinguish "no prior
  // data at all" from "prior data exists but in the other metrics lane", plus
  // the mode the backend actually answered for (the radio may have moved since).
  const [compSpecs, setCompSpecs] = useState<ComparisonAvailability['specs'] | null>(null);
  const [compCheckedMode, setCompCheckedMode] = useState<MetricsMode | null>(null);

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

  // Dedicated financial-data lane (Excel/CSV/Word) — exact figures via the lean
  // spreadsheet flow. No language check (numbers, not prose). Currency and scale
  // are declared here rather than auto-detected: detection resolves a single
  // sheet-wide value, so a sheet carrying both SAR and USD columns produced every
  // metric twice in the report.
  const [financialFiles, setFinancialFiles] = useState<File[]>([]);
  const [isDraggingFin, setIsDraggingFin] = useState(false);
  const financialInputRef = useRef<HTMLInputElement>(null);
  // null = the user hasn't touched it, so the company default still applies.
  // Storing the choice separately (rather than seeding state from the fetch) is
  // what stops a late /companies/me resolve from clobbering a picked currency.
  const [financialCurrency, setFinancialCurrency] = useState<string | null>(null);
  const [companyCurrency, setCompanyCurrency] = useState<string | null>(null);
  // Deliberately no default: a pre-selected scale is a guess, and a silently
  // mis-scaled report is exactly what this field exists to prevent.
  const [financialScale, setFinancialScale] = useState<FinancialScale | ''>('');
  const currencyValue = financialCurrency ?? companyCurrency ?? DEFAULT_CURRENCY;

  // System vs Custom metrics. system (default) = map the sheet to our standard
  // metrics + template. custom = extract the sheet's lines as-is, section-assigned.
  // Both modes take their figures from the Financial Data field.
  const [metricsMode, setMetricsMode] = useState<MetricsMode>('system');
  // Which "?" panel is open, by id — one slot, so opening one closes the others.
  const [helpOpen, setHelpOpen] = useState<string | null>(null);
  // The standard metric catalogue behind the "System metrics" hover list. null
  // until the mount fetch lands (or if it fails) — the hover affordance is
  // hidden in that case rather than opening an empty panel.
  const [systemMetrics, setSystemMetrics] =
    useState<QuarterlySystemMetricsResponse | null>(null);
  // Hover panel: `pinned` survives mouseleave so click/keyboard users can keep
  // it open. The timers give the pointer time to travel into the panel — without
  // the close delay the list closes before it can be scrolled.
  const [metricsListOpen, setMetricsListOpen] = useState(false);
  const [metricsListPinned, setMetricsListPinned] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metricsBlockRef = useRef<HTMLDivElement>(null);

  // Short open delay so the list doesn't flash when the pointer merely crosses
  // the radio; the close delay lets the pointer travel into the panel to scroll.
  const openMetricsList = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    openTimerRef.current = setTimeout(() => setMetricsListOpen(true), 120);
  };

  const closeMetricsList = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    // A pinned list stays put until Escape, an outside click, or the pill again.
    if (metricsListPinned) return;
    closeTimerRef.current = setTimeout(() => setMetricsListOpen(false), 180);
  };

  // Shut the list immediately, ignoring the pin and any pending timers — for
  // when the trigger itself is about to disappear.
  const resetMetricsList = () => {
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setMetricsListOpen(false);
    setMetricsListPinned(false);
  };

  // Upload-time per-file language check, keyed by `${name}:${size}`. Files are
  // checked the moment they're added and re-checked when the language toggles.
  const [fileLang, setFileLang] = useState<Record<string, FileLangInfo>>({});
  const languageRef = useRef(language);
  const filesRef = useRef(files);

  // The financial lane's equivalent, keyed the same way. Unlike the language check
  // this doesn't depend on any other form choice, so a file is checked once when it
  // is added and never re-checked.
  const [finTables, setFinTables] = useState<Record<string, FinTableInfo>>({});
  // Mirrored in a ref because an in-flight check has to know, the moment its answer
  // lands, whether the file is still attached — and state read from a closure is
  // whatever it was when the check started. A key is present here from the instant
  // the file is added until the instant it is removed, so `id in ref` IS the
  // question "is this file still on the form".
  const finTablesRef = useRef<Record<string, FinTableInfo>>({});
  const writeFinTables = (next: Record<string, FinTableInfo>) => {
    finTablesRef.current = next;
    setFinTables(next);
  };
  // The popup itself — set when a check comes back with nothing readable in the file.
  const [noTablesPopup, setNoTablesPopup] = useState<
    { key: string; name: string; message: string } | null
  >(null);

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
      setCompSpecs(null);
      setCompCheckedMode(null);
      setComparisonCheck('idle');
      return;
    }
    let cancelled = false;
    setComparisonCheck('checking');
    quarterlyReportsApi
      // custom reports match the prior period by label → check prior CUSTOM data.
      .checkComparisonAvailability(companyId, { year: customYear, quarter, comparison: 'both', metrics_mode: metricsMode })
      .then((res) => {
        if (cancelled) return;
        const present = (k: string) => res.specs.some((s) => s.key === k && s.present);
        const qoq = present('qoq');
        const yoy = present('yoy');
        setCompAvail({ qoq, yoy, both: qoq && yoy });
        setCompSpecs(res.specs);
        setCompCheckedMode(res.metrics_mode ?? metricsMode);
        setComparisonCheck('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setCompAvail({ qoq: true, yoy: true, both: true });
        // Failing open means we know nothing about WHY — show no note at all
        // rather than a stale one from the previous period/mode.
        setCompSpecs(null);
        setCompCheckedMode(null);
        setComparisonCheck('ok');
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, customYear, quarter, isUploadMode, isOpenMode, metricsMode]);

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

    // The standard metric catalogue for the "System metrics" hover list. Fetched
    // here rather than lazily on first hover so the panel never pops in blank —
    // it's ~280 short rows, and the list is reference data like the areas above.
    reportsApi
      .getQuarterlySystemMetrics()
      .then((res) => {
        if (!cancelled) setSystemMetrics(res);
      })
      .catch(() => {
        // Catalogue unavailable — the hover affordance stays hidden.
      });

    // Pre-select the Currency field from the company's own reporting currency.
    // Resolves from the JWT rather than `companyId`, so this belongs on mount.
    companiesApi
      .getMyCompany()
      .then((c) => {
        if (!cancelled) setCompanyCurrency(normaliseCurrencyCode(c.reporting_currency));
      })
      .catch(() => {
        // No company currency — the field falls back to the default.
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

  // Escape closes the System-metrics hover list and drops the pin so a later
  // hover behaves normally. The "?" panels handle their own Escape.
  useEffect(() => {
    if (!metricsListOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMetricsListOpen(false);
      setMetricsListPinned(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [metricsListOpen]);

  // Clicking outside the Metrics block dismisses a pinned metric list.
  useEffect(() => {
    if (!metricsListPinned) return;
    const onDown = (e: MouseEvent) => {
      if (metricsBlockRef.current?.contains(e.target as Node)) return;
      setMetricsListPinned(false);
      setMetricsListOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [metricsListPinned]);

  // Drop any in-flight hover timers if the form unmounts mid-hover.
  useEffect(
    () => () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

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

  // Ask the backend whether each financial file holds anything we can read figures
  // from, and pop the answer when it doesn't. Fail-open on a network error, same as
  // the language check — the submit-time gate is the real backstop.
  const runTablesCheck = (list: File[]) => {
    list.forEach((file) => {
      const id = fileKey(file);
      writeFinTables({ ...finTablesRef.current, [id]: { status: 'checking' } });
      reportsApi
        .checkTables(file)
        .then((res) => {
          // Removed while the check was in flight — the file is gone, so its answer
          // is too.
          if (!(id in finTablesRef.current)) return;
          writeFinTables({
            ...finTablesRef.current,
            [id]: res.has_tables
              ? { status: 'ok', tableCount: res.table_count }
              : { status: 'none', message: res.message ?? undefined },
          });
          if (!res.has_tables) {
            setNoTablesPopup({
              key: id,
              name: file.name,
              message:
                res.message ??
                `We couldn't find anything to read in "${file.name}".`,
            });
          }
        })
        .catch(() => {
          if (!(id in finTablesRef.current)) return;
          writeFinTables({ ...finTablesRef.current, [id]: { status: 'ok' } });
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
    // On a NEW report, hold back a slot for the financial-data lane: filling the
    // cap with narrative documents would otherwise leave the required financials
    // field unfillable and Generate permanently disabled. The reservation is
    // bidirectional — see acceptFinancialFiles. Upload-to-existing sends only this
    // lane, so it keeps the whole cap.
    const capLimit = isUploadMode
      ? MAX_DOCUMENTS
      : MAX_DOCUMENTS - Math.max(financialFiles.length, 1);
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

  // ── Financial-data lane (Excel/CSV) — no language check; combined cap ──
  const acceptFinancialFiles = (incoming: FileList | File[]) => {
    const accepted: File[] = [];
    let rejected = false;
    Array.from(incoming).forEach((f) => {
      if (hasFinExtension(f.name)) accepted.push(f);
      else rejected = true;
    });
    if (rejected) {
      setGenError(`Financial data must be a CSV, Excel or Word file (${ACCEPTED_FIN_EXT.join(', ')}).`);
    } else {
      setGenError(null);
    }
    if (accepted.length === 0) return;
    // Genuinely-new files (not already in the list) get the tables check.
    const existing = new Set(financialFiles.map(fileKey));
    const fresh = accepted.filter((f) => !existing.has(fileKey(f)));
    setFinancialFiles((prev) => {
      const seen = new Set(prev.map(fileKey));
      const merged = [...prev];
      accepted.forEach((f) => {
        const id = fileKey(f);
        if (!seen.has(id)) { seen.add(id); merged.push(f); }
      });
      // Mirror of the narrative lane's reservation: both lanes are required on a
      // new report, so neither may consume the cap so completely that the other
      // can't be filled at all.
      const capRemaining = isUploadMode
        ? Math.max(0, MAX_DOCUMENTS - files.length)
        : Math.max(0, MAX_DOCUMENTS - Math.max(files.length, 1));
      if (merged.length > capRemaining) {
        setShowFileCapWarning(true);
        return merged.slice(0, capRemaining);
      }
      return merged;
    });
    if (fresh.length > 0) runTablesCheck(fresh);
  };

  const handleFinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) acceptFinancialFiles(e.target.files);
    e.target.value = '';
  };

  const handleFinDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFin(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      acceptFinancialFiles(e.dataTransfer.files);
    }
  };

  const forgetFinancialFile = (key: string) => {
    setFinancialFiles((prev) => prev.filter((f) => fileKey(f) !== key));
    const next = { ...finTablesRef.current };
    delete next[key];
    writeFinTables(next);
    // Dropping the offending file is the fix, so the popup about it goes with it.
    setNoTablesPopup((prev) => (prev?.key === key ? null : prev));
  };

  const removeFinancialFile = (index: number) => {
    const removed = financialFiles[index];
    if (removed) forgetFinancialFile(fileKey(removed));
  };

  const openFinPicker = () => financialInputRef.current?.click();

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
  // System mode needs both lanes on a new report: the financial lane is its only
  // figure source, the narrative lane its only prose source. Custom mode takes its
  // figures one statement at a time on the Financial Data screen that follows, so
  // here it asks for narrative documents and nothing else.
  const hasFinancialFiles = financialFiles.length > 0;
  // A financial file with nothing readable in it blocks Generate for the same reason
  // a wrong-language narrative does: this field is the report's only figure source,
  // so letting it through produces a report with every number blank.
  const finChecking = financialFiles.some((f) => finTables[fileKey(f)]?.status === 'checking');
  const finBadFiles = financialFiles.filter((f) => finTables[fileKey(f)]?.status === 'none');
  const tablesBlocked = finChecking || finBadFiles.length > 0;
  // Both System and User take every figure from this field, so both require it.
  // Custom takes its figures per section on the next screen instead.
  const needsFinancialUpload = !isUploadMode && metricsMode !== 'custom';

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
        (!needsFinancialUpload || (hasFinancialFiles && !!financialScale && !tablesBlocked)) &&
        !langBlocked &&
        !comparisonBlocked &&
        contextComplete));

  // Ordered to follow the form top to bottom, so the reason points at the next
  // thing the user will actually reach.
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
            ? 'Upload at least one source document (MD&A, prior-year report or management notes) to continue'
            : anyChecking
              ? 'Checking document language…'
              : badFiles.length > 0
                ? 'Remove the wrong-language document to continue'
                : needsFinancialUpload && !hasFinancialFiles
                  ? 'Upload the financial statements (Excel, CSV or Word) to continue'
                  : needsFinancialUpload && finChecking
                    ? 'Checking the financial file…'
                    : needsFinancialUpload && finBadFiles.length > 0
                      ? 'Remove the financial file with no tables in it to continue'
                      : needsFinancialUpload && !financialScale
                        ? 'Tell us what scale the financial figures are in to continue'
                        : companyType == null
                          ? 'Select the company type to continue'
                          : comparisonCheck === 'checking'
                            ? 'Checking comparison data…'
                            : undefined;

  const extractApiError = (err: unknown): string => {
    if (err instanceof ApiError) {
      // 429/5xx come from infra/upstream provider failures, not deliberate
      // FastAPI responses — ApiError.message is already the sanitized
      // generic string there, so skip re-parsing the raw body.
      if (err.status === 429 || err.status >= 500) return err.message;
      const body = err.body as
        | { detail?: string | { error?: string } | Array<{ msg?: string }> }
        | null;
      const detail = body?.detail;
      if (typeof detail === 'string') return detail;
      if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
      if (detail && typeof detail === 'object' && 'error' in detail && detail.error) {
        return detail.error;
      }
      return err.message;
    }
    if (err instanceof Error) return err.message;
    return 'Something went wrong. Please try again.';
  };

  const triggerGenerate = () => {
    if (!canGenerate || !companyId) return;

    // Branch A — open existing report. Goes to the extraction review, not straight
    // to the outline, so there is ONE way into the flow: if figures are still
    // awaiting confirmation the user sees them, and if not the screen is a
    // read-only record of what was extracted and they continue on.
    if (isOpenMode && selectedReportId) {
      navigate(`/quarterly-report/${selectedReportId}/extraction`);
      return;
    }

    // Branch B — upload new documents to an existing report.
    if (isUploadMode && selectedReportId) {
      const requestId = ++genRequestIdRef.current;
      setGenError(null);
      setIsSubmittingGenerate(true);
      const targetReportId = selectedReportId;
      // TODO: financialFiles staged in upload-to-existing mode are dropped here —
      // AddReportDocumentsBody has no financial lane and the backend endpoint takes
      // no financial params, so the field is live but its files go nowhere. Needs a
      // backend change; don't "fix" it by hiding the field.
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
        // Dedicated Excel/CSV lane → lean extraction. Currency and scale are
        // user-declared: currency picks the column when a sheet carries more than
        // one, scale is both the fallback for unlabelled rows and the scale every
        // figure is reported in. System mode only — the backend rejects a sheet
        // sent in Custom mode, which takes its figures per section on the next
        // screen (and asks for currency/scale there).
        financial_files: needsFinancialUpload && hasFinancialFiles ? financialFiles : undefined,
        financial_currency: needsFinancialUpload && hasFinancialFiles ? currencyValue : undefined,
        financial_scale:
          needsFinancialUpload && hasFinancialFiles ? financialScale || undefined : undefined,
        // custom = the user's own lines, one uploaded statement per section.
        metrics_mode: metricsMode,
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
          // Custom mode has no figures yet — this run only read the narrative
          // documents. Land on the Financial Data screen, which is where its
          // numbers come from.
          // User mode confirms nothing, but it still stops at Extraction — that is
          // where it shows which tables became sections and which produced nothing.
          quarterlyNext: metricsMode === 'custom' ? 'financials' : 'extraction',
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

        {/* Metrics mode — System (map to our standard metrics) vs Custom (use the
            sheet's own lines as-is). New reports only; controls whether the
            Financial Data (Excel/CSV) field is shown. */}
        {!isOpenMode && !isUploadMode && (
          <div ref={metricsBlockRef} style={{ marginBottom: 18, position: 'relative' }}>
            <label className="fl-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Metrics
              <LabelHelp
                id="metrics"
                openId={helpOpen}
                onOpenChange={setHelpOpen}
                ariaLabel="How should we read your figures?"
                panelLabel="How we read your figures"
              >
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#1A1D2E', fontWeight: 700 }}>System metrics</strong>
                  {' — we map your data to our standard set of metrics and lay it out in the '}
                  standard report template. Upload the statements below.
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: '#1A1D2E', fontWeight: 700 }}>Custom metrics</strong>
                  {' — your own line items, printed as-is. On the next screen you pick the '}
                  sections you want and upload one statement into each, so every figure lands
                  where you put it.
                </div>
                <div>
                  <strong style={{ color: '#1A1D2E', fontWeight: 700 }}>Sections from my files</strong>
                  {' — your own line items again, but you upload everything at once and each '}
                  table in your files becomes a section of the report, named after that table.
                  Tables covering the same thing are printed together.
                </div>
              </LabelHelp>
            </label>

            <div style={{ display: 'flex', gap: 20, marginTop: 8, alignItems: 'center' }}>
              {(['system', 'custom', 'user'] as const).map((m) => {
                const radio = (
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600,
                      color: metricsMode === m ? '#1A1D2E' : '#5A6080',
                    }}
                  >
                    <input
                      type="radio"
                      name="metrics_mode"
                      value={m}
                      checked={metricsMode === m}
                      onChange={() => {
                        setMetricsMode(m);
                        if (m === 'custom') {
                          // The Financial Data field unmounts in custom mode, and the
                          // backend rejects a sheet sent with it — so a staged file
                          // would be invisible AND fatal. Drop it here, while the user
                          // is looking at the control that caused it.
                          // NOT done for 'user': that mode keeps the field and needs
                          // the file, so clearing it would silently undo their upload.
                          setFinancialFiles([]);
                        }
                        if (m !== 'system') {
                          // The catalogue pill unmounts outside system mode — reset it
                          // so a hover in flight (or a pinned panel) can't spring back
                          // open on the way back to system.
                          resetMetricsList();
                        }
                      }}
                      style={{ accentColor: '#4040C8', width: 14, height: 14 }}
                    />
                    {m === 'system' ? 'System metrics'
                      : m === 'custom' ? 'Custom metrics'
                      : 'Sections from my files'}
                  </label>
                );

                // The catalogue only describes system mode, so the pill is hidden
                // once custom is picked — and until the fetch lands.
                if (m !== 'system' || !systemMetrics || metricsMode !== 'system') {
                  return <div key={m}>{radio}</div>;
                }

                return (
                  <div
                    key={m}
                    style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={openMetricsList}
                    onMouseLeave={closeMetricsList}
                  >
                    {radio}
                    {/* Outside the <label> on purpose — inside it, clicking to
                        open the list would also select the radio. */}
                    <button
                      type="button"
                      aria-haspopup="true"
                      aria-expanded={metricsListOpen}
                      onFocus={openMetricsList}
                      onClick={() => {
                        // Pin keeps it open for click/keyboard users; clicking
                        // again unpins and closes.
                        const nextPinned = !metricsListPinned;
                        setMetricsListPinned(nextPinned);
                        setMetricsListOpen(nextPinned);
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
                        fontSize: 10.5, fontWeight: 700, lineHeight: 1.4,
                        border: `1px solid ${metricsListOpen ? '#C4C7F0' : '#E4E6F1'}`,
                        background: metricsListOpen ? '#EEEEFF' : '#F7F8FC',
                        color: metricsListOpen ? '#2B2B8F' : '#5A6080',
                        transition: 'background .15s, border-color .15s, color .15s',
                      }}
                    >
                      {systemMetrics.total} metrics
                      <svg
                        width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true"
                        style={{
                          transform: metricsListOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform .15s',
                        }}
                      >
                        <path d="M1.5 3l2.5 2.5L6.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      </svg>
                    </button>

                    {metricsListOpen && (
                      <div
                        role="group"
                        aria-label="System metrics catalogue"
                        // Cancels the pending close so the pointer can travel in
                        // and scroll — without this the list can't be read.
                        onMouseEnter={openMetricsList}
                        onMouseLeave={closeMetricsList}
                        style={{
                          position: 'absolute', top: 'calc(100% + 9px)', left: 0, zIndex: 40,
                          width: 320, borderRadius: 12, background: '#fff',
                          border: '1px solid #ECEEF8',
                          boxShadow: '0 12px 32px rgba(20,22,40,.16)',
                          overflow: 'hidden', cursor: 'default',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                            gap: 8, padding: '10px 14px', borderBottom: '1px solid #ECEEF8',
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#1A1D2E' }}>
                            System metrics
                          </span>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#9BA3C4' }}>
                            {systemMetrics.total} total
                          </span>
                        </div>

                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          {systemMetrics.groups.map((group) => (
                            <div key={group.code ?? group.title}>
                              <div
                                style={{
                                  position: 'sticky', top: 0, zIndex: 1,
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  gap: 8, padding: '7px 14px', background: '#F7F8FC',
                                  borderBottom: '1px solid #ECEEF8',
                                  fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px',
                                  textTransform: 'uppercase', color: '#5A6080',
                                }}
                              >
                                <span>{group.title}</span>
                                <span style={{ color: '#9BA3C4' }}>{group.count}</span>
                              </div>
                              {group.metrics.map((metric) => (
                                <div
                                  key={metric.key}
                                  style={{
                                    padding: '5px 14px', fontSize: 11.5, color: '#3A3F5C',
                                    lineHeight: 1.45,
                                  }}
                                >
                                  {metric.label}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 7, fontSize: 11, color: '#9BA3C4', lineHeight: 1.5 }}>
              {/* "our standard N" stopped being true once the total included the
                  company's own additions — those are theirs, not ours. */}
              {metricsMode === 'system'
                ? `We map your data to${systemMetrics ? ` these ${systemMetrics.total}` : ' our standard'} metrics and lay it out in the standard report template.`
                : metricsMode === 'custom'
                ? 'We print your figures exactly as they are. You upload one statement per section on the next screen, so nothing has to guess where a line belongs.'
                : 'We print your figures exactly as they are, and build the report around the tables in your files — each one becomes a section named after it, with related tables printed together.'}
            </div>
          </div>
        )}

        {/* Upload — shown for new reports and upload-to-existing mode */}
        {!isOpenMode && (
          <div style={{ marginBottom: 18, position: 'relative' }}>
            <label className="fl-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Source Documents
              <span style={{ fontWeight: 400, textTransform: 'none', color: '#2E9B57' }}>
                — required
              </span>
              <LabelHelp
                id="source"
                openId={helpOpen}
                onOpenChange={setHelpOpen}
                ariaLabel="What to upload as source documents"
                panelLabel="What to upload as source documents"
                heading="Upload any of these"
              >
                <HelpList
                  items={[
                    'MD&A (management discussion & analysis)',
                    'Prior-year annual report',
                    'Management notes',
                    'Board or chairman commentary',
                  ]}
                />
                <div style={{ marginTop: 8, color: '#9BA3C4' }}>
                  Prose only — we do not read any figures from these.
                </div>
              </LabelHelp>
            </label>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2, marginBottom: 10 }}>
              {isUploadMode && existingCoverageLoading
                ? '(loading…)'
                : 'PDF, DOCX — narrative & prose only, no figures read from here. The report’s narrative sections are written from these.'}
            </div>

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
                Click to upload or drag &amp; drop the MD&amp;A, prior-year report,
                management notes
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

        {/* Financial Data — System mode's ONLY source of figures. Nothing is read
            out of the narrative documents above. Hidden in Custom mode, which takes
            one statement per section on the next screen instead: there the section
            is chosen by the user rather than guessed from the label. */}
        {!isOpenMode && (isUploadMode || metricsMode !== 'custom') && (
          <div style={{ marginBottom: 18, position: 'relative' }}>
            <label className="fl-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Financial Data (Excel / CSV / Word)
              <span style={{ fontWeight: 400, textTransform: 'none', color: '#2E9B57' }}>
                — required
              </span>
              <LabelHelp
                id="financial"
                openId={helpOpen}
                onOpenChange={setHelpOpen}
                ariaLabel="What financial documents to upload"
                panelLabel="What to upload as financial data"
                heading="Upload the statements"
              >
                <HelpList
                  items={[
                    'Balance sheet',
                    'Statement of income (P&L)',
                    'Cash flow statement',
                  ]}
                />
                <div style={{ marginTop: 8, color: '#9BA3C4' }}>
                  One figure column per period, in a single currency. If your sheet has two
                  currency columns, upload only the one you want reported.
                </div>
              </LabelHelp>
            </label>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2, marginBottom: 10 }}>
              Every figure in the report comes from here, read as exact cells with no OCR.
              Tell us the currency and scale so we read the right column and nothing is
              mis-scaled.
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="fl-label" style={{ fontSize: 10 }} htmlFor="fin-currency">
                  Currency
                </label>
                <select
                  id="fin-currency"
                  className="inp sel"
                  value={currencyValue}
                  onChange={(e) => setFinancialCurrency(e.target.value)}
                >
                  {/* A company reporting in something off our list still gets to see
                      its own currency rather than a silent fallback. */}
                  {!isKnownCurrency(currencyValue) && (
                    <option value={currencyValue}>{currencyValue}</option>
                  )}
                  {REPORTING_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="fl-label" style={{ fontSize: 10 }} htmlFor="fin-scale">
                  Numbers are in
                </label>
                <select
                  id="fin-scale"
                  className="inp sel"
                  value={financialScale}
                  onChange={(e) => setFinancialScale(e.target.value as FinancialScale | '')}
                >
                  <option value="">Select…</option>
                  {FINANCIAL_SCALES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <input
              ref={financialInputRef}
              type="file"
              multiple
              accept={ACCEPTED_FIN_ATTR}
              onChange={handleFinInputChange}
              style={{ display: 'none' }}
            />

            <div
              role="button"
              tabIndex={0}
              onClick={openFinPicker}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFinPicker(); }
              }}
              onDragOver={(e) => { e.preventDefault(); if (!isDraggingFin) setIsDraggingFin(true); }}
              onDragLeave={() => setIsDraggingFin(false)}
              onDrop={handleFinDrop}
              className="upload-z"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                padding: '16px 20px', cursor: 'pointer',
                borderColor: isDraggingFin ? '#2E9B57' : undefined,
                background: isDraggingFin ? 'rgba(46,155,87,.06)' : undefined,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3v10M6 7l4-4 4 4" stroke="#2E9B57" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M3 14v2a2 2 0 002 2h10a2 2 0 002-2v-2" stroke="#2E9B57" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 12, color: '#5A6080' }}>
                Click to upload or drag &amp; drop the financial statements as Excel, CSV or Word
              </span>
            </div>

            {financialFiles.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                {financialFiles.map((file, index) => {
                  const info = finTables[fileKey(file)];
                  const isChecking = info?.status === 'checking';
                  const isBad = info?.status === 'none';
                  const found = info?.tableCount ?? 0;
                  return (
                  <div
                    key={`${file.name}:${file.size}:${index}`}
                    style={{
                      position: 'relative', display: 'flex', flexDirection: 'column', gap: 6,
                      padding: '10px 10px 8px', borderRadius: 8,
                      border: `1px solid ${isBad ? 'rgba(229,72,77,.45)' : '#2E9B57'}`,
                      background: isBad ? 'rgba(229,72,77,.06)' : 'rgba(46,155,87,.05)',
                    }}
                  >
                    <div style={{ minWidth: 0, paddingRight: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                          ? 'Checking for tables…'
                          : isBad
                            ? 'No tables found'
                            : info?.status === 'ok' && found > 0
                              ? `${found} table${found === 1 ? '' : 's'} found`
                              : formatBytes(file.size)}
                      </div>
                    </div>
                    {info && (
                      <span
                        aria-hidden
                        title={
                          isChecking
                            ? 'Checking for tables'
                            : isBad
                              ? 'No tables found'
                              : 'Tables found'
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
                      onClick={() => removeFinancialFile(index)}
                      aria-label="Remove file"
                      title="Remove file"
                      style={{
                        position: 'absolute', top: 6, right: 6, width: 16, height: 16,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: '#9BA3C4',
                      }}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

              // System and custom figures only ever compare against themselves,
              // so a prior period holding the OTHER type is unusable — but that
              // is worth explaining, unlike a period with no data at all.
              const crossSpecs = (compSpecs ?? []).filter(
                (s) => !s.present && s.other_mode_present,
              );
              const crossKeys = new Set(crossSpecs.map((s) => s.key));
              // 'both' needs qoq AND yoy, so it's cross-blocked when either is.
              const isCrossBasis = (v: Comparison) =>
                v === 'both' ? crossKeys.size > 0 : crossKeys.has(v);
              const thisModeName =
                compCheckedMode === 'custom' ? 'Custom metrics' : 'System metrics';
              const otherModeName =
                compCheckedMode === 'custom' ? 'System metrics' : 'Custom metrics';
              const crossPeriods = joinList(crossSpecs.map((s) => s.label));
              const crossBases = joinList(
                CTX_COMPARISONS.filter(
                  (c) => !(compAvail?.[c.value] ?? false) && isCrossBasis(c.value),
                ).map((c) => c.label),
              );
              const showCrossNote = periodChosen && !checking && crossSpecs.length > 0;

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
                  note={
                    showCrossNote ? (
                      <div
                        role="note"
                        style={{
                          display: 'flex',
                          gap: 10,
                          padding: '11px 13px',
                          borderRadius: 12,
                          border: '1px solid rgba(245,158,11,.35)',
                          background: 'rgba(245,158,11,.08)',
                          fontSize: 11.5,
                          lineHeight: 1.55,
                          color: '#8A6520',
                        }}
                      >
                        <svg
                          width="16" height="16" viewBox="0 0 20 20" fill="none"
                          aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}
                        >
                          <path d="M10 6v5M10 14h.01" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
                          <circle cx="10" cy="10" r="8.5" stroke="#D97706" strokeWidth="1.5" />
                        </svg>
                        <div>
                          <div style={{ fontWeight: 700, color: '#B45309', marginBottom: 3 }}>
                            {crossPeriods} {crossSpecs.length === 1 ? 'has' : 'have'} data, but{' '}
                            {crossSpecs.length === 1 ? "it's" : "they're"}{' '}
                            {otherModeName.toLowerCase()} — this report uses{' '}
                            {thisModeName.toLowerCase()}.
                          </div>
                          Comparisons only work within the same metrics type, so{' '}
                          <strong style={{ fontWeight: 700 }}>{crossBases}</strong>{' '}
                          {crossBases.includes(' and ') ? 'are' : 'is'} unavailable — comparing
                          across types would just produce an empty column. Switch to{' '}
                          {otherModeName} above to compare against{' '}
                          {crossSpecs.length === 1 ? 'it' : 'them'}, or generate this quarter on
                          its own.
                        </div>
                      </div>
                    ) : null
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
                          ? isCrossBasis(c.value)
                            // Agree with the note below rather than claiming
                            // there's no data when there is, in the other lane.
                            ? `That period's data is ${otherModeName.toLowerCase()}, not ${thisModeName.toLowerCase()}`
                            : unavailTitle[c.value]
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

        {/* Submit. The reason is rendered, not just a title — browsers suppress
            pointer events on a disabled button, so the tooltip never appears and
            the user is left staring at a dead button. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span
            aria-live="polite"
            style={{ fontSize: 11.5, color: '#9BA3C4', lineHeight: 1.45 }}
          >
            {!canGenerate ? disabledReason ?? '' : ''}
          </span>
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

      {/* "No tables in this file" — the financial upload is the report's only figure
          source, and a .docx is read as TABLES ONLY. A user testing the app blind
          dropped a plain Word document here expecting the narrative to be read out of
          it, and the report generated with every figure blank and no explanation.
          Generate stays disabled while the file is attached. */}
      {noTablesPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="No tables found in the financial file"
          onClick={() => setNoTablesPopup(null)}
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
                  background: 'rgba(245,158,11,.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                  <path d="M10 6v5M10 14h.01" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="10" cy="10" r="8.5" stroke="#D97706" strokeWidth="1.5" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
                No tables found
              </div>
            </div>

            <div style={{ padding: '16px 22px 20px' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#3A3F5C', lineHeight: 1.6 }}>
                {noTablesPopup.message}
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
                <button
                  type="button"
                  onClick={() => setNoTablesPopup(null)}
                  style={{
                    padding: '10px 18px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#3A3F5C',
                    background: '#fff',
                    border: '1px solid #DDE0F2',
                    borderRadius: 10,
                    cursor: 'pointer',
                  }}
                >
                  Got it
                </button>
                <button
                  type="button"
                  onClick={() => forgetFinancialFile(noTablesPopup.key)}
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
                  Remove file
                </button>
              </div>
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
