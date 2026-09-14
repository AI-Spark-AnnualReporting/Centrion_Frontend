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
import { SectionPicker, flattenSections } from '@/components/quarterly/SectionPicker';
import { ExcludedLines } from '@/components/quarterly/ExcludedLines';
import { AddFinancialFilesDialog } from '@/components/quarterly/AddFinancialFilesDialog';
import UserExtractionReview from '@/components/quarterly/UserExtractionReview';
import type {
  ExtractionReviewFigure,
  ExtractionReviewResponse,
  ExtractionReviewDecision,
  ExtractionReviewSource,
  MetricUnitType,
  MetricsMode,
} from '@/types/quarterly';

const ACCENT = '#4040C8';
const MUTED = '#6B7280';
const DARK = '#1F2340';

// What the user can change about one unmatched line. Every row starts INCLUDED
// with the guess filled in, so a run where the guesses are right is a single
// Continue — the work is correcting, not answering.
interface RowState {
  included: boolean;
  label: string;
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

// Grouped by where the lines came from — one card per (file, sheet), rows in the
// order they sat in the file. Grouping by statement type is gone with the mapper
// that produced it: an unmatched line has no metric, so it has no statement.
//
// A sheet the server did not list still gets a card, keyed off the row itself, so
// a figure can never fall out of the UI just because its group was missing.
function groupBySource(rows: ExtractionReviewFigure[], sources: ExtractionReviewSource[]) {
  const key = (d?: string | null, t?: string | null) => `${d ?? ''}\u0000${t ?? ''}`;
  const meta = new Map(sources.map((s) => [key(s.document_id, s.source_table), s]));
  const byKey = new Map<string, ExtractionReviewFigure[]>();
  for (const r of rows) {
    const k = key(r.document_id, r.source_table);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }
  return [...byKey.entries()].map(([k, group]) => {
    const s = meta.get(k);
    return {
      key: k,
      filename: s?.filename ?? group[0]?.source_table ?? 'Uploaded file',
      sheet: s?.source_table ?? group[0]?.source_table ?? null,
      guess: s?.guessed_section ?? '',
      rows: group.slice().sort((a, b) => (a.source_page ?? 0) - (b.source_page ?? 0)),
    };
  });
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

export default function ExtractionReviewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [data, setData] = useState<ExtractionReviewResponse | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [matchedOpen, setMatchedOpen] = useState(false);
  // "Upload more files". The dialog lives here rather than inside the lane component
  // so that component keeps making no network calls of its own.
  const [addOpen, setAddOpen] = useState(false);
  const [unlockedNotice, setUnlockedNotice] = useState(false);

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
  const sources = useMemo(() => data?.sources ?? [], [data]);
  const groups = useMemo(() => groupBySource(pending, sources), [pending, sources]);
  const sections = useMemo(() => flattenSections(data?.metric_sections ?? []), [data]);

  // Seed one entry per row the moment the payload lands: included, named as the
  // document named it, filed under its sheet's guess. Everything the user does
  // from here is a correction to that, which is what makes a run where the
  // guesses are right a single click.
  useEffect(() => {
    if (!data) return;
    const guessFor = new Map(
      groups.flatMap((g) => g.rows.map((r) => [r.id, g.guess] as const)),
    );
    setRowState(
      Object.fromEntries(
        pending.map((f) => [
          f.id,
          {
            included: true,
            label: f.source_label ?? '',
            sectionCode: guessFor.get(f.id) ?? '',
            unitType: unitTypeFromUnit(f.unit),
          },
        ]),
      ),
    );
    // groups derives from data; keying on data alone avoids reseeding (and wiping
    // the user's edits) on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const patch = (id: string, next: Partial<RowState>) => {
    setError(null);
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], ...next } }));
  };

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
  const included = pending.filter((f) => rowState[f.id]?.included);
  const excludedCount = pending.length - included.length;

  // Blocking problems, computed once and reused by both the footer text and the
  // Continue handler so the message and the block can never disagree.
  const problems = useMemo(() => {
    const noSection = included.filter((f) => !rowState[f.id]?.sectionCode.trim());
    const noLabel = included.filter((f) => !rowState[f.id]?.label.trim());
    // Two kept lines under one name in the SAME file and period would upsert onto
    // one row server-side and the second would silently overwrite the first. The
    // server refuses it; catching it here means the user finds out while they can
    // still see which two rows are involved.
    const seen = new Map<string, ExtractionReviewFigure>();
    const clash: ExtractionReviewFigure[] = [];
    for (const f of included) {
      const name = (rowState[f.id]?.label ?? '').trim().toLowerCase();
      if (!name) continue;
      const k = `${f.document_id ?? ''} ${f.period ?? ''} ${name}`;
      if (seen.has(k)) clash.push(f);
      else seen.set(k, f);
    }
    return { noSection, noLabel, clash };
  }, [included, rowState]);

  const goOutline = () => navigate(`/quarterly-report/${reportId}/outline`);

  const submit = async () => {
    if (!companyId || !reportId) return;
    setSubmitting(true);
    try {
      await quarterlyReports.submitExtractionReview(
        companyId,
        reportId,
        // Every row gets an explicit decision. The server refuses a partial batch
        // now — a row with no answer carries no label and no section, so it can be
        // honoured neither way, and dropping it would lose a figure silently.
        pending.map((f): ExtractionReviewDecision => {
          const s = rowState[f.id];
          if (!s?.included) return { id: f.id, action: 'exclude' };
          return {
            id: f.id,
            action: 'keep',
            label: s.label.trim(),
            section_code: s.sectionCode,
            unit_type: s.unitType,
          };
        }),
      );
      goOutline();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save your answers.');
      setSubmitting(false);
    }
  };

  const onContinue = () => {
    setError(null);
    if (pending.length === 0) {
      goOutline();
      return;
    }
    if (problems.noLabel.length > 0) {
      setError(`${problems.noLabel.length} line${problems.noLabel.length === 1 ? ' has' : 's have'} no name. Name it, or exclude it.`);
      return;
    }
    if (problems.noSection.length > 0) {
      setError(
        `Pick a section for ${problems.noSection.length} figure` +
          `${problems.noSection.length === 1 ? '' : 's'} — that is where the line goes in your report.`,
      );
      return;
    }
    if (problems.clash.length > 0) {
      const f = problems.clash[0];
      setError(
        `Two lines in the same file are both called “${rowState[f.id]?.label.trim()}”. ` +
          'One would overwrite the other, so give them different names or exclude one.',
      );
      return;
    }
    // No confirmation dialog. Nothing here is destructive and nothing is implicit:
    // an excluded row was excluded on purpose, and it says so on the row.
    void submit();
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
        {unlockedNotice && (
          <div style={{
            margin: '14px 28px 0', padding: '10px 14px', fontSize: 12.5,
            background: '#FFF8EC', border: '1px solid #F5E3C0',
            borderRadius: 8, color: '#7C4A03', lineHeight: 1.6,
          }}>
            Your outline was unlocked because the figures changed. You'll need to
            review and lock it again before the report is rebuilt.
          </div>
        )}
        <UserExtractionReview
          reportId={reportId}
          data={data}
          onAddFiles={companyId ? () => setAddOpen(true) : undefined}
        />
        {addOpen && companyId && (
          <AddFinancialFilesDialog
            companyId={companyId}
            reportId={reportId}
            defaultCurrency={data.financial_currency}
            defaultScale={data.financial_scale}
            onClose={() => setAddOpen(false)}
            onDone={({ outlineUnlocked }) => {
              setAddOpen(false);
              if (outlineUnlocked) setUnlockedNotice(true);
              // Reuse the page's one fetch effect rather than a second code path
              // that could disagree with it about loading and error state.
              setRetryKey((k) => k + 1);
            }}
          />
        )}
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
            Add these to your metrics
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: MUTED, maxWidth: 640 }}>
            These lines are yours, not ours — so we've listed them rather than guessed at
            them. Check the name and the section, and we'll add each one to your metrics.
            Once filed, we'll match them on every future report.
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>
            {summary?.confirmed_count ?? 0} matched
          </div>
          <div style={{ fontSize: 13, color: ACCENT, fontWeight: 800, marginTop: 2 }}>
            {pending.length} to file
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

        {/* Excluding is the one decision here that outlives this report, so the way
            back has to live here too. Rendered even with nothing left to file — a
            user who excluded everything sees an empty screen, which is precisely
            when they need to get back in. */}
        {companyId && <ExcludedLines companyId={companyId} />}

        {/* The lines to file — the actual work */}
        {pending.length === 0 ? (
          <div className="card">
            <div className="cb" style={{ padding: '28px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: DARK, marginBottom: 4 }}>
                Nothing left to file
              </div>
              <div style={{ fontSize: 12, color: MUTED }}>
                Every figure we found matched a metric you already have.
              </div>
            </div>
          </div>
        ) : (
          groups.map((group) => (
            <div className="card" key={group.key} style={{ marginBottom: 16 }}>
              <div className="ch">
                <span className="ct" style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8 }}>
                  {group.filename}
                  {/* The sheet only when it adds something — a one-tab file repeating
                      its own name in smaller type is noise. */}
                  {group.sheet && group.sheet !== group.filename && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9BA3C4' }}>
                      {group.sheet}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9BA3C4' }}>
                  {group.rows.length} line{group.rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="cb" style={{ padding: 0 }}>
                {group.rows.map((f) => {
                  const s = rowState[f.id];
                  if (!s) return null;
                  const original = f.source_label ?? '';
                  return (
                    <div
                      key={f.id}
                      data-testid={`row-${f.id}`}
                      style={{
                        borderTop: '1px solid #F1F2F8',
                        // Excluded rows dim but KEEP THEIR PLACE. A list that
                        // reorders under the cursor is unusable at sixty rows.
                        background: s.included ? '#fff' : '#FCFCFD',
                        opacity: s.included ? 1 : 0.55,
                        transition: 'background .12s, opacity .12s',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '10px 18px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        aria-pressed={!s.included}
                        aria-label={`${s.included ? 'Exclude' : 'Include'} ${original || 'this figure'}`}
                        onClick={() => patch(f.id, { included: !s.included })}
                        style={{
                          marginTop: 18,
                          padding: '5px 11px',
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          borderRadius: 7,
                          border: `1px solid ${s.included ? '#D9DCEC' : ACCENT}`,
                          background: s.included ? '#fff' : ACCENT,
                          color: s.included ? '#6B7280' : '#fff',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {s.included ? 'Exclude' : 'Excluded'}
                      </button>

                      <div style={{ flex: '2 1 210px', minWidth: 160 }}>
                        <label className="fl-label" htmlFor={`lbl-${f.id}`}>Name</label>
                        <input
                          id={`lbl-${f.id}`}
                          className="inp"
                          value={s.label}
                          disabled={!s.included}
                          onChange={(e) => patch(f.id, { label: e.target.value })}
                          style={{ width: '100%', fontSize: 12.5 }}
                        />
                        {/* Only once it differs — the document's wording becomes a
                            synonym server-side, so a rename still matches next
                            quarter, and saying so is what makes editing feel safe. */}
                        {s.label.trim() !== original && original && (
                          <div style={{ fontSize: 10.5, color: '#9BA3C4', marginTop: 3 }}>
                            was “{original}” — we'll still match that
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          flex: '0 1 130px',
                          minWidth: 100,
                          marginTop: 18,
                          textAlign: 'right',
                          fontSize: 12.5,
                          color: DARK,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {f.value_display ?? f.value ?? '—'}
                        <div style={{ fontSize: 10.5, color: '#9BA3C4' }}>
                          {formatUnit(f.unit) ?? ''}
                        </div>
                      </div>

                      <div style={{ flex: '2 1 190px', minWidth: 160 }}>
                        <label className="fl-label" htmlFor={`sec-${f.id}`}>Section</label>
                        {s.included ? (
                          <SectionPicker
                            sections={sections}
                            value={s.sectionCode}
                            onChange={(code) => patch(f.id, { sectionCode: code })}
                            ariaLabel={`Section for ${s.label || original || 'this figure'}`}
                            invalid={!s.sectionCode}
                          />
                        ) : (
                          <input id={`sec-${f.id}`} className="inp" disabled value="" style={{ width: '100%' }} />
                        )}
                      </div>

                      <div style={{ flex: '0 1 130px', minWidth: 110 }}>
                        <label className="fl-label" htmlFor={`unit-${f.id}`}>This figure is</label>
                        <select
                          id={`unit-${f.id}`}
                          className="inp sel"
                          disabled={!s.included}
                          value={s.unitType}
                          onChange={(e) => patch(f.id, { unitType: e.target.value as MetricUnitType })}
                        >
                          <option value="currency">Money</option>
                          <option value="percent">A percentage</option>
                          <option value="count">A count</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {pending.length > 0 && (
          <p style={{ fontSize: 11.5, color: MUTED, margin: '0 2px', lineHeight: 1.5 }}>
            Every line here is <strong>included</strong> unless you exclude it. We add each one to
            your metrics under the name you give it, in the section you pick.{' '}
            <strong>This takes a few minutes the first quarter — next quarter these match
            automatically</strong>, and anything you exclude is never asked about again.
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
              : `${included.length} to add` +
                (excludedCount > 0 ? ` · ${excludedCount} excluded` : '')}
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
    </Shell>
  );
}
