// Screen 1 of the Compliance Validation wizard — pick a subject, tune the
// regulator frameworks, run the validation.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { ApiError, companies, complianceValidation } from '@/lib/api';
import { rememberScreen } from '@/lib/compliance-runs';
import { useAuth } from '@/context/AuthContext';
import { useFeaturePermissions } from '@/lib/features';
import { useComplianceRuns } from '@/context/ComplianceRunsContext';
import type {
  Candidate,
  CompliancePreview,
  RunSettings,
  EntityType,
  Market,
  ReportType,
  RunRejectedBody,
} from '@/types/compliance';
import { UPLOAD_EXTENSIONS, UPLOAD_MAX_BYTES } from '@/types/compliance';
import { ComplianceStepper } from './ComplianceStepper';
import { CertifiedGallery } from './CertifiedGallery';
import type { ComplianceRunningState } from './ComplianceRunningPage';
import {
  ComplianceHeader,
  DARK,
  FRAMEWORK_LABELS,
  MONO,
  MUTED,
  PRIMARY,
} from './compliance-ui';
import { ResumeGallery } from './ResumeGallery';

const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: 'annual', label: 'Annual Report' },
  { key: 'quarterly', label: 'Quarterly' },
  { key: 'esg', label: 'ESG / Sustainability' },
  // Hidden for now. The `board_pack` report type still exists in the API and in
  // ReportType, so re-enabling it is just uncommenting this line.
  // { key: 'board_pack', label: 'Board Pack' },
];

const ENTITY_TYPES: { key: EntityType; label: string }[] = [
  { key: 'corporate', label: 'Corporate' },
  { key: 'bank', label: 'Bank' },
  { key: 'insurer', label: 'Insurer' },
];

const MARKETS: { key: Market; label: string }[] = [
  { key: 'Main', label: 'Main' },
  { key: 'Nomu', label: 'Nomu' },
];

// An approved report is one we generated for this company, so its regulators
// aren't a choice — they follow from the company's own profile. `reporting_sector`
// is the only field that carries this (market has no equivalent on the company,
// so those pills stay live). A company with no sector set falls back to the
// manual pickers rather than guessing.
const ENTITY_BY_SECTOR: Record<string, EntityType> = {
  bank: 'bank',
  insurance: 'insurer',
  general: 'corporate',
  reit: 'corporate',
  finance_co: 'corporate',
};

// Nearly every rule carries effective_from = 2024-01-01, so a report whose
// period ended before that matches zero rules and POST /runs rejects it. Grey
// those out up front rather than letting the user find out after clicking
// Validate. Bump this if the backend's earliest effective_from moves.
const FIRST_RULED_YEAR = 2024;

// Two ways to name the thing being validated: pick one we generated and the
// company approved, or hand us the finished file. Everything downstream — the
// progress screen, the review, the certificate — is the same run either way.
type SourceMode = 'picker' | 'upload';

const SOURCE_MODES: { key: SourceMode; label: string }[] = [
  { key: 'picker', label: 'Approved reports' },
  { key: 'upload', label: 'Upload a report' },
];

type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

const QUARTERS: { key: Quarter; label: string }[] = (['Q1', 'Q2', 'Q3', 'Q4'] as const).map(
  (q) => ({ key: q, label: q }),
);

const CURRENT_YEAR = new Date().getFullYear();

// Newest first, stopping at the first year any rule was in force. Offering 2023
// would just be offering a guaranteed rejection — the same reason the picker
// greys out subjects that predate the rules.
const YEAR_OPTIONS = Array.from(
  { length: Math.max(1, CURRENT_YEAR - FIRST_RULED_YEAR + 1) },
  (_, i) => CURRENT_YEAR - i,
);

// The backend takes the period as an exact string. Compose it in one place so
// no screen can invent "2025-Q3" or send a bare year.
function composePeriod(reportType: ReportType, year: number, quarter: Quarter | null): string {
  if (reportType === 'quarterly') return quarter ? `${quarter}-${year}` : '';
  return `FY-${year}`;
}

// Refuse locally what the server would refuse anyway — a 50 MB upload is a slow
// way to be told the file type is wrong.
function readFileProblem(file: File): string {
  const dot = file.name.lastIndexOf('.');
  const ext = dot === -1 ? '' : file.name.slice(dot).toLowerCase();
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    return `${ext || 'That file type'} can’t be read. Use ${UPLOAD_EXTENSIONS.join(', ')}.`;
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return `That file is ${formatSize(file.size)}. The limit is 50 MB.`;
  }
  return '';
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Pull a 4-digit year out of "FY-2025" / "Q4-2023" / "2024". Returns null when
// the period doesn't carry one, in which case we leave the row enabled — better
// a surprise 400 than hiding a valid report behind a bad guess.
function periodYear(period: string | undefined): number | null {
  const m = /(\d{4})/.exec(period ?? '');
  return m ? Number(m[1]) : null;
}

function isPreRules(c: Candidate): boolean {
  const y = periodYear(c.period);
  return y != null && y < FIRST_RULED_YEAR;
}

// `detail` comes back in three different shapes across these endpoints, and the
// naive read prints "[object Object]" at the user for two of them:
//   string                        — FastAPI's usual, show it
//   { message, reason, … }        — the no-rule-matched case. `reason` is
//                                   human-written; surface it verbatim.
//   [{ loc, msg }]                — FastAPI's own validation errors (a missing
//                                   file, an unparseable period). `loc` is for
//                                   the console, `msg` is for the banner.
function readComplianceDetail(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  // 429/5xx come from infra/upstream provider failures, not deliberate
  // FastAPI responses — never trust raw `detail` there, it can be a leaked
  // exception string (e.g. an OpenAI RateLimitError). readRunError's own
  // status-based fallback handles these instead.
  if (err.status === 429 || err.status >= 500) return null;
  const detail = (err.body as { detail?: unknown } | undefined)?.detail;
  if (!detail) return null;
  if (typeof detail === 'string') return detail.trim() || null;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((d) => (d as { msg?: string } | null)?.msg)
      .filter((m): m is string => Boolean(m));
    return messages.length ? messages.join(' · ') : null;
  }
  const body = detail as RunRejectedBody;
  return body.reason ?? body.message ?? null;
}

// What to put in the banner. Prefers the backend's own words — they're written
// for the user — and falls back to something readable, because ApiError's
// message is "API 500 Internal Server Error — https://…", which is not.
function readRunError(err: unknown): string {
  const detail = readComplianceDetail(err);
  if (detail) return detail;
  if (err instanceof ApiError) {
    if (err.status === 403) return 'That report doesn’t belong to your company.';
    if (err.status === 429 || err.status >= 500) {
      return 'The compliance service couldn’t start the run. Please try again.';
    }
    return 'Validation failed. Please try again.';
  }
  return err instanceof Error ? err.message : 'Validation failed. Please try again.';
}

// ── shared bits ──────────────────────────────────────────────────────────────

function Card({
  step,
  title,
  caption,
  children,
}: {
  step: number;
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="ch">
        <div>
          <div className="ct">
            <span style={{ color: MUTED, fontFamily: MONO, marginRight: 6 }}>{step}</span>
            {title}
          </div>
          {caption && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 3, maxWidth: 620 }}>{caption}</div>
          )}
        </div>
      </div>
      <div className="cb">{children}</div>
    </div>
  );
}

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  locked,
  lockedTitle,
}: {
  options: { key: T; label: string }[];
  // Nullable so a group can start with nothing chosen — the quarter picker has
  // no safe default, and defaulting it to Q1 would file Q3 reports as Q1.
  value: T | null;
  onChange: (v: T) => void;
  // Read-only: the value is decided elsewhere. Renders the chosen option alone
  // — greyed-out alternatives would read as "click here", which is the one
  // thing this state means you can't do.
  locked?: boolean;
  lockedTitle?: string;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.key === value;
        if (locked && !on) return null;
        return (
          <button
            key={o.key}
            type="button"
            onClick={locked ? undefined : () => onChange(o.key)}
            disabled={locked}
            title={locked ? lockedTitle : undefined}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              cursor: locked ? 'default' : 'pointer',
              fontFamily: 'inherit',
              border: `1.5px solid ${on ? PRIMARY : '#E2E4F0'}`,
              background: on ? '#EEEEFF' : '#fff',
              color: on ? PRIMARY : '#5A6080',
              transition: '.15s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Regulator toggle with three states:
//   on        — indigo outline, filled dot, solid label
//   off       — no outline, muted dot, struck-through: you excluded it
//   n/a       — same struck-through treatment but fainter and inert: this
//               regulator doesn't apply to the selected entity type
// Both off states look alike on purpose; the cursor and tooltip distinguish
// "you turned this off" from "this can't apply to you".
function FrameworkChip({
  regulator,
  checks,
  on,
  applicable,
  locked,
  onToggle,
}: {
  regulator: string;
  checks: number;
  on: boolean;
  applicable: boolean;
  // Approved reports run against exactly what the company profile says applies.
  // The chip stays visible — it's the list of what will run — but is inert.
  locked?: boolean;
  onToggle: () => void;
}) {
  const label = FRAMEWORK_LABELS[regulator];
  const active = applicable && on;
  const interactive = applicable && !locked;
  return (
    <button
      type="button"
      onClick={interactive ? onToggle : undefined}
      disabled={!interactive}
      aria-pressed={active}
      title={
        !applicable
          ? "Doesn't apply to your entity type"
          : locked
            ? `${checks} ${checks === 1 ? 'check' : 'checks'} · set by your company profile`
            : `${checks} ${checks === 1 ? 'check' : 'checks'}`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '7px 14px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        fontFamily: 'inherit',
        cursor: interactive ? 'pointer' : applicable ? 'default' : 'not-allowed',
        border: `1.5px solid ${active ? PRIMARY : 'transparent'}`,
        background: active ? '#fff' : 'transparent',
        color: active ? PRIMARY : '#C2C7DB',
        opacity: applicable ? 1 : 0.65,
        transition: '.15s',
      }}
    >
      {/* The dot sits outside the struck-through text so it stays a clean
          circle when the chip is off. */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: active ? PRIMARY : '#D8DCEA',
          flexShrink: 0,
        }}
      />
      <span style={{ textDecoration: active ? 'none' : 'line-through' }}>
        {label ? `${regulator} · ${label}` : regulator}
      </span>
    </button>
  );
}

const FIELD_LABEL = { fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 7 } as const;

// The upload half of Card 1. Two things to collect: the period, then the file.
// The period is the interesting one — a report we generated carries its own, but
// an uploaded PDF is just bytes, so the only way to know what it covers is to ask.
function UploadPanel({
  reportType,
  file,
  fileProblem,
  onPickFile,
  year,
  onPickYear,
  quarter,
  onPickQuarter,
  period,
}: {
  reportType: ReportType;
  file: File | null;
  fileProblem: string;
  onPickFile: (f: File | null) => void;
  year: number;
  onPickYear: (y: number) => void;
  quarter: Quarter | null;
  onPickQuarter: (q: Quarter) => void;
  period: string;
}) {
  const label = FIELD_LABEL;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Period first. It's the question the user isn't expecting — asking it
          before the file, rather than under it, keeps it from reading as a
          footnote to the upload. */}
      <div>
        <div style={label}>REPORTING PERIOD</div>
        <div style={{ fontSize: 11, color: MUTED, marginBottom: 9, maxWidth: 560, lineHeight: 1.6 }}>
          Which period does this report cover? The rules that apply depend on it, and an
          uploaded file doesn’t tell us.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {reportType === 'quarterly' && (
            <PillGroup<Quarter> options={QUARTERS} value={quarter} onChange={onPickQuarter} />
          )}
          <select
            value={year}
            onChange={(e) => onPickYear(Number(e.target.value))}
            style={{
              padding: '7px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              color: '#5A6080',
              border: '1.5px solid #E2E4F0',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {period ? (
            <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>sent as {period}</span>
          ) : (
            <span style={{ fontSize: 11, color: MUTED }}>Pick a quarter.</span>
          )}
        </div>
      </div>

      <div>
        <div style={label}>REPORT FILE</div>
        <label
          style={{
            display: 'block',
            padding: file ? '13px 15px' : 20,
            borderRadius: 10,
            border: `1.5px ${file ? 'solid' : 'dashed'} ${fileProblem ? '#FCA5A5' : file ? PRIMARY : '#E2E4F0'}`,
            background: file && !fileProblem ? '#FAFAFF' : '#fff',
            cursor: 'pointer',
            textAlign: file ? 'left' : 'center',
            transition: '.12s',
          }}
        >
          <input
            type="file"
            accept={UPLOAD_EXTENSIONS.join(',')}
            onChange={(e) => {
              onPickFile(e.target.files?.[0] ?? null);
              // Let the same file be re-picked after it was cleared — without
              // this, choosing file A, removing it and choosing A again fires
              // no change event.
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
          {file ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: DARK,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.name}
                </div>
                <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                  {formatSize(file.size)} · click to replace
                </div>
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  onPickFile(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onPickFile(null);
                  }
                }}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: MUTED,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              >
                Remove
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
              <span style={{ color: PRIMARY, fontWeight: 700 }}>Choose a file</span> to validate
              <br />
              PDF, Word, Excel, CSV or text · up to 50 MB
            </div>
          )}
        </label>
        {fileProblem && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: '#DC2626' }}>{fileProblem}</div>
        )}
      </div>
    </div>
  );
}

function SubjectRow({
  subject,
  selected,
  disabled,
  onSelect,
}: {
  subject: Candidate;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      title={
        disabled
          ? `No compliance rules were in force in ${periodYear(subject.period)} — rules start from ${FIRST_RULED_YEAR}.`
          : undefined
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 13px',
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${selected ? PRIMARY : '#ECEEF8'}`,
        background: disabled ? '#FAFBFE' : selected ? '#FAFAFF' : '#fff',
        opacity: disabled ? 0.55 : 1,
        transition: '.12s',
      }}
    >
      <input
        type="radio"
        name="compliance-subject"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        style={{ accentColor: PRIMARY, width: 14, height: 14, flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: DARK,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {subject.title}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
          {/* No "uploaded" badge: uploaded subjects only ever render under the
              upload tab's own heading, which already says it. */}
          {[subject.period, subject.status].filter(Boolean).join(' · ')}
          {disabled && (
            <span style={{ color: '#B45309' }}> · predates all compliance rules</span>
          )}
        </div>
      </div>
    </label>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function ComplianceSetupPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? '';
  const { canCreate, canRead } = useFeaturePermissions('compliance_validation');
  // So a new run is in the dock the moment it is accepted, rather than whenever
  // the next discovery sweep happens to come round.
  const { report: reportRun } = useComplianceRuns();

  // ?type / ?subject / ?mode — set by every "back to set up" link so returning
  // from a run lands on the tab it came from with its subject already picked,
  // instead of resetting to the ESG tab and looking like the report vanished.
  const [searchParams, setSearchParams] = useSearchParams();
  const [reportType, setReportType] = useState<ReportType>(() => {
    const wanted = searchParams.get('type');
    return REPORT_TYPES.some((r) => r.key === wanted) ? (wanted as ReportType) : 'esg';
  });
  const [pickedEntity, setPickedEntity] = useState<EntityType>('corporate');
  const [market, setMarket] = useState<Market>('Main');
  // The company's own reporting sector, which decides the entity type for the
  // reports we generated for it. Null while loading, and null forever if the
  // profile doesn't record one — in both cases the manual pickers stay live
  // rather than locking the user to a guessed default.
  const [companySector, setCompanySector] = useState<string | null>(null);
  // The whole candidate, not just its id — POST /runs needs the subject_type
  // that came with it, which is the backend's call, not something to re-derive.
  const [selected, setSelected] = useState<Candidate | null>(null);

  // The subject to tick once the list arrives, consumed once. A ref rather than
  // state so a later refetch can't re-arm a selection the user has since
  // changed — coming back from a run should preselect, not overrule.
  const preselectId = useRef(searchParams.get('subject'));

  // ── the upload path ──────────────────────────────────────────────────────
  // "Try a different file" links back here with ?mode=upload, so the tab it
  // promised is the tab that opens.
  const [sourceMode, setSourceMode] = useState<SourceMode>(
    searchParams.get('mode') === 'upload' ? 'upload' : 'picker',
  );
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState('');
  // Null means "hasn't been touched", which is what lets the sensible default
  // below follow the report type until the user overrides it.
  const [year, setYear] = useState<number | null>(null);
  const [quarter, setQuarter] = useState<Quarter | null>(null);

  // A quarterly is filed inside the year it covers; an annual, ESG or board
  // pack is written after that year has closed. So the year most likely meant
  // differs by report type — but only until the user says otherwise.
  const defaultYear =
    reportType === 'quarterly' ? CURRENT_YEAR : Math.max(CURRENT_YEAR - 1, FIRST_RULED_YEAR);
  const effectiveYear = year ?? defaultYear;
  const period = composePeriod(reportType, effectiveYear, quarter);

  const [subjects, setSubjects] = useState<Candidate[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [subjectsError, setSubjectsError] = useState('');

  // Previews for every entity type, not just the selected one. /preview returns
  // only the frameworks that apply, so the regulators missing from the selected
  // entity's response are exactly the ones to render as N/A — deriving it this
  // way keeps the backend the single source of truth instead of duplicating its
  // applicability matrix here. Also means switching entity type needs no refetch.
  const [previews, setPreviews] = useState<Record<EntityType, CompliancePreview> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  // Chip selection lives here so toggling doesn't need a preview refetch. It's
  // re-seeded (all applicable ON) whenever the preview or entity type changes.
  const [enabled, setEnabled] = useState<string[]>([]);

  // Only covers the POST itself, which answers in under a second. The run's own
  // 30–60s happens on the progress screen this hands off to.
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState('');

  // One endpoint returns both, but they belong to different tabs: reports we
  // generated and the company approved, and files the user brought us. Keeping
  // an uploaded file in the approved list would misdescribe it — nobody
  // approved it here — and hide it from the tab where its own re-run lives.
  const approvedSubjects = useMemo(
    () => subjects.filter((s) => s.source !== 'upload'),
    [subjects],
  );
  const uploadedSubjects = useMemo(
    () => subjects.filter((s) => s.source === 'upload'),
    [subjects],
  );

  // A file and a previously uploaded report are two answers to the same
  // question, so choosing either clears the other.
  const pickFile = (f: File | null) => {
    setFile(f);
    setFileProblem(f ? readFileProblem(f) : '');
    if (f) setSelected(null);
    setRunError('');
  };

  const pickSubject = (subject: Candidate) => {
    setSelected(subject);
    if (subject.source === 'upload') {
      setFile(null);
      setFileProblem('');
    }
    setRunError('');
  };

  // Keep the tab in the URL, so the browser's own back button and a refresh
  // both return here rather than to the default tab. `replace` — switching
  // tabs is not a step worth pressing back through.
  const changeReportType = (next: ReportType) => {
    setReportType(next);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set('type', next);
        // The subject belonged to the tab being left.
        params.delete('subject');
        return params;
      },
      { replace: true },
    );
  };

  const changeSourceMode = (mode: SourceMode) => {
    setSourceMode(mode);
    setRunError('');
    // Don't leave a picked report armed behind an upload form, or vice versa —
    // only the visible half of the card should be able to start a run.
    setSelected(null);
  };

  // Fetched once, not per tab — the profile doesn't change while the wizard is
  // open. Failures are silent: the pickers simply stay editable.
  useEffect(() => {
    let cancelled = false;
    companies
      .getMyCompany()
      .then((c) => {
        if (cancelled) return;
        setCompanySector(c.reporting_sector);
        // Also the upload tab's starting point. It stays editable there — an
        // uploaded file may be some other entity's report — but a bank's user
        // uploading a bank's report shouldn't have to re-say so.
        const entity = ENTITY_BY_SECTOR[c.reporting_sector ?? ''];
        if (entity) setPickedEntity(entity);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Locked only on the approved-reports tab. An uploaded file may well be some
  // other entity's report, so there the profile isn't authority over anything.
  const lockedEntity =
    sourceMode === 'picker' ? (ENTITY_BY_SECTOR[companySector ?? ''] ?? null) : null;
  const entityType = lockedEntity ?? pickedEntity;

  // One endpoint per tab. It fans out across reports and reporting_cycles
  // server-side and hands back the (subject_type, subject_id) pair to pass
  // straight through to POST /runs. Selection resets on tab change.
  useEffect(() => {
    let cancelled = false;
    setSubjectsLoading(true);
    setSubjectsError('');
    setSubjects([]);
    setSelected(null);

    if (!companyId) {
      setSubjectsError('No company on your account.');
      setSubjectsLoading(false);
      return;
    }

    complianceValidation
      .listCandidates(companyId, reportType)
      .then((list) => {
        if (cancelled) return;
        setSubjects(list);
        // Arriving from a run: tick the subject it used, so the user can go
        // straight back to Run validation. An uploaded report is an ordinary
        // candidate by now, which is what makes this work without re-uploading.
        const wanted = preselectId.current;
        if (wanted) {
          preselectId.current = null;
          const match = list.find((c) => c.subject_id === wanted);
          if (match && !isPreRules(match)) {
            setSelected(match);
            // An uploaded subject lives on the upload tab, so open the tab that
            // can actually show what we just selected.
            if (match.source === 'upload') setSourceMode('upload');
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setSubjectsError(e instanceof Error ? e.message : 'Failed to load reports.');
        }
      })
      .finally(() => {
        if (!cancelled) setSubjectsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportType, companyId]);

  // One fetch per entity type. Entity type is deliberately NOT a dependency —
  // switching it re-derives from what's already loaded.
  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError('');
    Promise.all(
      ENTITY_TYPES.map((e) =>
        complianceValidation.preview({
          report_type: reportType,
          entity_type: e.key,
          market,
        }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const byEntity = {} as Record<EntityType, CompliancePreview>;
        ENTITY_TYPES.forEach((e, i) => {
          byEntity[e.key] = results[i];
        });
        setPreviews(byEntity);
      })
      .catch((e) => {
        if (cancelled) return;
        setPreviews(null);
        setPreviewError(e instanceof Error ? e.message : 'Failed to load frameworks.');
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportType, market]);

  // The frameworks that apply to the selected entity, with their check counts.
  const applicable = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of previews?.[entityType]?.frameworks ?? []) map.set(f.regulator, f.checks ?? 0);
    return map;
  }, [previews, entityType]);

  // Every regulator this report type touches for ANY entity, in a stable order.
  // The ones absent from `applicable` are the N/A chips.
  const allRegulators = useMemo(() => {
    if (!previews) return [];
    const seen: string[] = [];
    for (const e of ENTITY_TYPES) {
      for (const f of previews[e.key]?.frameworks ?? []) {
        if (!seen.includes(f.regulator)) seen.push(f.regulator);
      }
    }
    return seen;
  }, [previews]);

  // Re-seed the selection whenever the applicable set changes — everything that
  // applies starts ON, and nothing that doesn't apply can linger in the payload.
  // Also on the lock engaging: a chip switched off on the upload tab must not
  // survive into the locked view, where there'd be no way to switch it back on.
  useEffect(() => {
    setEnabled([...applicable.keys()]);
  }, [applicable, lockedEntity]);

  const toggleFramework = (regulator: string) => {
    if (!applicable.has(regulator)) return; // N/A chips are inert
    setEnabled((prev) =>
      prev.includes(regulator) ? prev.filter((x) => x !== regulator) : [...prev, regulator],
    );
  };

  // Checks that will actually run, given the chips left ON.
  const selectedChecks = useMemo(
    () => enabled.reduce((sum, r) => sum + (applicable.get(r) ?? 0), 0),
    [enabled, applicable],
  );

  // Whichever half of Card 1 is showing has to be complete. The upload tab
  // accepts either answer: a report already uploaded, or a new file with a
  // period. The period has no default worth guessing for quarterly, so an
  // unpicked quarter blocks here rather than 422ing later.
  const newFileReady = file != null && !fileProblem && period !== '';
  const sourceReady = sourceMode === 'upload' ? selected != null || newFileReady : selected != null;

  // An empty `enabled_frameworks` means "no filter" to the API — every rule
  // runs, the opposite of switching them all off. So block the submit instead.
  const canRun = sourceReady && enabled.length > 0 && !starting;

  // POST /runs is 202: it comes back before a single check has been made, with
  // no scores in the body. All we get is the run id, so the only thing to do
  // with it is hand it to the progress screen, which polls until it's done.
  const runValidation = () => {
    if (!canRun) return;
    // A selection wins on either tab: re-running a report already uploaded is
    // an ordinary run against a subject the backend holds. Uploading the same
    // file again would duplicate the report and all its documents.
    if (!selected) {
      if (sourceMode === 'upload') uploadAndRun();
      return;
    }
    const subject = {
      subject_type: selected.subject_type,
      subject_id: selected.subject_id,
    };
    const settings: RunSettings = {
      report_type: reportType,
      entity_type: entityType,
      market,
      enabled_frameworks: enabled,
      // Required for a document and ignored otherwise. An uploaded file keeps
      // no period of its own, so the candidate row's is the only source — and
      // it decides which regulations were in force, so a missing one is a 422
      // rather than a default.
      ...(selected.subject_type === 'document' ? { period: selected.period } : {}),
    };
    setStarting(true);
    setRunError('');
    complianceValidation
      .createRun({ ...subject, ...settings })
      .then((res) => {
        // So Continue comes back to the wait, not to the top of the wizard.
        rememberScreen(res.run_id, 'running');
        reportRun(
          {
            runId: res.run_id,
            status: res.status,
            title: selected.title,
            period: selected.period,
            reportType,
          },
          'local',
        );
        navigate(`/compliance/runs/${res.run_id}/running`, {
          // The settings ride along so a failed run can be retried from the
          // progress screen without re-picking everything here.
          state: {
            settings,
            subject,
            checksQueued: res.checks_queued,
            subjectTitle: selected.title,
            // Not fromUpload even for a document: its text was extracted when
            // it was first uploaded, so a re-run is an ordinary 30–60s run and
            // promising 60–90 would be wrong.
          } satisfies ComplianceRunningState,
        });
      })
      .catch((e) => {
        // A 400 means no rule matched this combination — there is no run to
        // open, so stay put and show the backend's own explanation.
        setRunError(readRunError(e));
        setStarting(false);
      });
    // No `finally` — on success this screen is unmounting into the progress
    // screen, and clearing the flag first would flash the button back to idle.
  };

  // The upload path. Same 202, same poll, same everything after — the only
  // difference is that the subject travels in the request instead of being
  // named by it, and that the answer takes 60–90s because the file has to be
  // read before it can be judged.
  //
  // Every error this can raise comes back before any file work starts, which is
  // why the navigate is inside the `then`: routing first would strand the user
  // on a progress screen for a run that was never created.
  const uploadAndRun = () => {
    if (!file) return;
    setStarting(true);
    setRunError('');
    complianceValidation
      .createUploadRun({
        file,
        company_id: companyId,
        report_type: reportType,
        period,
        entity_type: entityType,
        market,
        enabled_frameworks: enabled,
      })
      .then((res) => {
        rememberScreen(res.run_id, 'running');
        // The uploaded file's own name is the only label there is — the run has
        // no subject yet, and won't until the file has been read.
        reportRun(
          { runId: res.run_id, status: res.status, title: file.name, period, reportType },
          'local',
        );
        navigate(`/compliance/runs/${res.run_id}/running`, {
          state: {
            // Settings but no subject: the file isn't a document yet — it
            // becomes one only once it has been read, which is after this 202.
            // The progress screen picks the subject up from the run's first
            // poll, so a retry re-runs the document rather than re-uploading.
            // The File itself deliberately doesn't travel; it wouldn't survive
            // a refresh in history state, and it isn't needed again.
            settings: {
              report_type: reportType,
              entity_type: entityType,
              market,
              enabled_frameworks: enabled,
              // Kept for the re-run: the document will need it too.
              period,
            },
            checksQueued: res.checks_queued,
            subjectTitle: file.name,
            fromUpload: true,
          } satisfies ComplianceRunningState,
        });
      })
      .catch((e) => {
        setRunError(readRunError(e));
        setStarting(false);
      });
  };

  const subjectNoun = reportType === 'annual' ? 'reporting cycle' : 'report';

  return (
    <div>
      <ComplianceHeader />

      {canCreate && (
      <>
      <ComplianceStepper activeStep={1} />
      {/* ── Card 1 · Source ─────────────────────────────────────────────── */}
      <Card
        step={1}
        title="Source"
        caption={
          sourceMode === 'upload'
            ? 'Validate a finished report of your own — one you’ve uploaded before, or a new file.'
            : `Choose the report type, then the ${subjectNoun} to validate.`
        }
      >
        {/* First decision in the card: where the report comes from. Approved
            reports or a file of your own — the rest of the wizard can't tell
            the difference, this only decides how the subject arrives. Tabs
            rather than pills so it reads as two ways into the step, not as a
            second filter row alongside the report types below. */}
        <div className="tabs">
          {SOURCE_MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`tab ${sourceMode === m.key ? 'act' : ''}`}
              onClick={() => changeSourceMode(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <PillGroup<ReportType>
          options={REPORT_TYPES}
          value={reportType}
          onChange={changeReportType}
        />

        <div style={{ marginTop: 16 }}>
          {sourceMode === 'upload' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Files uploaded before. They stay on the backend as ordinary
                  reports, so validating one again is a re-run — uploading the
                  same document a second time would duplicate it and all of its
                  extracted text. */}
              {uploadedSubjects.length > 0 && (
                <div>
                  <div style={FIELD_LABEL}>ALREADY UPLOADED</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {uploadedSubjects.map((s) => (
                      <SubjectRow
                        key={s.subject_id}
                        subject={s}
                        selected={s.subject_id === selected?.subject_id}
                        disabled={isPreRules(s)}
                        onSelect={() => pickSubject(s)}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      marginTop: 18,
                      fontSize: 10,
                      fontWeight: 700,
                      color: MUTED,
                    }}
                  >
                    <span style={{ flex: 1, height: 1, background: '#ECEEF8' }} />
                    OR UPLOAD A NEW ONE
                    <span style={{ flex: 1, height: 1, background: '#ECEEF8' }} />
                  </div>
                </div>
              )}
              <UploadPanel
                reportType={reportType}
                file={file}
                fileProblem={fileProblem}
                onPickFile={pickFile}
                year={effectiveYear}
                onPickYear={setYear}
                quarter={quarter}
                onPickQuarter={setQuarter}
                period={period}
              />
            </div>
          ) : subjectsLoading ? (
            <Spinner pad={24} />
          ) : subjectsError ? (
            <div style={{ fontSize: 12, color: '#DC2626' }}>{subjectsError}</div>
          ) : approvedSubjects.length === 0 ? (
            <div
              style={{
                padding: 20,
                borderRadius: 10,
                border: '1.5px dashed #E2E4F0',
                textAlign: 'center',
                fontSize: 12,
                color: MUTED,
                lineHeight: 1.6,
              }}
            >
              No approved {subjectNoun}s to validate.
              <br />
              Only approved {subjectNoun}s can be run through compliance — approve one first, or
              upload a finished report from the tab above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {approvedSubjects.map((s) => (
                <SubjectRow
                  key={s.subject_id}
                  subject={s}
                  selected={s.subject_id === selected?.subject_id}
                  disabled={isPreRules(s)}
                  onSelect={() => pickSubject(s)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── Card 2 · Regulators ─────────────────────────────────────────── */}
      <Card
        step={2}
        title="Regulators"
        caption={
          lockedEntity
            ? 'Set from your company profile — an approved report is validated against the regulators that govern your company. Change your reporting sector on the Profile page to change these.'
            : 'Entity type, market and report type preset the frameworks. Toggle any chip to fine-tune.'
        }
      >
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 7 }}>
              ENTITY TYPE
            </div>
            <PillGroup<EntityType>
              options={ENTITY_TYPES}
              value={entityType}
              onChange={setPickedEntity}
              locked={lockedEntity != null}
              lockedTitle="From your company profile"
            />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 7 }}>
              MARKET
            </div>
            <PillGroup<Market> options={MARKETS} value={market} onChange={setMarket} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          {previewLoading ? (
            <Spinner pad={20} />
          ) : previewError ? (
            <div style={{ fontSize: 12, color: '#DC2626' }}>{previewError}</div>
          ) : allRegulators.length === 0 ? (
            <div style={{ fontSize: 12, color: MUTED }}>
              No frameworks apply to this combination yet.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {allRegulators.map((regulator) => (
                  <FrameworkChip
                    key={regulator}
                    regulator={regulator}
                    checks={applicable.get(regulator) ?? 0}
                    applicable={applicable.has(regulator)}
                    locked={lockedEntity != null}
                    on={enabled.includes(regulator)}
                    onToggle={() => toggleFramework(regulator)}
                  />
                ))}
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid #ECEEF8',
                  fontSize: 11.5,
                  color: MUTED,
                  fontFamily: MONO,
                }}
              >
                {/* A small count is a correct answer, not a warning: the rules
                    that apply depend on the entity and the report type — a
                    quarterly corporate on Main really is a single check. Stated
                    plainly, with no "only" and no amber. */}
                {enabled.length} {enabled.length === 1 ? 'framework' : 'frameworks'} ·{' '}
                {selectedChecks} {selectedChecks === 1 ? 'check' : 'checks'} will run
                {enabled.length !== applicable.size && (
                  <span style={{ opacity: 0.7 }}> (of {applicable.size} applicable)</span>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* ── Card 3 · Validate ───────────────────────────────────────────── */}
      <Card
        step={3}
        title="Validate"
        caption={
          // Only a brand-new file pays the reading cost. Re-running something
          // already uploaded is an ordinary run — its text is already extracted.
          newFileReady && !selected
            ? "Every enabled check is read against what the report actually says. A new file takes 60–90 seconds — it has to be read before it can be judged — and we'll show you the progress."
            : "Every enabled check is read against what the report actually says. This takes 30–60 seconds — we'll show you the progress."
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn bp"
            onClick={runValidation}
            disabled={!canRun}
            style={{
              fontSize: 13,
              padding: '10px 20px',
              opacity: canRun ? 1 : 0.5,
              cursor: canRun ? 'pointer' : 'not-allowed',
            }}
          >
            {starting ? 'Starting…' : '▶ Run validation'}
          </button>
          {!sourceReady && (
            <span style={{ fontSize: 11.5, color: MUTED }}>
              {sourceMode !== 'upload'
                ? `Select a ${subjectNoun} to continue.`
                : file && !fileProblem
                  ? 'Choose a reporting period to continue.'
                  : uploadedSubjects.length > 0
                    ? 'Pick an uploaded report, or choose a new file.'
                    : 'Choose a file to continue.'}
            </span>
          )}
          {sourceReady && enabled.length === 0 && (
            <span style={{ fontSize: 11.5, color: MUTED }}>
              Enable at least one framework to continue.
            </span>
          )}
        </div>

        {/* The 400 reason is a full sentence written for a human, so it gets a
            banner rather than the one-line treatment an unexpected error gets. */}
        {runError && (
          <div
            style={{
              marginTop: 14,
              padding: '11px 14px',
              borderRadius: 10,
              background: 'rgba(245,158,11,.08)',
              border: '1px solid rgba(245,158,11,.3)',
              fontSize: 12,
              color: '#8A5A0B',
              lineHeight: 1.6,
            }}
          >
            {runError}
          </div>
        )}
      </Card>
      </>
      )}

      {/* Unfinished business, then past sign-offs — both for whichever report
          type is selected above, and both render nothing when empty. They sit
          below Validate because they're where you go back to, not part of
          setting a new run up. */}
      {canRead && (
      <>
      <ResumeGallery companyId={companyId} reportType={reportType} />
      <CertifiedGallery companyId={companyId} reportType={reportType} />
      </>
      )}
    </div>
  );
}
