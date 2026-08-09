import { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Lock } from 'lucide-react';
import { Spinner } from '@/components/shared/Spinner';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports, ApiError } from '@/lib/api';
import type { OutlineSection, OutlineResponse } from '@/types/quarterly';
import type { ProcessingPageState } from '@/pages/ProcessingPage';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import { byDisplayOrder, isTableOfContentsSection } from '@/components/quarterly/sectionState';

// ─── colours (shared quarterly conventions) ──────────────────────────────────
const ACCENT = '#4040C8';
const GREEN = '#10B981';
const MUTED = '#6B7280';
const DARK = '#1F2340';

type Preset = 'required' | 'recommended' | 'everything';
type SaveState = 'idle' | 'saving' | 'saved';

// ─── Feeder badge — the per-section "where the content comes from" signal ─────
function FeederBadge({
  feeder,
  ingesting,
}: {
  feeder: OutlineSection['feeder'];
  // Ingest still running: a "needs_input" verdict is not final yet — the worker
  // may not have written this section's figures. Show "Preparing" instead of
  // telling the user to go find a document that the system is already extracting.
  ingesting?: boolean;
}) {
  // 'ready'/'template'/'external' are stable mid-ingest (ready never un-readies,
  // and the other two don't depend on figures), so only needs_input is deferred.
  if (ingesting && feeder.status === 'needs_input') {
    return (
      <span
        className="badge"
        style={{ background: 'rgba(64,64,200,.10)', color: ACCENT }}
      >
        Preparing…
      </span>
    );
  }
  switch (feeder.status) {
    case 'ready':
      return (
        <span className="badge b-gn">
          From {feeder.document_name ?? 'document'}
        </span>
      );
    case 'template':
      return <span className="badge b-gy">System template</span>;
    case 'external':
      return <span className="badge b-am">External data</span>;
    case 'needs_input':
      // No orange badge class exists — inline it.
      return (
        <span
          className="badge"
          style={{ background: 'rgba(249,115,22,.12)', color: '#EA580C' }}
        >
          Needs input{feeder.message ? `: ${feeder.message}` : ''}
        </span>
      );
    default:
      return null;
  }
}

// ─── Custom checkbox button (mirrors QuarterlyReportForm's report-area check) ──
function CheckBox({
  checked,
  disabled,
  onToggle,
  label,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  label: string;
  // Why it's disabled, when "you can't tick this" needs an explanation.
  title?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={title}
      onClick={
        disabled
          ? undefined
          : (e) => {
              e.stopPropagation();
              onToggle?.();
            }
      }
      style={{
        width: 18,
        height: 18,
        padding: 0,
        borderRadius: 5,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: checked ? 'none' : '1.5px solid #C9CDE4',
        background: checked ? ACCENT : '#fff',
        opacity: disabled && !checked ? 0.6 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
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
  );
}

// ─── Page shell (stepper + bounded flex column) ───────────────────────────────
function Shell({
  reportId,
  metricsMode,
  children,
}: {
  reportId?: string;
  // Custom reports have an extra Financial Data step in the indicator. Unknown
  // until the outline loads, which is why it's nullable rather than defaulted.
  metricsMode?: 'system' | 'custom' | null;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // 100%, not calc(100% - 48px): the 48px was double-counting the stepper,
        // which renders INSIDE this shell. .content already provides the gutter.
        height: '100%',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {reportId && (
        <QuarterlyReportStepper step="outline" reportId={reportId} metricsMode={metricsMode} />
      )}
      {children}
    </div>
  );
}

// A single row. One list holds both required and optional sections, so the row
// carries the whole required/optional distinction: the tint, the disabled tick,
// and the badges.
function SectionRow({
  section,
  number,
  locked,
  ingesting,
  isRequired,
  dragging,
  dragOver,
  onToggle,
  dragHandleProps,
}: {
  section: OutlineSection;
  // null = no number: either an excluded section (not in the report, so it has
  // no position) or the hidden Table of Contents.
  number: number | null;
  locked: boolean; // whole-outline frozen
  // Ingest in flight — include-defaults are computed from a half-written figure
  // set, so ticking is frozen until it lands (same treatment as `locked`).
  ingesting?: boolean;
  isRequired: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onToggle?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement> & {
    draggable?: boolean;
  };
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 12,
        border: `1px solid ${dragOver ? ACCENT : '#E8EAF3'}`,
        background: dragOver ? 'rgba(64,64,200,.05)' : isRequired ? '#FAFBFE' : '#fff',
        opacity: dragging ? 0.4 : 1,
        transition: 'border-color .12s, background .12s, opacity .12s',
      }}
    >
      {/* Lead: grip handle — required and optional rows are both reorderable.
          (Required-ness is conveyed by the disabled checkbox + badges.) */}
      <span
        {...dragHandleProps}
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${section.title}`}
        title="Drag to reorder (or use arrow keys)"
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          cursor: 'grab',
          color: '#9BA3C4',
          outlineOffset: 2,
        }}
      >
        <GripVertical size={16} aria-hidden />
      </span>

      {/* financials_excluded: a Custom report's financial section the user unticked
          on the Financial Data step. It has no figures, so re-ticking it here would
          only add an empty table — and that decision has one home. The backend
          rejects it too, so this isn't the only thing holding the rule up. */}
      <CheckBox
        checked={section.included}
        disabled={locked || isRequired || ingesting || section.financials_excluded === true}
        onToggle={onToggle}
        label={
          section.included
            ? `Exclude ${section.title}`
            : `Include ${section.title}`
        }
        title={
          section.financials_excluded
            ? 'Excluded on the Financial Data step — upload a file for it there to bring it back'
            : undefined
        }
      />

      <span
        style={{
          width: 22,
          fontSize: 12,
          fontWeight: 700,
          color: '#9BA3C4',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
        {number ?? '—'}
      </span>

      {/* Excluded sections stay in the list (so they can be ticked or moved) but
          read as "not in the report" at a glance, alongside the dashed number. */}
      <div style={{ flex: 1, minWidth: 0, opacity: section.included ? 1 : 0.55 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: DARK,
            lineHeight: 1.35,
          }}
        >
          {section.title}
        </div>
        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>
          {section.part_label}
          {section.financials_excluded && (
            <span style={{ color: '#B45309' }}>
              {' · '}excluded on Financial Data
            </span>
          )}
        </div>
      </div>

      {/* Badges. With one merged list these are the only thing telling the user
          which sections they can actually remove, so optional rows are labelled
          explicitly rather than by absence of a REQUIRED badge. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <FeederBadge feeder={section.feeder} ingesting={ingesting} />
        {isRequired ? (
          <>
            <span className="badge b-gy">REQUIRED</span>
            <span className="badge b-gy">LOCKED</span>
          </>
        ) : (
          <span className="badge b-or">OPTIONAL</span>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OutlinePage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // ONE list, required and optional interleaved, ordered purely by display_order.
  // The blueprint catalogue already interleaves them in true document order (the
  // CEO statement belongs between the front matter and the results headline, not
  // in a bin at the bottom), and any row can be dragged anywhere.
  const [sections, setSections] = useState<OutlineSection[]>([]);
  const [totalCatalogue, setTotalCatalogue] = useState(0);
  // Custom reports have an extra Financial Data step, and their financial sections
  // were already decided there — see the greyed rows below.
  const [metricsMode, setMetricsMode] = useState<'system' | 'custom' | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  // Ingest worker still writing figures — badges are provisional until it clears.
  const [ingesting, setIngesting] = useState(false);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [submitting, setSubmitting] = useState(false);

  // Snapshot of the backend's per-section `recommended` flags (for the Recommended preset).
  const defaultIncludedRef = useRef<Record<string, boolean>>({});
  // Debounce + latest-wins guards for autosave.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
  // Has the user reordered or ticked anything since the last server truth? Guards
  // the ingest poll below from overwriting unsaved local edits.
  const userTouchedRef = useRef(false);
  // Drag state — one flat list, so a single index is enough.
  const dragIndexRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    quarterlyReports
      .getOutline(companyId, reportId)
      .then((res) => {
        if (cancelled) return;
        applyResponse(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(
          err instanceof Error ? err.message : 'Failed to load the outline.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reportId, retryKey]);

  // Adopt a server response as the new truth: one list in display_order.
  const applyResponse = (res: OutlineResponse) => {
    const all = res.sections
      // Catalogue-drift rows come back with no requirement; the old two-array
      // split dropped them silently, so keep dropping them rather than render a
      // row with no title. Omitting a code from the PUT leaves its row untouched.
      .filter((s) => s.requirement === 'required' || s.requirement === 'optional')
      .slice()
      // Stable sort, so display_order ties keep the backend's own ordering.
      .sort(byDisplayOrder)
      // Force required rows included: a stale included:false would render an
      // un-untickable empty box and then PUT as false, which the backend 409s.
      .map((s) => (s.requirement === 'required' ? { ...s, included: true } : s));
    setSections(all);
    setMetricsMode(res.metrics_mode ?? null);
    setTotalCatalogue(res.total_catalogue ?? res.sections.length);
    // Whole-outline freeze: explicit flag, or every section locked.
    // (api.ts normalises the backend's `outline_locked` onto `locked`.)
    setIsLocked(
      res.locked === true ||
        (res.sections.length > 0 && res.sections.every((s) => s.locked)),
    );
    setIngesting(res.ingest_running === true);
    defaultIncludedRef.current = Object.fromEntries(
      all
        .filter((s) => s.requirement === 'optional')
        .map((s) => [s.section_code, s.recommended]),
    );
    // We just took server state wholesale — nothing local is pending any more.
    userTouchedRef.current = false;
  };

  // ── Poll while ingestion is in flight ────────────────────────────────────
  // The worker writes qr_figures progressively, so section badges flip from
  // "Preparing…" to "From <doc>" as they land. Without this the page only
  // resolves on a manual reload — which is what made a still-running report look
  // like a failed one. Stops as soon as the backend clears ingest_running.
  useEffect(() => {
    if (!ingesting || !companyId || !reportId) return;
    let cancelled = false;
    const timer = setInterval(() => {
      quarterlyReports
        .getOutline(companyId, reportId)
        .then((res) => {
          if (cancelled) return;
          // Untouched → adopt server truth wholesale; that IS the point of the poll.
          if (!userTouchedRef.current) {
            applyResponse(res);
            return;
          }
          // Touched → the server doesn't know about the user's unsaved order/ticks
          // yet (autosave is debounced 700ms), so refresh ONLY the volatile fields
          // this poll exists for. Replacing the whole list here would silently undo
          // a drag mid-ingest — harmless when the two groups were segregated,
          // glaring now that one list carries the real report order.
          const byCode = new Map(res.sections.map((s) => [s.section_code, s]));
          setSections((prev) =>
            prev.map((s) => {
              const fresh = byCode.get(s.section_code);
              return fresh
                ? { ...s, feeder: fresh.feeder, recommended: fresh.recommended }
                : s;
            }),
          );
          setIngesting(res.ingest_running === true);
        })
        .catch(() => {
          /* transient — the next tick retries; don't surface a fetch error here */
        });
    }, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ingesting, companyId, reportId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // The Table of Contents is hidden on this screen (see isTableOfContentsSection),
  // but it stays in `sections` so every autosaved payload still carries it and it
  // still reaches the assembled report. Only the rendering and the counts skip it.
  //
  // Numbers go to INCLUDED, rendered rows only, 1..N in list order — so the number
  // a row shows is its actual position in the generated report. Excluded rows get
  // null (rendered as a dash): they aren't in the report, so they have no position.
  // Drag handlers keep using the real array index, so reordering is unaffected.
  const rowNumbers: (number | null)[] = [];
  let includedCount = 0;
  let visibleTotal = 0;
  for (const s of sections) {
    if (isTableOfContentsSection(s.section_code)) {
      rowNumbers.push(null);
      continue;
    }
    visibleTotal++;
    rowNumbers.push(s.included ? ++includedCount : null);
  }

  const optionalRows = sections.filter((s) => s.requirement === 'optional');

  // ── Persist (debounced PUT) ───────────────────────────────────────────────
  // includedOnly: post-lock the SET is frozen, so a reorder must carry ONLY the
  // sections in the locked/included set. Sending excluded optionals with a fresh
  // display_order reads as "positioning a section not in the set" and the backend
  // rejects it (409). Pre-lock we send the full catalogue so tick/untick persists.
  const buildPayload = useCallback(
    (rows: OutlineSection[], includedOnly = false) => {
      const list = includedOnly ? rows.filter((s) => s.included) : rows;
      return {
        sections: list.map((s, i) => ({
          section_code: s.section_code,
          included: s.included,
          // The list IS the order — index is the section's position in the report.
          display_order: i,
        })),
      };
    },
    [],
  );

  // Handle a 409 uniformly: the outline was locked elsewhere → go read-only,
  // re-fetch, and swallow (no toast).
  const handleLocked409 = useCallback(() => {
    setIsLocked(true);
    setSaveState('idle');
    if (companyId && reportId) {
      quarterlyReports
        .getOutline(companyId, reportId)
        .then(applyResponse)
        .catch(() => {
          /* keep current state read-only */
        });
    }
  }, [companyId, reportId]);

  const scheduleSave = useCallback(
    (rows: OutlineSection[]) => {
      // Persist reorders even when locked — the SET is frozen (include toggles are
      // disabled), so any autosave here is a display_order change, which the
      // backend must accept on a locked report (no 409, no regeneration).
      if (!companyId || !reportId) return;

      // One PUT attempt. On a 409 (the report is actually locked) we retry ONCE
      // with the included-only payload — only the locked/included set, order-only —
      // which is exactly what the backend's post-lock reorder path accepts. A drag
      // never changes the section SET, so re-sending just the included set is always
      // correct. If the retry ALSO 409s, the backend isn't honoring reorder-while-
      // locked and we revert (a real backend bug, now surfaced).
      const runSave = (includedOnly: boolean, seq: number, retried: boolean) => {
        quarterlyReports
          .saveOutline(companyId, reportId, buildPayload(rows, includedOnly))
          .then(() => {
            if (seq === saveSeqRef.current) setSaveState('saved');
          })
          .catch((err: unknown) => {
            if (seq !== saveSeqRef.current) return;
            if (err instanceof ApiError && err.status === 409) {
              console.warn('[outline] PUT /outline rejected (409):', err.body);
              if (!retried) {
                // The set is locked after all → retry as an included-only reorder.
                setIsLocked(true);
                runSave(true, seq, true);
                return;
              }
              handleLocked409();
              return;
            }
            // Non-lock error: surface softly in the indicator, keep local state.
            setSaveState('idle');
          });
      };

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      saveTimerRef.current = setTimeout(() => {
        const seq = ++saveSeqRef.current;
        runSave(isLocked, seq, false);
      }, 700);
    },
    [companyId, reportId, buildPayload, handleLocked409, isLocked],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const toggleSection = (code: string) => {
    if (isLocked) return;
    userTouchedRef.current = true;
    setSections((prev) => {
      const next = prev.map((s) =>
        // Required sections can never be unticked (the checkbox is already
        // disabled; this guards the shared handler too — the backend 409s).
        s.section_code === code && s.requirement !== 'required'
          ? { ...s, included: !s.included }
          : s,
      );
      scheduleSave(next);
      return next;
    });
  };

  const applyPreset = (preset: Preset) => {
    if (isLocked) return;
    userTouchedRef.current = true;
    setSections((prev) => {
      const next = prev.map((s) => {
        if (s.requirement === 'required') return s;
        const included =
          preset === 'required'
            ? false
            : preset === 'everything'
              ? true
              : (defaultIncludedRef.current[s.section_code] ?? false);
        return { ...s, included };
      });
      scheduleSave(next);
      return next;
    });
  };

  const move = (from: number, to: number) => {
    // Reordering is allowed even when the set is locked — only the include/exclude
    // SET is frozen, not the display order.
    if (to < 0 || to >= sections.length || from === to) return;
    userTouchedRef.current = true;
    setSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      scheduleSave(next);
      return next;
    });
  };

  // Which quick-select preset the current optional set matches (for highlight).
  const activePreset: Preset | null = (() => {
    if (optionalRows.length === 0) return null;
    if (optionalRows.every((o) => o.included)) return 'everything';
    if (optionalRows.every((o) => !o.included)) return 'required';
    if (
      optionalRows.every(
        (o) => o.included === (defaultIncludedRef.current[o.section_code] ?? false),
      )
    )
      return 'recommended';
    return null;
  })();

  // ── Continue: flush save, lock, produce all sections, advance ─────────────
  // Locking freezes the outline; produceAll kicks batch section production and
  // we hand off to the shared processing loader, which polls to completion then
  // redirects to Preview (so the user never presses Produce per section).
  // NOTE: the old goProduceOrPreview() lived here. Its save/lock/produceAll sequence
  // now runs inside ProcessingPage (see ProcessingPageState.bootstrap) so the user
  // reaches the loader on click rather than after the lock completes.
  const onGenerate = async () => {
    if (!companyId || !reportId) return;
    if (isLocked) {
      // Already locked → sections were produced on the first pass. Just view them;
      // do NOT re-run produceAll (that would regenerate everything on every revisit).
      navigate(`/quarterly-report/${reportId}/preview`);
      return;
    }
    // Navigate FIRST, work second. Save + lock + produceAll take several seconds
    // (locking alone is the slow one), and awaiting them here left the user on a
    // dead, disabled button until the very end — the loader only flashed for a
    // moment before Preview. ProcessingPage now performs those three calls itself
    // from `bootstrap`, so the loader is on screen from the click onward.
    setSubmitting(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const processingState: ProcessingPageState = {
      runId: '',            // resolved by ProcessingPage once produceAll returns
      pollUrl: '',
      reportId,
      companyId,
      estimatedDurationSeconds: null,
      fileName: null,
      isExisting: false,
      reportType: 'quarterly',
      quarterlyNext: 'preview',
      bootstrap: {
        kind: 'quarterly-produce',
        outlinePayload: buildPayload(sections),
      },
    };
    navigate('/reports/processing', { state: processingState });
  };

  // ── Drag handlers — one flat list, so any row can be dropped anywhere. An
  //    optional section can be dragged above the required ones; the backend
  //    stores whatever display_order it is sent and the render path reads it, so
  //    the order here is literally the order of the generated report. ─────────
  const resetDrag = () => {
    dragIndexRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
  };
  const onDragStart = (index: number) => (e: React.DragEvent) => {
    dragIndexRef.current = index;
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (index: number) => (e: React.DragEvent) => {
    if (dragIndexRef.current === null) return;
    e.preventDefault();
    if (index !== overIndex) setOverIndex(index);
  };
  const onDrop = (index: number) => (e: React.DragEvent) => {
    if (dragIndexRef.current === null) return;
    e.preventDefault();
    move(dragIndexRef.current, index);
    resetDrag();
  };
  const onDragEnd = () => resetDrag();

  // Arrow keys step over rows that aren't rendered (the hidden Table of Contents),
  // otherwise a press swaps with an invisible row and the row appears not to move.
  // Drag needs no equivalent: an unrendered row has no drop target.
  const nextVisibleIndex = (from: number, dir: 1 | -1) => {
    let i = from + dir;
    while (
      i >= 0 &&
      i < sections.length &&
      isTableOfContentsSection(sections[i].section_code)
    ) {
      i += dir;
    }
    return i;
  };
  const onGripKeyDown = (index: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(index, nextVisibleIndex(index, -1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(index, nextVisibleIndex(index, 1));
    }
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <Shell reportId={reportId} metricsMode={metricsMode}>
        <Spinner pad={80} />
      </Shell>
    );
  }

  if (fetchError) {
    return (
      <Shell reportId={reportId} metricsMode={metricsMode}>
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
            <span style={{ fontSize: 13, color: '#DC2626' }}>{fetchError}</span>
            <button
              className="bs"
              style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => {
                setFetchError(null);
                setRetryKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (sections.length === 0) {
    return (
      <Shell reportId={reportId} metricsMode={metricsMode}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 14 }}>📄</div>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: DARK,
              margin: '0 0 8px',
            }}
          >
            No outline available yet
          </h2>
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>
            The report catalogue hasn't been prepared for this report.
          </p>
          <button
            className="btn bs"
            style={{ padding: '10px 20px' }}
            onClick={() => navigate('/reports/quarterly')}
          >
            ← Back to Reports
          </button>
        </div>
      </Shell>
    );
  }

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'required', label: 'Required only' },
    { key: 'recommended', label: 'Recommended' },
    { key: 'everything', label: 'Everything' },
  ];

  return (
    <Shell reportId={reportId} metricsMode={metricsMode}>
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
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: DARK,
              margin: '0 0 4px',
              lineHeight: 1.2,
            }}
          >
            Report outline
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: MUTED, maxWidth: 560 }}>
            Tick the sections you want, then drag any row to set the order they
            appear in the report. Required sections can be moved but not removed.
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>
            Template · {totalCatalogue}
          </div>
          <div style={{ fontSize: 13, color: ACCENT, fontWeight: 800, marginTop: 2 }}>
            {includedCount} in report
          </div>
        </div>
      </div>

      {/* Quick Select + locked banner */}
      <div
        style={{
          padding: '0 28px 14px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {isLocked ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12,
              fontWeight: 700,
              color: '#6B72A0',
              background: '#F2F3FA',
              border: '1px solid #E2E4F0',
              borderRadius: 20,
              padding: '6px 14px',
            }}
          >
            <Lock size={13} aria-hidden />
            Section set locked · drag to reorder
          </span>
        ) : ingesting ? (
          // Presets are gated too, not just the checkboxes: "Recommended" applies
          // the backend's `recommended` flags, which are derived from whatever
          // figures exist RIGHT NOW — applying them mid-ingest would tick a set
          // computed from partial data and then silently keep it.
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              fontWeight: 700,
              color: ACCENT,
              background: 'rgba(64,64,200,.07)',
              border: '1px solid rgba(64,64,200,.18)',
              borderRadius: 20,
              padding: '6px 14px',
            }}
          >
            <Spinner size={13} pad={0} />
            Still reading your documents · sections appear as data lands
          </span>
        ) : (
          <>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.5px',
                textTransform: 'uppercase',
                color: '#9BA3C4',
              }}
            >
              Quick select
            </span>
            <div className="tabs" style={{ marginBottom: 0 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`tab ${activePreset === p.key ? 'act' : ''}`}
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Scrollable body — ONE list, required and optional interleaved in the
          order they will appear in the report. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 28px 20px' }}>
        <div className="card">
          <div className="ch">
            <span className="ct">Report sections — tick to include · drag to reorder</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#9BA3C4' }}>
              {includedCount} of {visibleTotal} included
            </span>
          </div>
          <div
            className="cb"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            {sections.map((s, i) =>
              isTableOfContentsSection(s.section_code) ? null : (
                <div
                  key={s.section_code}
                  onDragOver={onDragOver(i)}
                  onDrop={onDrop(i)}
                >
                  <SectionRow
                    section={s}
                    number={rowNumbers[i]}
                    locked={isLocked}
                    ingesting={ingesting}
                    isRequired={s.requirement === 'required'}
                    dragging={dragIndex === i}
                    dragOver={overIndex === i && dragIndex !== i}
                    onToggle={() => toggleSection(s.section_code)}
                    dragHandleProps={{
                      draggable: true,
                      onDragStart: onDragStart(i),
                      onDragEnd,
                      onKeyDown: onGripKeyDown(i),
                    }}
                  />
                </div>
              ),
            )}
          </div>
        </div>
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
        <button
          className="btn bs"
          style={{ fontSize: 13, padding: '10px 18px' }}
          onClick={() => navigate(`/quarterly-report/${reportId}/extraction`)}
        >
          ← Back
        </button>

        <span
          style={{
            fontSize: 13,
            color: MUTED,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {includedCount} sections · in your order
          {saveState !== 'idle' && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: saveState === 'saved' ? GREEN : '#9BA3C4',
              }}
            >
              {saveState === 'saving' ? 'Saving…' : '✓ Saved'}
            </span>
          )}
        </span>

        {/* Locking mid-ingest would freeze a section set chosen from partial data,
            so the action is held until the worker clears. 'View report' (locked)
            is unaffected — that report's set is already committed. */}
        <button
          className="bp"
          disabled={submitting || (ingesting && !isLocked)}
          title={
            ingesting && !isLocked
              ? 'Waiting for document extraction to finish'
              : undefined
          }
          style={{
            fontSize: 14,
            padding: '10px 24px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: submitting || (ingesting && !isLocked) ? 0.6 : 1,
            cursor:
              submitting || (ingesting && !isLocked) ? 'not-allowed' : 'pointer',
          }}
          onClick={onGenerate}
        >
          {isLocked
            ? 'View report'
            : ingesting
              ? 'Preparing data…'
              : submitting
                ? 'Locking…'
                : 'Generate & Preview'}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path
              d="M8 4l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </Shell>
  );
}
