// Board report · step 2 — the resolved sections.
//
// GET /outline returns all 46 registry sections, including the ones that don't
// apply. They stay listed, greyed, with the server's own note — a compliance
// officer needs to see that Capital adequacy was left out *because* this issuer
// isn't a bank, not just find it missing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { boardReports } from '@/lib/api';
import { startedRun } from '@/lib/run-handle';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { Spinner } from '@/components/shared/Spinner';
import { ApproveConfirmDialog } from '@/components/quarterly/ApproveConfirmDialog';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import type { BoardCounts, BoardOutlineSection } from '@/types/board';
import {
  boardProduceSummary,
  boardSheetWarning,
  errorMessage,
  isBoardExcluded,
  outlinePayload,
  readExistingRunId,
  REQ_TEXT,
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

// Six-dot drag handle, same as the quarterly section list's grip icon.
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

export default function BoardSectionsPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { locked, period, error: reportError } = useBoardReport(reportId);

  const [outline, setOutline] = useState<BoardOutlineSection[]>([]);
  const [counts, setCounts] = useState<BoardCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [run, setRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const { frameRef, tailRef, height: frameHeight } = useFitFrame([
    loading,
    outline.length,
    locked,
    error,
  ]);

  const saveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
  // What the pending debounce is holding, so leaving the step can flush it.
  const pendingRef = useRef<BoardOutlineSection[] | null>(null);
  const dragIndexRef = useRef<number | null>(null);

  const refetch = useCallback(async () => {
    const res = await boardReports.getOutline(reportId);
    setOutline(res.sections ?? []);
    setCounts(res.counts);
  }, [reportId]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setLoading(true);
    refetch()
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load the section list.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, refetch]);

  // Flush on the way out, don't cancel. Clicking "Review sections" (or the
  // stepper) inside the 700ms debounce used to throw the pending PUT away, so a
  // drag-reorder looked applied here and was never sent — every later step then
  // showed the old order, because the server had never heard about the new one.
  useEffect(
    () => () => {
      if (!saveTimerRef.current) return;
      window.clearTimeout(saveTimerRef.current);
      const pending = pendingRef.current;
      if (pending) void boardReports.saveOutline(reportId, outlinePayload(pending)).catch(() => {});
    },
    [reportId],
  );

  // Debounced PUT with a latest-wins guard. On failure, refetch: a 422 means
  // nothing was saved, so the server is the truth.
  const scheduleSave = useCallback(
    (next: BoardOutlineSection[]) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      pendingRef.current = next;
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        pendingRef.current = null;
        const seq = ++saveSeqRef.current;
        boardReports
          .saveOutline(reportId, outlinePayload(next))
          .then(() => {
            if (seq === saveSeqRef.current) setSaveState('saved');
          })
          .catch(() => {
            if (seq !== saveSeqRef.current) return;
            setSaveState('idle');
            void refetch().catch(() => {});
          });
      }, 700);
    },
    [reportId, refetch],
  );

  const toggle = useCallback(
    (code: string) => {
      setOutline((prev) => {
        const next = prev.map((s) => (s.section_code === code ? { ...s, included: !s.included } : s));
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const reorder = useCallback(
    (from: number, to: number) => {
      setOutline((prev) => {
        if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
        const next = prev.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const startProduce = useCallback(async () => {
    setError(null);
    try {
      const handle = await boardReports.produceAll(reportId);
      // A handle with nothing to poll would put this page's full-screen loader
      // over a job that does not exist. No board endpoint returns one today; the
      // shape allows it, and the earnings flow has already proved what that costs.
      const started = startedRun(handle);
      if (!started) {
        await refetch();
        return;
      }
      setRun(started);
    } catch (err: unknown) {
      const existing = readExistingRunId(err);
      if (existing) {
        setRun({ run_id: existing, poll_url: `/api/v1/agent_runs/${existing}` });
        return;
      }
      setError(errorMessage(err, 'Could not start generating the report.'));
    }
  }, [reportId]);

  // Confirm before a full regenerate — it is minutes of work, not because it
  // is destructive: the server preserves edited and refined sections itself.
  const generate = useCallback(() => setConfirmRegenerate(true), []);

  // Progress here comes from the run's own `output_summary`, not from node rows.
  // Cadence stays at the default — a produce-all runs for minutes, so a shorter
  // one would only add requests.
  const poll = usePipelinePoll(run?.run_id ?? null, run?.poll_url ?? null, { nodes: false });
  useEffect(() => {
    if (!run) return;
    // Per-section status moves live as the run works through them.
    void refetch().catch(() => {});
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
      // The run's warning has to travel with the navigation — this screen is
      // gone the moment it lands, and the warning belongs where the sections
      // are read anyway.
      navigate(`/board-report/${reportId}/preview`, {
        state: { sheetWarning: boardSheetWarning(poll.state.run) },
      });
    }
  }, [poll.state.phase, poll.state.elapsedMs, poll.state.run, run, refetch, navigate, reportId]);

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

  const anyProduced = outline.some((s) => s.status === 'produced' || s.status === 'locked');
  const readOnly = locked || anyProduced;

  return (
    <BoardStepShell
      step={2}
      reportId={reportId}
      locked={locked}
      period={period}
      title="What's in, what dropped, what changed"
      sub="The registry resolved against your issuer profile. Sections that do not apply stay listed, greyed, with the reason."
    >
      <SetupCard title="Resolved sections" sub="Tick what to include, drag to reorder — changes save as you go">
        {(error || reportError) && <Notice tone="red">{error ?? reportError}</Notice>}
        {locked && <LockedNotice />}
        {anyProduced && !locked && (
          <Notice tone="green">
            This report has been generated, so the section list is read-only. <b>Regenerate all</b>{' '}
            rebuilds it from your documents.
          </Notice>
        )}

        {loading ? (
          <Spinner pad={40} />
        ) : (
          // The list scrolls inside itself; its header and the actions row below
          // stay put.
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
                <span className="uhead-count">
                  {counts?.included ?? outline.filter((s) => !isBoardExcluded(s)).length}
                </span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {saveState !== 'idle' && (
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color: saveState === 'saving' ? ACCENT : GREEN }}
                  >
                    {saveState === 'saving' ? 'Saving…' : 'Saved'}
                  </span>
                )}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {/* Mapped over the full outline, not a filtered copy — `i` is the
                index reorder() saves against. */}
            {outline.map((s, i) => {
              // Sections this issuer can't have are not shown at all. They are
              // not choices, and the server drops them from the report anyway.
              if (isBoardExcluded(s)) return null;
              // Mandatory sections are force-included server-side, so the box is
              // shown ticked and disabled rather than letting a click visibly
              // revert on the next fetch.
              const mandatory = s.requirement === 'M';
              const draggable = !readOnly;

              const locked = mandatory || readOnly;

              return (
                <div
                  key={s.section_code}
                  draggable={draggable}
                  onDragStart={() => draggable && (dragIndexRef.current = i)}
                  onDragOver={(e) => {
                    if (!draggable) return;
                    e.preventDefault();
                    setDragOver(i);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    if (!draggable) return;
                    e.preventDefault();
                    const from = dragIndexRef.current;
                    dragIndexRef.current = null;
                    setDragOver(null);
                    if (from != null) reorder(from, i);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid #F4F5FB',
                    borderTop: dragOver === i ? `2px solid ${ACCENT}` : '2px solid transparent',
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
                  <span style={{ width: 18, flexShrink: 0, fontSize: 11.5, color: FAINT, fontWeight: 600, textAlign: 'right' }}>
                    {i + 1}
                  </span>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={s.included}
                    disabled={mandatory || readOnly}
                    onClick={() => toggle(s.section_code)}
                    title={mandatory ? 'Mandatory — always included' : undefined}
                    style={{
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                      padding: 0,
                      borderRadius: 5,
                      border: s.included ? 'none' : `1.5px solid ${BORDER}`,
                      background: s.included ? ACCENT : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: mandatory || readOnly ? 'not-allowed' : 'pointer',
                      opacity: mandatory || readOnly ? 0.55 : 1,
                    }}
                  >
                    {s.included && (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{s.title}</div>
                    {s.category && <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{s.category}</div>}
                    {/* The server's own explanation of what changed or fell away. */}
                    {s.note && (
                      <div style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic', marginTop: 5 }}>
                        → {s.note}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {s.provenance === 'carried_forward' && <span className="badge b-am">Carried forward</span>}
                    {s.status === 'needs_input' && <span className="badge b-rd">Needs input</span>}
                    <span className="badge b-gy" style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>
                      {REQ_TEXT[s.requirement]}
                    </span>
                    {locked && (
                      <span className="badge b-gy" style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>
                        Locked
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        )}

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
            back={() => navigate(`/board-report/${reportId}/sources`)}
            backLabel="Sources"
            hint={
              counts && (
                <span style={{ fontSize: 11.5, color: FAINT }}>
                  {counts.included} sections · {counts.mandatory} mandatory
                </span>
              )
            }
          >
            {/* Once generated, Continue means "go read it" — regenerating is a
                separate, explicit choice, not what stepping back and forward does. */}
            {anyProduced && !locked && (
              <button
                className="btn bs"
                onClick={generate}
                title="Re-run every section from your source documents"
                style={{ padding: '10px 18px', fontSize: 13 }}
              >
                Regenerate all
              </button>
            )}
            <button
              className="btn bp"
              onClick={anyProduced ? () => navigate(`/board-report/${reportId}/preview`) : generate}
              disabled={locked && !anyProduced}
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

// A regenerate rewrites every included section and takes minutes, so it asks
// first — but it is not destructive: the server skips anything a reviewer
// edited or refined, and returns those codes as `skipped_edited`.
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
