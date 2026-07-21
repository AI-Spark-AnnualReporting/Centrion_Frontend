// Screen 1 of the Compliance Validation wizard — pick a subject, tune the
// regulator frameworks, run the validation.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { ApiError, complianceValidation } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type {
  Candidate,
  CompliancePreview,
  EntityType,
  Market,
  ReportType,
  RunRejectedBody,
} from '@/types/compliance';
import { ComplianceStepper } from './ComplianceStepper';
import { ComplianceHeader, DARK, MONO, MUTED, PRIMARY } from './compliance-ui';

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

// GET /preview returns only a regulator code and a check count, so the friendly
// half of each chip lives here. Anything unmapped falls back to the bare code —
// a new regulator on the backend degrades to "XYZ · 3" rather than breaking.
const FRAMEWORK_LABELS: Record<string, string> = {
  CMA: 'Annual Report (CMA)',
  TADAWUL: 'Tadawul ESG',
  SAMA: 'SAMA Prudential',
  IA: 'Insurance Authority',
  SOCPA: 'Accounting Basis',
  ZATCA: 'Zakat / Tax',
  ISSB: 'ISSB / TCFD',
  GRI: 'GRI',
  ARV: 'Report Integrity',
  MOC: 'Ministry of Commerce',
  SASB: 'SASB',
  ICMA: 'ICMA',
  GHG_PROTOCOL: 'GHG Protocol',
};

// Nearly every rule carries effective_from = 2024-01-01, so a report whose
// period ended before that matches zero rules and POST /runs rejects it. Grey
// those out up front rather than letting the user find out after clicking
// Validate. Bump this if the backend's earliest effective_from moves.
const FIRST_RULED_YEAR = 2024;

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

// POST /runs 400s with an object detail (not FastAPI's usual string) when no
// rule matched. The `reason` is human-written — surface it verbatim.
function readRunRejection(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const raw = err.body as { detail?: RunRejectedBody | string } | undefined;
  const detail = raw?.detail;
  if (!detail) return null;
  if (typeof detail === 'string') return detail;
  return detail.reason ?? detail.message ?? null;
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
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
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
  onToggle,
}: {
  regulator: string;
  checks: number;
  on: boolean;
  applicable: boolean;
  onToggle: () => void;
}) {
  const label = FRAMEWORK_LABELS[regulator];
  const active = applicable && on;
  return (
    <button
      type="button"
      onClick={applicable ? onToggle : undefined}
      disabled={!applicable}
      aria-pressed={active}
      title={
        applicable
          ? `${checks} ${checks === 1 ? 'check' : 'checks'}`
          : "Doesn't apply to the selected entity type"
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
        cursor: applicable ? 'pointer' : 'not-allowed',
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

  const [reportType, setReportType] = useState<ReportType>('esg');
  const [entityType, setEntityType] = useState<EntityType>('corporate');
  const [market, setMarket] = useState<Market>('Main');
  // The whole candidate, not just its id — POST /runs needs the subject_type
  // that came with it, which is the backend's call, not something to re-derive.
  const [selected, setSelected] = useState<Candidate | null>(null);

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

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [summary, setSummary] = useState<{
    runId: string;
    checksRun: number;
    readiness: number | null;
    gate: string;
  } | null>(null);

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
        if (!cancelled) setSubjects(list);
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
  useEffect(() => {
    setEnabled([...applicable.keys()]);
  }, [applicable]);

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

  // An empty `enabled_frameworks` means "no filter" to the API — every rule
  // runs, the opposite of switching them all off. So block the submit instead.
  const canRun = selected != null && enabled.length > 0 && !running;

  const runValidation = () => {
    if (!canRun || !selected) return;
    setRunning(true);
    setRunError('');
    setSummary(null);
    complianceValidation
      .createRun({
        subject_type: selected.subject_type,
        subject_id: selected.subject_id,
        report_type: reportType,
        entity_type: entityType,
        market,
        enabled_frameworks: enabled,
      })
      .then((res) =>
        setSummary({
          runId: res.run_id,
          checksRun: res.checks_run,
          readiness: res.overall_readiness,
          gate: res.publication_gate,
        }),
      )
      .catch((e) => {
        // A 400 means no rule matched this combination — there is no run to
        // open, so stay put and show the backend's own explanation.
        const rejection = readRunRejection(e);
        setRunError(
          rejection ??
            (e instanceof Error ? e.message : 'Validation failed. Please try again.'),
        );
      })
      .finally(() => setRunning(false));
  };

  const subjectNoun = reportType === 'annual' ? 'reporting cycle' : 'report';

  return (
    <div>
      <ComplianceHeader />
      <ComplianceStepper activeStep={1} />

      {/* ── Card 1 · Source ─────────────────────────────────────────────── */}
      <Card
        step={1}
        title="Source"
        caption={`Choose the report type, then the ${subjectNoun} to validate.`}
      >
        <PillGroup<ReportType>
          options={REPORT_TYPES}
          value={reportType}
          onChange={setReportType}
        />

        <div style={{ marginTop: 16 }}>
          {subjectsLoading ? (
            <Spinner pad={24} />
          ) : subjectsError ? (
            <div style={{ fontSize: 12, color: '#DC2626' }}>{subjectsError}</div>
          ) : subjects.length === 0 ? (
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
              Only approved {subjectNoun}s can be run through compliance — approve one first, then
              come back.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {subjects.map((s) => (
                <SubjectRow
                  key={s.subject_id}
                  subject={s}
                  selected={s.subject_id === selected?.subject_id}
                  disabled={isPreRules(s)}
                  onSelect={() => setSelected(s)}
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
        caption="Entity type, market and report type preset the frameworks. Toggle any chip to fine-tune."
      >
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 7 }}>
              ENTITY TYPE
            </div>
            <PillGroup<EntityType>
              options={ENTITY_TYPES}
              value={entityType}
              onChange={setEntityType}
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
                {enabled.length} frameworks · {selectedChecks} checks will run
                {enabled.length !== applicable.size && (
                  <span style={{ opacity: 0.7 }}> (of {applicable.size} applicable)</span>
                )}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* ── Card 3 · Validate ───────────────────────────────────────────── */}
      <Card step={3} title="Validate" caption="Run every enabled check against the report's evidence.">
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
            {running ? 'Running…' : '▶ Run validation'}
          </button>
          {!selected && (
            <span style={{ fontSize: 11.5, color: MUTED }}>
              Select a {subjectNoun} to continue.
            </span>
          )}
          {selected && enabled.length === 0 && (
            <span style={{ fontSize: 11.5, color: MUTED }}>
              Enable at least one framework to continue.
            </span>
          )}
        </div>

        {/* Indeterminate — POST /runs is synchronous and reports no percentage;
            the bar just signals work in flight. */}
        {running && (
          <div
            style={{
              marginTop: 14,
              height: 6,
              borderRadius: 3,
              background: '#ECEEF8',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: '38%',
                height: '100%',
                borderRadius: 3,
                background: PRIMARY,
                animation: 'compliance-indeterminate 1.1s ease-in-out infinite',
              }}
            />
          </div>
        )}

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

        {summary && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: DARK }}>
              Done · {summary.checksRun} {summary.checksRun === 1 ? 'check' : 'checks'} run
              {summary.readiness != null && ` · readiness ${summary.readiness}/100`}
            </div>
            {summary.readiness == null && (
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 5, lineHeight: 1.6 }}>
                Nothing was scoreable — every rule is awaiting a data source. See the breakdown for
                which checks are pending.
              </div>
            )}
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn bp"
                onClick={() => navigate(`/compliance/runs/${summary.runId}`)}
                style={{ fontSize: 13, padding: '10px 20px' }}
              >
                See results &amp; gaps →
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
