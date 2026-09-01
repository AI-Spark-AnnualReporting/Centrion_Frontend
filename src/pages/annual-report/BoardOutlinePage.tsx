// Board report · step 3 — how each section will be structured.
//
// The server reads the paragraphs from the user's own documents that were matched
// to each prose section and proposes the subheadings that section will be broken
// into. The reviewer renames, deletes and reorders them; what they approve is what
// prints.
//
// Three rules are enforced server-side and shape this whole screen:
//   · headings cannot be ADDED — there is no "+ Add" control, and a heading whose
//     id the server did not propose is a 422 ("subheadings cannot be added")
//   · the proposal is made ONCE per report — there is no "regenerate suggestions"
//   · approval freezes it — `editable: false`, and every PUT is then a 409
//
// Generating the report lives here too: it is the last thing decided before the
// prose is written, and it must run against subheadings the server has actually
// received — hence the flush before it fires.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { boardReports } from '@/lib/api';
import { startedRun } from '@/lib/run-handle';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { ApproveConfirmDialog } from '@/components/quarterly/ApproveConfirmDialog';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import type { BoardSubheadingSection, BoardSubheadingsResponse } from '@/types/board';
import {
  boardProduceSummary,
  boardSheetWarning,
  errorMessage,
  isSubheadingSectionHidden,
  readExistingRunId,
  reorderSubheadings,
  subheadingReasonBadge,
  subheadingsPayload,
} from './board-helpers';
import { BoardStepShell, StepActions } from './board-shell';
import { useBoardReport } from './useBoardReport';
import { useFitFrame } from './useFitFrame';
import {
  ACCENT,
  BORDER,
  FAINT,
  GREEN,
  INK,
  LockedNotice,
  MUTED,
  Notice,
  SetupCard,
} from './board-ui';

const PRODUCE_MILESTONES = [
  'Reading your source documents',
  'Drafting the narrative sections',
  'Building the financial statements',
  'Assembling governance tables',
  'Finishing the report',
];
const BOARD_TIPS = [
  'Sections that do not apply to your issuer stay listed and greyed, so you can see what was left out and why.',
  'Anything carried forward from last year is flagged until you confirm it is still accurate.',
  'You can edit any section by hand afterwards — your edit wins over anything regenerated later.',
];

// Six-dot drag handle, same as the Sections list's grip icon.
const GRIP = (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="none">
    <circle cx="2.5" cy="2.5" r="1.3" fill="currentColor" />
    <circle cx="7.5" cy="2.5" r="1.3" fill="currentColor" />
    <circle cx="2.5" cy="8" r="1.3" fill="currentColor" />
    <circle cx="7.5" cy="8" r="1.3" fill="currentColor" />
    <circle cx="2.5" cy="13.5" r="1.3" fill="currentColor" />
    <circle cx="7.5" cy="13.5" r="1.3" fill="currentColor" />
  </svg>
);

type DragRef = { sectionCode: string; index: number };

export default function BoardOutlinePage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { locked, period, error: reportError } = useBoardReport(reportId);

  const [data, setData] = useState<BoardSubheadingsResponse | null>(null);
  const [sections, setSections] = useState<BoardSubheadingSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [run, setRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [dragOver, setDragOver] = useState<DragRef | null>(null);
  // Both read off other endpoints and both non-blocking: the subheadings are the
  // point of the screen, these only shape the Generate button beside them.
  const [anyProduced, setAnyProduced] = useState(false);
  const [missingRequired, setMissingRequired] = useState<string[]>([]);

  const { frameRef, tailRef, height: frameHeight } = useFitFrame([
    loading,
    sections.length,
    locked,
    error,
  ]);

  const saveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
  // What the pending debounce is holding, so leaving the step — or generating —
  // can flush it rather than drop it.
  const pendingRef = useRef<BoardSubheadingSection[] | null>(null);
  // Which sections have unsaved edits. The endpoint replaces only the sections
  // named in the body, so sending the untouched 45 back would be a needless
  // rewrite of everything.
  const changedRef = useRef<Set<string>>(new Set());
  const dragFromRef = useRef<DragRef | null>(null);

  // The first call runs the paragraph→section routing and one proposal call:
  // 15-30s. Later calls are a plain read, which is why the loader is gated on
  // there being no response yet rather than on `loading`.
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setLoading(true);
    boardReports
      .getSubheadings(reportId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setSections(res.sections ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not work out the section structure.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Has anything been produced already, and are the required documents in. Both
  // failures are swallowed: neither should be able to blank this screen.
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    void boardReports
      .getOutline(reportId)
      .then((res) => {
        if (!cancelled) {
          setAnyProduced(
            (res.sections ?? []).some((s) => s.status === 'produced' || s.status === 'locked'),
          );
        }
      })
      .catch(() => {});
    void boardReports
      .getSources(reportId)
      .then((res) => {
        if (cancelled) return;
        setMissingRequired(
          (res.slots ?? [])
            .filter((s) => s.required && s.status !== 'received' && !s.documents.length)
            .map((s) => s.slot),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Send whatever the debounce is holding, now. Returns a promise so Generate can
  // wait on it — producing against subheadings the server never received would
  // write a whole report under the wrong headings.
  const flushSave = useCallback(async () => {
    if (!saveTimerRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const pending = pendingRef.current;
    const changed = [...changedRef.current];
    pendingRef.current = null;
    changedRef.current = new Set();
    if (!pending || changed.length === 0) return;
    try {
      await boardReports.saveSubheadings(reportId, subheadingsPayload(pending, changed));
      setSaveState('saved');
    } catch {
      setSaveState('idle');
    }
  }, [reportId]);

  // Flush on the way out, don't cancel. Clicking the stepper inside the debounce
  // would otherwise throw the pending PUT away and the edit would be silently
  // lost — the same bug the Sections list's flush comment records.
  useEffect(
    () => () => {
      if (!saveTimerRef.current) return;
      window.clearTimeout(saveTimerRef.current);
      const pending = pendingRef.current;
      const changed = [...changedRef.current];
      if (pending && changed.length) {
        void boardReports
          .saveSubheadings(reportId, subheadingsPayload(pending, changed))
          .catch(() => {});
      }
    },
    [reportId],
  );

  // Debounced PUT with a latest-wins guard. On failure, refetch: a 422 means
  // nothing was saved, so the server is the truth.
  const scheduleSave = useCallback(
    (next: BoardSubheadingSection[], sectionCode: string) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      pendingRef.current = next;
      changedRef.current.add(sectionCode);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        pendingRef.current = null;
        const changed = [...changedRef.current];
        changedRef.current = new Set();
        const seq = ++saveSeqRef.current;
        boardReports
          .saveSubheadings(reportId, subheadingsPayload(next, changed))
          .then(() => {
            if (seq === saveSeqRef.current) setSaveState('saved');
          })
          .catch(() => {
            if (seq !== saveSeqRef.current) return;
            setSaveState('idle');
            void boardReports
              .getSubheadings(reportId)
              .then((res) => {
                setData(res);
                setSections(res.sections ?? []);
              })
              .catch(() => {});
          });
      }, 700);
    },
    [reportId],
  );

  // Rename. The id rides along untouched — it is the only thing that tells the
  // server this is a rename and not an addition, and additions are rejected.
  const rename = useCallback(
    (sectionCode: string, id: number, heading: string) => {
      setSections((prev) => {
        const next = prev.map((s) =>
          s.section_code === sectionCode
            ? { ...s, subheadings: s.subheadings.map((h) => (h.id === id ? { ...h, heading } : h)) }
            : s,
        );
        scheduleSave(next, sectionCode);
        return next;
      });
    },
    [scheduleSave],
  );

  // Delete is expressed by omission — the id simply stops being in the array.
  const remove = useCallback(
    (sectionCode: string, id: number) => {
      setSections((prev) => {
        const next = prev.map((s) =>
          s.section_code === sectionCode
            ? { ...s, subheadings: s.subheadings.filter((h) => h.id !== id) }
            : s,
        );
        scheduleSave(next, sectionCode);
        return next;
      });
    },
    [scheduleSave],
  );

  const moveHeading = useCallback(
    (from: DragRef, to: DragRef) => {
      // Refused rather than fudged — the API cannot express a cross-section move,
      // so the heading would vanish from both.
      if (from.sectionCode !== to.sectionCode) return;
      setSections((prev) => {
        const next = reorderSubheadings(prev, from, to);
        if (next !== prev) scheduleSave(next, from.sectionCode);
        return next;
      });
    },
    [scheduleSave],
  );

  const startProduce = useCallback(async () => {
    setError(null);
    // Everything the user just typed must be on the server before the report is
    // written from it.
    await flushSave();
    try {
      const handle = await boardReports.produceAll(reportId);
      // A handle with nothing to poll would put the full-screen loader over a job
      // that does not exist. No board endpoint returns one today; the shape allows
      // it, and the earnings flow has already proved what that costs.
      const started = startedRun(handle);
      if (!started) return;
      setRun(started);
    } catch (err: unknown) {
      const existing = readExistingRunId(err);
      if (existing) {
        setRun({ run_id: existing, poll_url: `/api/v1/agent_runs/${existing}` });
        return;
      }
      setError(errorMessage(err, 'Could not start generating the report.'));
    }
  }, [reportId, flushSave]);

  // Confirm before a full regenerate — it is minutes of work, not because it is
  // destructive: the server preserves edited and refined sections itself.
  const generate = useCallback(() => {
    if (anyProduced) {
      setConfirmRegenerate(true);
      return;
    }
    void startProduce();
  }, [anyProduced, startProduce]);

  const poll = usePipelinePoll(run?.run_id ?? null, run?.poll_url ?? null, { nodes: false });
  useEffect(() => {
    if (!run) return;
    if (poll.state.phase === 'running' || poll.state.phase === 'idle') return;
    setRun(null);
    setError(
      poll.state.phase === 'completed'
        ? null
        : poll.state.phase === 'timeout'
          ? 'Still generating — refresh in a moment to see the result.'
          : (poll.state.run?.error_message ?? 'Generation failed. Try again.'),
    );
    if (poll.state.phase === 'completed') {
      // The run's warning has to travel with the navigation — this screen is gone
      // the moment it lands, and the warning belongs where the sections are read.
      navigate(`/board-report/${reportId}/preview`, {
        state: { sheetWarning: boardSheetWarning(poll.state.run) },
      });
    }
  }, [poll.state.phase, poll.state.elapsedMs, poll.state.run, run, navigate, reportId]);

  // Hidden, not greyed — the Sections screen hides the same rows, and listing
  // more sections here than on the step before is its own kind of confusing.
  const visible = useMemo(() => sections.filter((s) => !isSubheadingSectionHidden(s)), [sections]);
  const editableCount = data?.counts?.editable ?? visible.filter((s) => s.editable).length;
  const readOnly = locked || data?.editable === false;

  if (run) {
    const s = boardProduceSummary(poll.state.run);
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1400, overflowY: 'auto' }}>
        <AiLoadingScreen
          title="Writing your board report"
          subtitle="Each section is drafted from the documents you provided."
          milestones={PRODUCE_MILESTONES}
          tips={BOARD_TIPS}
          indeterminate={!s}
          controlledProgress={s && s.total > 0 ? Math.round((s.produced / s.total) * 100) : undefined}
          progressCaption={
            s
              ? `${s.produced} of ${s.total} sections${s.skipped ? ` · ${s.skipped} skipped (no producer yet)` : ''}${s.failed ? ` · ${s.failed} failed` : ''}`
              : 'Starting…'
          }
        />
      </div>
    );
  }

  // First load only. A bare spinner for 25 seconds reads as a hang.
  if (loading && !data) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1400, overflowY: 'auto' }}>
        <AiLoadingScreen
          title="Working out how your sections should be structured"
          subtitle="Reading the documents you uploaded to suggest subheadings for each section."
          milestones={[
            'Matching your documents to sections',
            'Reading the passages filed under each one',
            'Suggesting subheadings',
          ]}
          tips={[
            'You can rename or remove any suggestion — what you approve is what prints in the report.',
            'Sections that hold a table or a fixed statement layout are listed but have no subheadings.',
          ]}
          indeterminate
        />
      </div>
    );
  }

  return (
    <BoardStepShell
      step={3}
      reportId={reportId}
      locked={locked}
      period={period}
      title="How each section will be structured"
      sub="Suggested from your own documents. Rename or remove any of them — what you approve is what prints."
    >
      <SetupCard
        title="Section outline"
        sub="Rename, remove or reorder the subheadings — changes save as you go"
      >
        {(error || reportError) && <Notice tone="red">{error ?? reportError}</Notice>}
        {readOnly && <LockedNotice />}
        {/* There is no re-propose, by design — so this states the fact and offers
            nothing, rather than dangling a button that cannot exist. */}
        {data?.stale && !readOnly && (
          <Notice tone="amber">
            These suggestions were made before your most recent upload. You can still rename or
            remove them.
          </Notice>
        )}
        {anyProduced && !locked && (
          <Notice tone="green">
            This report has been generated. <b>Regenerate all</b> rebuilds it from your documents
            using the structure below.
          </Notice>
        )}
        {!readOnly && !anyProduced && missingRequired.length > 0 && (
          <Notice tone="amber">
            You can structure the sections now, but the report can't be generated until every
            required document is in — <b>{missingRequired.join(', ')}</b>{' '}
            {missingRequired.length === 1 ? 'is' : 'are'} still outstanding.{' '}
            <LinkButton onClick={() => navigate(`/board-report/${reportId}/sources`)}>
              Add documents
            </LinkButton>
          </Notice>
        )}

        <div
          ref={frameRef}
          style={{
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            overflow: 'hidden',
            height: frameHeight ?? undefined,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="uhead" style={{ flexShrink: 0 }}>
            <span className="uhead-title">
              Sections
              {/* Counted off the rows actually on screen, so the chip can't drift
                  from the list the way a server count including the hidden
                  not-applicable rows would. */}
              <span className="uhead-count">{visible.length}</span>
            </span>
            {saveState !== 'idle' && (
              <span
                style={{ fontSize: 11, fontWeight: 700, color: saveState === 'saving' ? ACCENT : GREEN }}
              >
                {saveState === 'saving' ? 'Saving…' : 'Saved'}
              </span>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {visible.map((s, i) => (
              <SectionRow
                key={s.section_code}
                section={s}
                index={i}
                readOnly={readOnly}
                dragOver={dragOver}
                onRename={rename}
                onRemove={remove}
                onDragStart={(ref) => (dragFromRef.current = ref)}
                onDragOver={setDragOver}
                onDrop={(to) => {
                  const from = dragFromRef.current;
                  dragFromRef.current = null;
                  setDragOver(null);
                  if (from) moveHeading(from, to);
                }}
                onAddDocuments={() => navigate(`/board-report/${reportId}/sources`)}
              />
            ))}
          </div>
        </div>

        {confirmRegenerate && (
          <RegenerateDialog
            onCancel={() => setConfirmRegenerate(false)}
            onConfirm={() => {
              setConfirmRegenerate(false);
              void startProduce();
            }}
          />
        )}

        <div ref={tailRef}>
          <StepActions
            back={() => navigate(`/board-report/${reportId}/sections`)}
            backLabel="Sections"
            hint={
              <span style={{ fontSize: 11.5, color: FAINT }}>
                {editableCount} of {visible.length} sections can be structured
              </span>
            }
          >
            {anyProduced && !locked && (
              <button
                className="btn bs"
                onClick={generate}
                disabled={missingRequired.length > 0}
                title="Re-run every section from your source documents"
                style={{ padding: '10px 18px', fontSize: 13 }}
              >
                Regenerate all
              </button>
            )}
            <button
              className="btn bp"
              onClick={anyProduced ? () => navigate(`/board-report/${reportId}/preview`) : generate}
              disabled={(locked && !anyProduced) || (!anyProduced && missingRequired.length > 0)}
              title={
                !anyProduced && missingRequired.length > 0
                  ? `Still needed: ${missingRequired.join(', ')}`
                  : undefined
              }
              style={{ padding: '11px 24px', fontSize: 13, fontWeight: 700 }}
            >
              {anyProduced ? 'Review sections →' : 'Generate report'}
            </button>
          </StepActions>
        </div>
      </SetupCard>
    </BoardStepShell>
  );
}

/** A text button that reads as a link inside a Notice. */
function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        fontWeight: 700,
        textDecoration: 'underline',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function SectionRow({
  section: s,
  index,
  readOnly,
  dragOver,
  onRename,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  onAddDocuments,
}: {
  section: BoardSubheadingSection;
  index: number;
  readOnly: boolean;
  dragOver: DragRef | null;
  onRename: (sectionCode: string, id: number, heading: string) => void;
  onRemove: (sectionCode: string, id: number) => void;
  onDragStart: (ref: DragRef) => void;
  onDragOver: (ref: DragRef | null) => void;
  onDrop: (ref: DragRef) => void;
  onAddDocuments: () => void;
}) {
  const badge = subheadingReasonBadge(s.reason_code);
  const draggable = s.editable && !readOnly;

  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #F4F5FB', opacity: s.editable ? 1 : 0.62 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span
          style={{ width: 18, flexShrink: 0, fontSize: 11.5, color: FAINT, fontWeight: 600, textAlign: 'right' }}
        >
          {index + 1}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: s.editable ? INK : MUTED }}>
            {s.title}
          </div>
          {/* Written for display by the server — printed as-is. */}
          {!s.editable && s.reason && (
            <div style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic', marginTop: 4 }}>
              {s.reason}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {badge && (
            <span className="badge b-gy" style={{ letterSpacing: '.4px' }}>
              {badge}
            </span>
          )}
          {s.category && <span style={{ fontSize: 11, color: FAINT }}>{s.category}</span>}
        </div>
      </div>

      {s.editable && (
        <div style={{ marginLeft: 30, marginTop: 8 }}>
          {s.subheadings.length === 0 ? (
            // An empty box would read as "type one here" — which is the one thing
            // this screen cannot do. Say what happened, and point at the fix.
            <div style={{ fontSize: 11.5, color: FAINT }}>
              Nothing from your documents was matched to this section yet.{' '}
              {!readOnly && <LinkButton onClick={onAddDocuments}>Add documents</LinkButton>}
            </div>
          ) : (
            s.subheadings.map((h, hi) => {
              const over =
                dragOver?.sectionCode === s.section_code && dragOver.index === hi;
              return (
                <div
                  key={h.id}
                  draggable={draggable}
                  onDragStart={() => draggable && onDragStart({ sectionCode: s.section_code, index: hi })}
                  onDragOver={(e) => {
                    if (!draggable) return;
                    e.preventDefault();
                    onDragOver({ sectionCode: s.section_code, index: hi });
                  }}
                  onDragLeave={() => onDragOver(null)}
                  onDrop={(e) => {
                    if (!draggable) return;
                    e.preventDefault();
                    onDrop({ sectionCode: s.section_code, index: hi });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '3px 0',
                    borderTop: over ? `2px solid ${ACCENT}` : '2px solid transparent',
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      display: 'flex',
                      color: draggable ? FAINT : 'transparent',
                      cursor: draggable ? 'grab' : 'default',
                    }}
                  >
                    {GRIP}
                  </span>
                  {/* Borderless until focused — it reads as the heading it is,
                      not as a form field. */}
                  <input
                    value={h.heading}
                    disabled={readOnly}
                    onChange={(e) => onRename(s.section_code, h.id, e.target.value)}
                    aria-label={`Subheading of ${s.title}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'inherit',
                      fontSize: 12,
                      color: INK,
                      background: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 6,
                      padding: '5px 8px',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = BORDER;
                      e.currentTarget.style.background = '#fff';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'transparent';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onRemove(s.section_code, h.id)}
                      aria-label={`Remove ${h.heading}`}
                      title="Remove this subheading"
                      style={{
                        flexShrink: 0,
                        background: 'none',
                        border: 'none',
                        padding: '2px 6px',
                        fontSize: 13,
                        lineHeight: 1,
                        color: FAINT,
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// A regenerate rewrites every included section and takes minutes, so it asks
// first — but it is not destructive: the server skips anything a reviewer edited
// or refined, and returns those codes as `skipped_edited`.
function RegenerateDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <ApproveConfirmDialog
      title="Regenerate every section?"
      confirmLabel="Regenerate"
      onConfirm={onConfirm}
      onClose={onCancel}
    >
      <div
        style={{
          marginTop: 14,
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(34,197,94,.08)',
          border: '1px solid rgba(34,197,94,.25)',
          fontSize: 11.5,
          color: MUTED,
          lineHeight: 1.6,
        }}
      >
        <b style={{ color: '#16803C' }}>Your own work is kept.</b> Sections you edited by hand or
        refined with AI are left exactly as they are — only the rest are rewritten.
      </div>
    </ApproveConfirmDialog>
  );
}
