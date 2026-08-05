// Board report · step 2 — the resolved sections.
//
// GET /outline returns all 46 registry sections, including the ones that don't
// apply. They stay listed, greyed, with the server's own note — a compliance
// officer needs to see that Capital adequacy was left out *because* this issuer
// isn't a bank, not just find it missing.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { boardReports } from '@/lib/api';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { Spinner } from '@/components/shared/Spinner';
import { ApproveConfirmDialog } from '@/components/quarterly/ApproveConfirmDialog';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import type { BoardCounts, BoardOutlineSection, BoardRequirement, BoardResolution } from '@/types/board';
import {
  boardProduceSummary,
  errorMessage,
  isBoardExcluded,
  outlinePayload,
  readExistingRunId,
  touchedByHand,
} from './board-helpers';
import { BoardStepShell, StepActions } from './board-shell';
import { useBoardReport } from './useBoardReport';
import {
  ACCENT,
  AMBER,
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

const REQ_LABEL: Record<BoardRequirement, string> = { M: 'Mandatory', O: 'Optional', C: 'Conditional' };
const REQ_CLASS: Record<BoardRequirement, string> = { M: 'b-gn', O: 'b-gy', C: 'b-pp' };

// Only the exclusions get a badge. An included section is already marked by its
// ticked checkbox, and "Variant" named a server-side detail no one acts on.
const RESOLUTION_META: Partial<Record<BoardResolution, { label: string; cls: string }>> = {
  dropped: { label: 'Dropped', cls: 'b-rd' },
  na: { label: 'N/A', cls: 'b-gy' },
};

export default function BoardSectionsPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { locked, period, error: reportError } = useBoardReport(reportId);

  const [outline, setOutline] = useState<BoardOutlineSection[]>([]);
  const [counts, setCounts] = useState<BoardCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [run, setRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Producing clears each section's content hash, so it rewrites anything a
  // reviewer edited or refined. Name those sections before it happens.
  const [overwrites, setOverwrites] = useState<string[] | null>(null);

  const saveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
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

  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // Debounced PUT with a latest-wins guard. On failure, refetch: a 422 means
  // nothing was saved, so the server is the truth.
  const scheduleSave = useCallback(
    (next: BoardOutlineSection[]) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      saveTimerRef.current = window.setTimeout(() => {
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
    setOverwrites(null);
    setError(null);
    try {
      const handle = await boardReports.produceAll(reportId);
      setRun({ run_id: handle.run_id, poll_url: handle.poll_url });
    } catch (err: unknown) {
      const existing = readExistingRunId(err);
      if (existing) {
        setRun({ run_id: existing, poll_url: `/api/v1/agent_runs/${existing}` });
        return;
      }
      setError(errorMessage(err, 'Could not start generating the report.'));
    }
  }, [reportId]);

  // Ask first if producing would throw away someone's work.
  const generate = useCallback(async () => {
    const touched = touchedByHand(
      await boardReports
        .getSections(reportId)
        .then((r) => r.sections ?? [])
        .catch(() => []),
    );
    if (touched.length > 0) {
      setOverwrites(touched);
      return;
    }
    await startProduce();
  }, [reportId, startProduce]);

  const poll = usePipelinePoll(run?.run_id ?? null, run?.poll_url ?? null);
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
    if (poll.state.phase === 'completed') navigate(`/board-report/${reportId}/preview`);
  }, [poll.state.phase, poll.state.elapsedMs, poll.state.run?.error_message, run, refetch, navigate, reportId]);

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
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            <div className="uhead">
              <span className="uhead-title">
                Sections<span className="uhead-count">{counts?.included ?? outline.length}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {saveState !== 'idle' && (
                  <span
                    style={{ fontSize: 11, fontWeight: 700, color: saveState === 'saving' ? ACCENT : GREEN }}
                  >
                    {saveState === 'saving' ? 'Saving…' : 'Saved'}
                  </span>
                )}
                <button className="btn bs bsm" onClick={() => setShowExcluded((v) => !v)}>
                  {showExcluded ? 'Hide non-applicable' : 'Show non-applicable'}
                </button>
              </div>
            </div>

            {outline.map((s, i) => {
              const excluded = isBoardExcluded(s);
              if (excluded && !showExcluded) return null;
              // Mandatory sections are force-included server-side, so the box is
              // shown ticked and disabled rather than letting a click visibly
              // revert on the next fetch.
              const mandatory = s.requirement === 'M';
              const draggable = !excluded && !readOnly;

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
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '11px 18px',
                    borderBottom: '1px solid #F4F5FB',
                    borderTop: dragOver === i ? `2px solid ${ACCENT}` : '2px solid transparent',
                    opacity: excluded ? 0.55 : 1,
                    background: excluded ? '#FAFBFE' : undefined,
                    cursor: draggable ? 'grab' : 'default',
                  }}
                >
                  <div style={{ width: 18, flexShrink: 0, paddingTop: 2 }}>
                    {!excluded && (
                      <input
                        type="checkbox"
                        checked={s.included}
                        disabled={mandatory || readOnly}
                        onChange={() => toggle(s.section_code)}
                        title={mandatory ? 'Mandatory — always included' : undefined}
                        style={{
                          accentColor: ACCENT,
                          cursor: mandatory || readOnly ? 'not-allowed' : 'pointer',
                        }}
                      />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: INK,
                        textDecoration: excluded ? 'line-through' : undefined,
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}
                    >
                      <span className={`badge ${REQ_CLASS[s.requirement]}`} title={REQ_LABEL[s.requirement]}>
                        {s.requirement}
                      </span>
                      {s.data_source && <span className="badge b-tl">{s.data_source}</span>}
                      {s.provenance === 'carried_forward' && (
                        <span className="badge b-am">Carried forward</span>
                      )}
                    </div>
                    {/* The server's own explanation of what changed or fell away. */}
                    {s.note && (
                      <div style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic', marginTop: 5 }}>
                        → {s.note}
                      </div>
                    )}
                  </div>
                  {/* Only the exclusions are labelled. "In"/"Variant" restated
                      what the checkbox already says. */}
                  {RESOLUTION_META[s.resolution] && (
                    <span
                      className={`badge ${RESOLUTION_META[s.resolution].cls}`}
                      style={{ flexShrink: 0, marginTop: 2 }}
                    >
                      {RESOLUTION_META[s.resolution].label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {overwrites && (
          <OverwriteDialog
            titles={overwrites}
            onCancel={() => setOverwrites(null)}
            onConfirm={startProduce}
          />
        )}

        <StepActions
          back={() => navigate(`/board-report/${reportId}/sources`)}
          backLabel="Sources"
          hint={
            counts && (
              <span style={{ fontSize: 11.5, color: FAINT }}>
                {counts.included} sections · {counts.mandatory} mandatory · {counts.dropped} dropped ·{' '}
                {counts.na} N/A
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
            onClick={
              anyProduced ? () => navigate(`/board-report/${reportId}/preview`) : generate
            }
            disabled={locked && !anyProduced}
            style={{
              padding: '11px 24px',
              fontSize: 13,
              fontWeight: 700,
              opacity: locked && !anyProduced ? 0.55 : 1,
            }}
          >
            {anyProduced ? 'Review sections →' : 'Generate report'}
          </button>
        </StepActions>
      </SetupCard>
    </BoardStepShell>
  );
}

// Producing rewrites every included section, so anything a reviewer edited by
// hand or refined is replaced. Say which ones, by name, before it happens.
function OverwriteDialog({
  titles,
  onConfirm,
  onCancel,
}: {
  titles: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ApproveConfirmDialog
      title={`Replace ${titles.length} edited section${titles.length === 1 ? '' : 's'}?`}
      confirmLabel="Produce anyway"
      onConfirm={onConfirm}
      onClose={onCancel}
    >
      <div
        style={{
          marginTop: 14,
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(245,158,11,.08)',
          border: '1px solid rgba(245,158,11,.3)',
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: AMBER, marginBottom: 6 }}>
          These were edited by hand or refined — producing again writes over them:
        </div>
        <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>{titles.join(' · ')}</div>
      </div>
    </ApproveConfirmDialog>
  );
}
