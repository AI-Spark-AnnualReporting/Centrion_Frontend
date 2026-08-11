// Step 2 of the quarterly flow — the gate that makes every figure in the report one
// a human approved.
//
// Extraction reads what a document SAYS; a separate mapping pass decides which of our
// metrics each line IS, with a confidence. Lines that matched exactly are already
// stored and shown here as a record. Lines the mapper was unsure about are listed
// below with the document's own wording next to the metric we think it is, and the
// user answers yes or no. Anything not answered yes is left out — silence is not
// consent when the whole point is that someone vouched for the number.

import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import { CustomExtractionReview } from '@/components/quarterly/CustomExtractionReview';
import UserExtractionReview from '@/components/quarterly/UserExtractionReview';
import type { ExtractionReviewFigure, ExtractionReviewResponse, ExtractionReviewDecision, MetricUnitType, MetricsMode } from '@/types/quarterly';

const ACCENT = '#4040C8';
const MUTED = '#6B7280';
const DARK = '#1F2340';

type Answer = 'yes' | 'no' | 'ignore';

// What the user fills in on a "no" row before it can be submitted.
interface Draft {
  sectionGroup: string;
  sectionCode: string;
  unitType: MetricUnitType;
}

// The row's own unit already tells us what kind of quantity this is, so the field
// is a confirmation rather than a question.
function unitTypeFromUnit(unit: string | null): MetricUnitType {
  const u = (unit ?? '').toLowerCase();
  if (u.includes('percent')) return 'percent';
  if (u === 'count' || u === 'volume') return 'count';
  return 'currency';
}

// Display order + titles for the statement groups. Anything the backend sends that
// isn't listed still gets a group, titled from the raw value.
const STATEMENT_TITLES: Record<string, string> = {
  income_statement: 'Income Statement',
  balance_sheet: 'Balance Sheet',
  cash_flow: 'Cash Flow',
  ratio: 'Ratios',
  segment: 'Segments',
};
const STATEMENT_ORDER = ['income_statement', 'balance_sheet', 'cash_flow', 'ratio', 'segment'];

function humanise(code: string | null): string {
  if (!code) return 'Other';
  return STATEMENT_TITLES[code] ?? code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// The backend composes `unit` as "<CURRENCY>_<scale>" for money and a bare word
// ("percent", "ratio", "count") for everything else. Both singular and plural
// scale spellings reach us, since the parser and the document lane disagree.
const UNIT_SCALE_LABELS: Record<string, string> = {
  actual: 'actual',
  units: 'actual',
  ones: 'actual',
  absolute: 'actual',
  thousand: 'thousands',
  thousands: 'thousands',
  million: 'millions',
  millions: 'millions',
  billion: 'billions',
  billions: 'billions',
};

// "SAR_million" → "SAR · millions". Anything unrecognised is passed through
// rather than swallowed — an odd-looking unit is the signal that something
// upstream went wrong, which is the whole reason this column exists.
export function formatUnit(unit: string | null): string | null {
  const raw = (unit ?? '').trim();
  if (!raw) return null;
  const [head, ...rest] = raw.split('_');
  const scale = UNIT_SCALE_LABELS[rest.join('_').toLowerCase()];
  if (scale) return `${head.toUpperCase()} · ${scale}`;
  return raw.replace(/_/g, ' ');
}

// The currency half of a unit, or null for the non-monetary units (percent,
// ratio, count, volume) which legitimately carry none.
function currencyOf(unit: string | null): string | null {
  const head = (unit ?? '').split('_')[0]?.trim().toUpperCase();
  return head && /^[A-Z]{3}$/.test(head) ? head : null;
}

function groupByStatement(rows: ExtractionReviewFigure[]) {
  const byCode = new Map<string, ExtractionReviewFigure[]>();
  for (const r of rows) {
    const code = r.statement ?? 'other';
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code)!.push(r);
  }
  const known = STATEMENT_ORDER.filter((c) => byCode.has(c));
  const rest = [...byCode.keys()].filter((c) => !STATEMENT_ORDER.includes(c)).sort();
  return [...known, ...rest].map((code) => ({
    code,
    title: humanise(code),
    // Least certain first — the rows most in need of a human eye lead.
    rows: byCode.get(code)!.slice().sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)),
  }));
}

function Shell({
  reportId,
  metricsMode,
  children,
}: {
  reportId?: string;
  metricsMode?: MetricsMode | null;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {reportId && (
        <QuarterlyReportStepper step="extraction" reportId={reportId} metricsMode={metricsMode} />
      )}
      {children}
    </div>
  );
}

// Yes / No / Ignore. Deliberately starts UNSET: an unanswered row is excluded, so
// a default of "yes" would quietly re-create the problem this screen exists to
// solve.
//
// No is the ACCENT colour, not a destructive red. It is now the constructive
// answer — it adds the company's own line to their metrics. Ignore is the one that
// throws a figure away, and it takes the neutral grey.
function YesNoIgnore({
  value,
  onChange,
  label,
  noDisabledReason,
}: {
  value: Answer | undefined;
  onChange: (a: Answer) => void;
  label: string;
  // Set when "No" would mint a duplicate of a metric that already holds a figure.
  // Disabled rather than merely warned: the cost is a permanent second metric
  // meaning the same thing, which then auto-matches every quarter.
  noDisabledReason?: string;
}) {
  const btn = (a: Answer, text: string, activeBg: string) => {
    const active = value === a;
    const off = a === 'no' && !!noDisabledReason;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={`${text} — ${label}`}
        aria-disabled={off}
        title={off ? noDisabledReason : undefined}
        onClick={() => !off && onChange(a)}
        style={{
          padding: '5px 14px',
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'inherit',
          border: `1px solid ${active ? activeBg : '#D9DCEC'}`,
          background: active ? activeBg : '#fff',
          color: off ? '#C3C7DA' : active ? '#fff' : '#6B7280',
          cursor: off ? 'not-allowed' : 'pointer',
          transition: 'background .12s, border-color .12s, color .12s',
        }}
      >
        {text}
      </button>
    );
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: 'inline-flex', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}
    >
      {btn('yes', 'Yes', '#10B981')}
      {btn('no', 'No', ACCENT)}
      {btn('ignore', 'Ignore', '#6B7280')}
    </div>
  );
}

function ConfidencePill({ value }: { value: number | null }) {
  if (value == null) return null;
  // Everything on this list is in the uncertain band by definition, so the scale is
  // amber→green within it rather than a pass/fail signal.
  const strong = value >= 80;
  return (
    <span
      className="badge"
      style={{
        background: strong ? 'rgba(34,197,94,.12)' : 'rgba(245,158,11,.14)',
        color: strong ? '#16A34A' : '#B45309',
      }}
    >
      {value}% match
    </span>
  );
}

export default function ExtractionReviewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [data, setData] = useState<ExtractionReviewResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [matchedOpen, setMatchedOpen] = useState(false);

  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    quarterlyReports
      .getExtractionReview(companyId, reportId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load the extracted figures.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reportId, retryKey]);

  const pending = useMemo(() => data?.pending ?? [], [data]);
  const groups = useMemo(() => groupByStatement(pending), [pending]);
  const sectionGroups = useMemo(() => data?.metric_sections ?? [], [data]);

  // Which suggested metrics already hold a figure, and which line filled it.
  //
  // This matters more than "you'd waste an answer". Yes on one of these is stored
  // but never rendered — the report keeps the first figure per metric. No is worse:
  // it mints a permanent custom metric that means the same thing as the built-in,
  // so the number can print twice under two names, every quarter from then on.
  const claimedBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of data?.confirmed ?? []) {
      if (f.metric_key) m.set(f.metric_key, f.source_label ?? f.metric_label ?? f.metric_key);
    }
    for (const f of pending) {
      if (f.metric_key && answers[f.id] === 'yes') {
        m.set(f.metric_key, f.source_label ?? f.metric_key);
      }
    }
    return m;
  }, [data, pending, answers]);

  const isClaimed = (f: ExtractionReviewFigure) =>
    !!f.metric_key && claimedBy.has(f.metric_key) && answers[f.id] !== 'yes';

  // A sheet carrying two currency columns yields the same metric twice, once per
  // currency, and the report prints both. Detected here rather than by comparing
  // against the currency chosen on the setup form — that choice doesn't survive the
  // route, and mixed units are diagnostic on their own.
  //
  // ONLY mixed currency. This used to also warn that "N metrics appear more than
  // once, so the report may print each of them twice", which was wrong twice over:
  // qr_figures is unique per DOCUMENT, so uploading an income statement and a cash
  // flow separately legitimately writes the same metric from each — and the render
  // layer already collapses those to one row per metric. It warned about normal
  // input and then advised reselecting a currency that was never wrong. The
  // already-matched badge on each row covers the useful half of that, in context
  // and per figure.
  const unitWarning = useMemo(() => {
    const rows = [...(data?.confirmed ?? []), ...(data?.pending ?? [])];
    if (rows.length === 0) return null;
    const currencies = [...new Set(rows.map((r) => currencyOf(r.unit)).filter(Boolean))] as string[];
    return currencies.length > 1 ? { currencies } : null;
  }, [data]);
  const answered = pending.filter((f) => answers[f.id]).length;
  // Both Yes and No put a figure in the report — No just puts it there under the
  // company's own name.
  const accepted = pending.filter(
    (f) => answers[f.id] === 'yes' || answers[f.id] === 'no',
  ).length;
  const newMetrics = pending.filter((f) => answers[f.id] === 'no').length;
  const unanswered = pending.length - answered;

  const goOutline = () => navigate(`/quarterly-report/${reportId}/outline`);

  const submit = async () => {
    if (!companyId || !reportId) return;
    setConfirmOpen(false);
    setSubmitting(true);
    try {
      await quarterlyReports.submitExtractionReview(
        companyId,
        reportId,
        // Unanswered rows are sent as an explicit ignore, so the server's record of
        // what was dropped matches what the user actually saw.
        pending.map((f): ExtractionReviewDecision => {
          const a = answers[f.id];
          if (a === 'yes') return { id: f.id, action: 'accept' };
          if (a === 'no') {
            const d = drafts[f.id];
            return {
              id: f.id,
              action: 'create',
              section_code: d?.sectionCode,
              unit_type: d?.unitType ?? unitTypeFromUnit(f.unit),
            };
          }
          return { id: f.id, action: 'ignore' };
        }),
      );
      goOutline();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save your answers.');
      setSubmitting(false);
    }
  };

  // A "no" with no section can't be created — the server would 422, and there is
  // nowhere to put the figure.
  const incompleteCreates = pending.filter(
    (f) => answers[f.id] === 'no' && !drafts[f.id]?.sectionCode,
  );

  // A row can become claimed AFTER it was answered No — say Yes to one copy of a
  // line and the other copy's metric is now filled. The No button disables, but the
  // answer already made is still sitting there, so it has to be caught here too.
  const claimedCreates = pending.filter((f) => answers[f.id] === 'no' && isClaimed(f));

  const onContinue = () => {
    setError(null);
    if (pending.length === 0) {
      goOutline();
      return;
    }
    if (claimedCreates.length > 0) {
      const f = claimedCreates[0];
      setError(
        `“${f.source_label}” would add a second metric meaning the same as ` +
          `${f.metric_label ?? f.metric_key}, which already has a figure. ` +
          'Choose Ignore for it instead.',
      );
      return;
    }
    if (incompleteCreates.length > 0) {
      setError(
        `Pick a section for ${incompleteCreates.length} figure` +
          `${incompleteCreates.length === 1 ? '' : 's'} you answered No to — ` +
          'that is where the new line goes in your report.',
      );
      return;
    }
    if (unanswered > 0) {
      setConfirmOpen(true);
      return;
    }
    void submit();
  };

  const setAll = (code: string, a: Answer) => {
    const group = groups.find((g) => g.code === code);
    if (!group) return;
    setAnswers((prev) => {
      const next = { ...prev };
      for (const row of group.rows) next[row.id] = a;
      return next;
    });
  };

  if (loading) {
    return (
      <Shell reportId={reportId}>
        <Spinner pad={80} />
      </Shell>
    );
  }

  if (error && !data) {
    return (
      <Shell reportId={reportId}>
        <div style={{ padding: '24px 28px' }}>
          <div
            style={{
              padding: '16px 20px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
            <button
              className="bs"
              style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Retry
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // Custom mode is a different screen entirely. There is nothing to confirm: the
  // user settled each figure's section when they chose which file to upload to it,
  // on the step before this one. What is left is tidying — a databook carries
  // spacer rows and repeated subtotals, and a label can read badly out of its
  // sheet. So the rows are editable rather than answerable.
  // Neither own-label lane has a mapping to confirm — only the lines we read. They
  // differ in what there is to say about them: Custom lets you tidy a label, User
  // shows which TABLE each section came from and which tables produced nothing.
  if (data?.metrics_mode === 'user' && reportId) {
    return (
      <Shell reportId={reportId} metricsMode="user">
        <UserExtractionReview reportId={reportId} data={data} />
      </Shell>
    );
  }
  if (data?.metrics_mode === 'custom' && companyId && reportId) {
    return (
      <Shell reportId={reportId} metricsMode="custom">
        <CustomExtractionReview
          companyId={companyId}
          reportId={reportId}
          data={data}
          onData={setData}
        />
      </Shell>
    );
  }

  const confirmed = data?.confirmed ?? [];
  const summary = data?.summary;

  return (
    <Shell reportId={reportId} metricsMode="system">
      {/* Header */}
      <div
        style={{
          padding: '22px 28px 14px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: '0 0 4px', lineHeight: 1.2 }}>
            Check the figures we found
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: MUTED, maxWidth: 620 }}>
            We read the figures out of your documents, then matched them to our standard
            metrics. The ones we're sure about are saved already. Tell us about the rest —
            if a line is your own, we'll add it to your metrics and recognise it from
            next quarter on.
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>
            {summary?.confirmed_count ?? 0} matched
          </div>
          <div style={{ fontSize: 13, color: ACCENT, fontWeight: 800, marginTop: 2 }}>
            {pending.length} to check
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 28px 20px' }}>
        {unitWarning && (
          <div
            role="note"
            aria-label="Mixed units warning"
            style={{
              display: 'flex',
              gap: 10,
              padding: '11px 13px',
              marginBottom: 16,
              borderRadius: 12,
              border: '1px solid rgba(245,158,11,.35)',
              background: 'rgba(245,158,11,.08)',
              fontSize: 11.5,
              lineHeight: 1.55,
              color: '#8A6520',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <path d="M10 6v5M10 14h.01" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="10" r="8.5" stroke="#D97706" strokeWidth="1.5" />
            </svg>
            <div>
              <div style={{ fontWeight: 700, color: '#B45309', marginBottom: 3 }}>
                Figures were read in more than one currency (
                {unitWarning.currencies.join(', ')})
              </div>
              Your report is denominated in one currency, so the figures in the others will
              be left out. If that is the wrong way round, regenerate with the currency you
              want selected on the upload step.
            </div>
          </div>
        )}

        {/* Matched — a record, nothing to do. Collapsed so it never buries the work. */}
        <div className="card" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="ch"
            onClick={() => setMatchedOpen((o) => !o)}
            aria-expanded={matchedOpen}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              borderBottom: matchedOpen ? '1px solid #ECEEF8' : 'none',
              cursor: 'pointer',
              font: 'inherit',
              textAlign: 'left',
            }}
          >
            <span className="ct" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {matchedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Matched to your metrics
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9BA3C4' }}>
              {confirmed.length} saved · nothing to do
            </span>
          </button>
          {matchedOpen && (
            <div className="cb" style={{ maxHeight: 260, overflowY: 'auto', padding: 0 }}>
              {confirmed.length === 0 ? (
                <div style={{ padding: '16px 18px', fontSize: 12, color: MUTED }}>
                  Nothing matched exactly. Everything we found is below for you to check.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ color: '#9BA3C4', fontSize: 11, textAlign: 'left' }}>
                      <th style={{ padding: '10px 18px', fontWeight: 700 }}>System metric</th>
                      <th style={{ padding: '10px 18px', fontWeight: 700 }}>In your document</th>
                      <th style={{ padding: '10px 18px', fontWeight: 700, textAlign: 'right' }}>Value</th>
                      {/* Its own column, not a suffix on the value — the point is
                          to make an odd one out scannable down the list. */}
                      <th style={{ padding: '10px 18px', fontWeight: 700 }}>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmed.map((f) => (
                      <tr key={f.id} style={{ borderTop: '1px solid #F1F2F8' }}>
                        <td style={{ padding: '9px 18px', fontWeight: 700, color: DARK }}>
                          {f.metric_label ?? f.metric_key}
                        </td>
                        <td style={{ padding: '9px 18px', color: MUTED }}>{f.source_label ?? '—'}</td>
                        <td
                          style={{
                            padding: '9px 18px',
                            textAlign: 'right',
                            fontVariantNumeric: 'tabular-nums',
                            color: DARK,
                          }}
                        >
                          {f.value_display ?? f.value ?? '—'}
                        </td>
                        <td style={{ padding: '9px 18px', color: MUTED, whiteSpace: 'nowrap' }}>
                          {formatUnit(f.unit) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Needs confirmation — the actual work */}
        {pending.length === 0 ? (
          <div className="card">
            <div className="cb" style={{ padding: '28px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 4 }}>
                Nothing needs checking
              </div>
              <div style={{ fontSize: 12, color: MUTED }}>
                Every figure we found matched one of our metrics exactly.
              </div>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div className="card" key={group.code} style={{ marginBottom: 16 }}>
              <div className="ch">
                <span className="ct">{group.title}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9BA3C4' }}>
                    {group.rows.length} to check
                  </span>
                  <button
                    type="button"
                    className="btn bs"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setAll(group.code, 'yes')}
                  >
                    Yes to all
                  </button>
                  {/* "No to all" would open N section pickers in an unsubmittable
                      state. With a 50-94 band these lists are long, so the bulk
                      action people actually want is to clear the noise. */}
                  <button
                    type="button"
                    className="btn bs"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setAll(group.code, 'ignore')}
                  >
                    Ignore all
                  </button>
                </span>
              </div>
              <div className="cb" style={{ padding: 0 }}>
                {group.rows.map((f) => (
                  <div
                    key={f.id}
                    data-testid={`row-${f.id}`}
                    style={{
                      borderTop: '1px solid #F1F2F8',
                      // Dimming follows "ignore" now — a "no" row is the one that
                      // needs the most attention, not the least.
                      background: answers[f.id] === 'ignore' ? '#FCFCFD' : '#fff',
                      opacity: answers[f.id] === 'ignore' ? 0.6 : 1,
                      transition: 'background .12s, opacity .12s',
                    }}
                  >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 18px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: DARK, lineHeight: 1.45 }}>
                        Is <strong>“{f.source_label ?? 'this figure'}”</strong> in your document the
                        same as <strong>{f.metric_label ?? f.metric_key}</strong>?
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          marginTop: 4,
                          fontSize: 11,
                          color: '#9BA3C4',
                        }}
                      >
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {f.value_display ?? f.value ?? '—'}
                        </span>
                        {formatUnit(f.unit) && <span>{formatUnit(f.unit)}</span>}
                        {f.source_page != null && <span>page {f.source_page}</span>}
                        <ConfidencePill value={f.confidence} />
                      </div>
                      {/* Already spoken for. Naming the other line reads as
                          nonsense when it is the SAME wording from a second file,
                          which is the common case — figures arrive per document, so
                          one line appears once per file it is in. Say what to do
                          instead of restating the label back at the user. */}
                      {isClaimed(f) && (
                        <div style={{ marginTop: 5, fontSize: 11, color: '#B45309' }}>
                          {claimedBy.get(f.metric_key!) === (f.source_label ?? '')
                            ? `Already in the report — this line was read from more than one of your files. Skip it.`
                            : `${f.metric_label ?? f.metric_key} is already filled by “${claimedBy.get(f.metric_key!)}”. Skip this one unless it is a different figure.`}
                        </div>
                      )}
                    </div>
                    <YesNoIgnore
                      value={answers[f.id]}
                      onChange={(a) => {
                        setAnswers((prev) => ({ ...prev, [f.id]: a }));
                        if (a === 'no') {
                          setDrafts((prev) =>
                            prev[f.id]
                              ? prev
                              : {
                                  ...prev,
                                  [f.id]: {
                                    sectionGroup: '',
                                    sectionCode: '',
                                    unitType: unitTypeFromUnit(f.unit),
                                  },
                                },
                          );
                        }
                      }}
                      label={`${f.source_label ?? 'figure'} is ${f.metric_label ?? f.metric_key}`}
                      noDisabledReason={
                        isClaimed(f)
                          ? `${f.metric_label ?? f.metric_key} already has a figure. Adding this as your own metric would put the same number in the report twice, under two names.`
                          : undefined
                      }
                    />
                  </div>

                  {/* Below the row, not inside it — the flex line has no room and
                      would wrap badly. No confirmation step first: at 50+ confidence
                      these are real figures, so "no" goes straight to the details. */}
                  {answers[f.id] === 'no' && (
                    <div
                      style={{
                        padding: '0 18px 14px 18px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: '1 1 100%', fontSize: 11.5, color: MUTED }}>
                        We'll add <strong style={{ color: DARK }}>“{f.source_label}”</strong> to
                        your metrics exactly as written, so next quarter we recognise it
                        automatically. Where does it belong?
                      </div>
                      <div style={{ flex: '1 1 180px' }}>
                        <label className="fl-label" htmlFor={`grp-${f.id}`}>Part of the report</label>
                        <select
                          id={`grp-${f.id}`}
                          className="inp sel"
                          value={drafts[f.id]?.sectionGroup ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [f.id]: {
                                ...(prev[f.id] ?? { unitType: unitTypeFromUnit(f.unit) }),
                                sectionGroup: e.target.value,
                                // Clear the section, or a stale pick from the previous
                                // group stays selected and invisible.
                                sectionCode: '',
                              } as Draft,
                            }))
                          }
                        >
                          <option value="">Select…</option>
                          {sectionGroups.map((g) => (
                            <option key={g.group} value={g.group}>{g.group}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: '1 1 200px' }}>
                        <label className="fl-label" htmlFor={`sec-${f.id}`}>Section</label>
                        <select
                          id={`sec-${f.id}`}
                          className="inp sel"
                          disabled={!drafts[f.id]?.sectionGroup}
                          value={drafts[f.id]?.sectionCode ?? ''}
                          onChange={(e) => {
                            setError(null);   // they just fixed what was blocking
                            setDrafts((prev) => ({
                              ...prev,
                              [f.id]: { ...(prev[f.id] as Draft), sectionCode: e.target.value },
                            }));
                          }}
                        >
                          <option value="">Select…</option>
                          {(sectionGroups.find((g) => g.group === drafts[f.id]?.sectionGroup)
                            ?.sections ?? []).map((s) => (
                            <option key={s.section_code} value={s.section_code}>{s.title}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ flex: '0 1 140px' }}>
                        <label className="fl-label" htmlFor={`unit-${f.id}`}>This figure is</label>
                        <select
                          id={`unit-${f.id}`}
                          className="inp sel"
                          value={drafts[f.id]?.unitType ?? unitTypeFromUnit(f.unit)}
                          onChange={(e) =>
                            setDrafts((prev) => ({
                              ...prev,
                              [f.id]: {
                                ...(prev[f.id] as Draft),
                                unitType: e.target.value as MetricUnitType,
                              },
                            }))
                          }
                        >
                          <option value="currency">Money</option>
                          <option value="percent">A percentage</option>
                          <option value="count">A count</option>
                        </select>
                      </div>
                    </div>
                  )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {pending.length > 0 && (
          <p style={{ fontSize: 11.5, color: MUTED, margin: '0 2px', lineHeight: 1.5 }}>
            Saying <strong>Yes</strong> files that figure under the system metric — a line your
            document calls “COGS-S” will appear in the report as “Cost of Goods Sold”. Its original
            name is kept on record. Saying <strong>No</strong> keeps your own name for it: we add
            it to your metrics exactly as written, put it in the section you pick, and match it
            automatically next quarter. <strong>Ignore</strong>, or leaving a row unanswered,
            leaves the figure out of the report entirely.
            {summary && summary.discarded_count > 0 && (
              <>
                {' '}We also read {summary.discarded_count} other line
                {summary.discarded_count === 1 ? '' : 's'} that didn't match any of our metrics;
                those aren't used.
              </>
            )}
          </p>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          background: '#fff',
          borderTop: '1px solid #E5E7EF',
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <button className="btn bs" onClick={() => navigate('/reports/quarterly')}>
          ← Back
        </button>
        {/* Doubles as the validation line. The error block at the top only renders
            when the page failed to load at all, so without this a blocked Continue
            would look like a dead button. */}
        <span
          aria-live="polite"
          style={{ fontSize: 12, color: error ? '#B45309' : MUTED, textAlign: 'center' }}
        >
          {error
            ? error
            : pending.length === 0
              ? `${confirmed.length} figure${confirmed.length === 1 ? '' : 's'} ready`
              : `${answered} of ${pending.length} answered · ${accepted} will be added` +
                (newMetrics > 0
                  ? ` · ${newMetrics} new metric${newMetrics === 1 ? '' : 's'}`
                  : '')}
        </span>
        {/* .btn's base size (7px 14px / 12px) is the utility size — every primary
            page action in the app overrides it to this. Without the override the
            page's main CTA renders the same size as the Back button beside it. */}
        <button
          className="btn bp"
          onClick={onContinue}
          disabled={submitting}
          style={{ padding: '11px 24px', fontSize: 13 }}
        >
          {submitting ? 'Saving…' : 'Continue to outline →'}
        </button>
      </div>

      {/* Soft gate — unanswered rows are excluded, so say so plainly before moving on. */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Some figures are unanswered"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(20,22,40,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: '22px 24px',
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 20px 60px rgba(20,22,40,.25)',
            }}
          >
            <h2 style={{ fontSize: 16, fontWeight: 800, color: DARK, margin: '0 0 8px' }}>
              {unanswered} figure{unanswered === 1 ? '' : 's'} still unanswered
            </h2>
            <p style={{ fontSize: 13, color: MUTED, margin: '0 0 18px', lineHeight: 1.5 }}>
              Anything you haven't confirmed is left out of the report. You can go back and
              answer them, or continue with the {accepted} you've said Yes to.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn bs" onClick={() => setConfirmOpen(false)}>
                Keep checking
              </button>
              <button className="btn bp" onClick={() => void submit()}>
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
