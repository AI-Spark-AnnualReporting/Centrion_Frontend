// Board report · step 1 — source documents.
//
// Slots come from the registry, not a fixed list: only the documents this
// issuer's applicable sections actually need. Files are staged across as many
// slots as the operator likes and sent as ONE batch — `files` and `slots` are
// matched positionally, and only one job may run per report, so uploading on
// pick would 409 on the second slot.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { boardReports } from '@/lib/api';
import { startedRun } from '@/lib/run-handle';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { Spinner } from '@/components/shared/Spinner';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import type { BoardSourceSlot, BoardSourcesResponse } from '@/types/board';
import BoardMeetingPicker from './BoardMeetingPicker';
import { errorMessage, readDuplicateSlots, readExistingRunId } from './board-helpers';
import { BoardStepShell, StepActions } from './board-shell';
import { useBoardReport } from './useBoardReport';
import { useFitFrame } from './useFitFrame';
import {
  ACCENT,
  AMBER,
  BORDER,
  BORDER_SOFT,
  FAINT,
  INK,
  LockedNotice,
  MONO,
  Notice,
  RED,
  SetupCard,
} from './board-ui';

const UPLOAD_MILESTONES = [
  'Uploading your documents',
  'Reading the text and tables',
  'Matching figures to line items',
  'Filing each document against its sections',
];
const BOARD_TIPS = [
  'Only the documents your issuer profile actually needs are asked for — a bank is asked for one more than a corporate.',
  'Removing a document only clears the slot; the file stays in your document bank.',
  'Sections that cannot be written without a document will say exactly which one they are waiting on.',
];

export default function BoardSourcesPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { locked, period, error: reportError } = useBoardReport(reportId);

  const [sources, setSources] = useState<BoardSourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A slot can hold several documents — one register split across two files is
  // ordinary. `slots` is positional, so the same slot name simply repeats.
  const [staged, setStaged] = useState<Record<string, File[]>>({});
  // Slots the server rejected as holding the same document.
  const [dupeSlots, setDupeSlots] = useState<string[]>([]);
  const [run, setRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [generated, setGenerated] = useState(false);
  const { frameRef, tailRef, height: frameHeight } = useFitFrame([sources, locked, generated, error]);

  const refetch = useCallback(async () => {
    setSources(await boardReports.getSources(reportId));
  }, [reportId]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    Promise.all([boardReports.getSources(reportId), boardReports.getOutline(reportId).catch(() => null)])
      .then(([src, outline]) => {
        if (cancelled) return;
        setSources(src);
        // Once the report has been written, its inputs are read-only: swapping a
        // document would leave the produced content describing something else.
        setGenerated(
          !!outline?.sections?.some((s) => s.status === 'produced' || s.status === 'locked'),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load the source documents.'));
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // Refetching on every tick is what makes extraction_status move without a
  // reload; the hook has no completion callback, so this effect does the work.
  const poll = usePipelinePoll(run?.run_id ?? null, run?.poll_url ?? null, {
    nodes: false,
    intervalMs: 1500,
  });
  useEffect(() => {
    if (!run) return;
    if (poll.state.phase === 'running' || poll.state.phase === 'idle') {
      void refetch().catch(() => {});
      return;
    }
    setRun(null);
    if (poll.state.phase === 'completed') {
      // The documents are read and this step is finished — go straight on.
      // The gate above guarantees every required document was in before the
      // run started, so there is nothing left to do here.
      setError(null);
      navigate(`/board-report/${reportId}/sections`);
      return;
    }
    void refetch().catch(() => {});
    // Always resolve the banner on a finished run — a stale error from an
    // earlier attempt makes a successful upload look like it failed.
    setError(
      poll.state.phase === 'timeout'
        ? 'Still reading your documents — refresh in a moment to see the result.'
        : (poll.state.run?.error_message ?? 'Reading the documents failed. Try again.'),
    );
  }, [
    poll.state.phase,
    poll.state.elapsedMs,
    poll.state.run?.error_message,
    run,
    refetch,
    navigate,
    reportId,
  ]);

  /** Add files to a slot, keeping whatever is already staged there. */
  const stageFiles = useCallback((slot: string, files: File[]) => {
    if (!files.length) return;
    setError(null);
    setDupeSlots([]);
    setStaged((prev) => ({ ...prev, [slot]: [...(prev[slot] ?? []), ...files] }));
  }, []);

  /** Drop one staged file, and the slot's entry with the last of them. */
  const unstageFile = useCallback((slot: string, index: number) => {
    setError(null);
    setDupeSlots([]);
    setStaged((prev) => {
      const rest = (prev[slot] ?? []).filter((_, i) => i !== index);
      const next = { ...prev };
      if (rest.length) next[slot] = rest;
      else delete next[slot];
      return next;
    });
  }, []);

  const process = useCallback(async () => {
    // One pair per file: `files` and `slots` are matched positionally, so a slot
    // holding two documents simply appears twice.
    const batch = Object.entries(staged).flatMap(([slot, files]) =>
      files.map((file) => ({ slot, file })),
    );
    if (!batch.length) return;
    setError(null);
    setDupeSlots([]);
    try {
      const handle = await boardReports.uploadSources(reportId, batch);
      const started = startedRun(handle);
      if (!started) {
        await refetch();
        return;
      }
      setRun(started);
      setStaged({});
    } catch (err: unknown) {
      // Another tab already started a job — adopt it rather than showing an
      // error the operator can't act on.
      const existing = readExistingRunId(err);
      if (existing) {
        setRun({ run_id: existing, poll_url: `/api/v1/agent_runs/${existing}` });
        return;
      }
      // The same file attached to two slots — name the rows rather than making
      // the operator re-check all of them.
      const dupes = readDuplicateSlots(err);
      if (dupes) {
        setDupeSlots(dupes.slots);
        setError(dupes.message);
        return;
      }
      setError(errorMessage(err, 'Could not process those documents.'));
    }
  }, [reportId, staged]);

  const removeDocument = useCallback(
    async (documentId: string) => {
      setError(null);
      try {
        await boardReports.deleteSourceDocument(reportId, documentId);
        await refetch();
      } catch (err: unknown) {
        setError(errorMessage(err, 'Could not remove that document.'));
      }
    },
    [reportId, refetch],
  );

  if (run) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1400, overflowY: 'auto' }}>
        <AiLoadingScreen
          title="Reading your documents"
          subtitle="Extracting the figures, tables and governance data your sections need."
          milestones={UPLOAD_MILESTONES}
          tips={BOARD_TIPS}
          indeterminate
          progressCaption="Reading and extracting — this usually takes a minute or two."
        />
      </div>
    );
  }

  const stagedCount = Object.values(staged).reduce((n, files) => n + files.length, 0);
  // Slots the server marked required — a mandatory section depends on each, so
  // producing without them yields sections that can only say what is missing.
  // A file waiting to be sent counts: the gate is "have you got it", not "has
  // the server read it yet".
  const missingRequired = (sources?.slots ?? []).filter(
    (s) => s.required && s.status !== 'received' && !s.documents.length && !staged[s.slot]?.length,
  );
  // Meetings rows are saved as they are ticked — nothing about them is staged,
  // so `status` alone settles whether one is outstanding (handled above).
  const readOnly = locked || generated;
  // Nothing moves — not processing, not continuing — while a required document
  // is outstanding. Processing a partial set is what produced half-written
  // sections that then had to be regenerated.
  const blocked = missingRequired.length > 0;

  return (
    <BoardStepShell
      step={1}
      reportId={reportId}
      locked={locked}
      period={period}
      title="Add the source documents"
      sub="Attach what you have across as many slots as you like, then process them in one go."
    >
      <SetupCard title="Source documents" sub="Only the documents this issuer's sections actually need">
        {(error || reportError) && <Notice tone="red">{error ?? reportError}</Notice>}
        {locked && <LockedNotice />}
        {generated && !locked && (
          <Notice tone="green">
            This report has been generated, so its source documents are read-only. Use{' '}
            <b>Regenerate all</b> on the Sections step to rebuild it.
          </Notice>
        )}
        {!readOnly && missingRequired.length > 0 && (
          <Notice tone="amber">
            Every required source is needed before the report can be built —{' '}
            <b>{missingRequired.map((s) => s.slot).join(', ')}</b>{' '}
            {missingRequired.length === 1 ? 'is' : 'are'} still outstanding.
          </Notice>
        )}

        {!sources ? (
          <Spinner pad={40} />
        ) : (
          // The list scrolls inside itself: its own header and the actions row
          // below stay where they are however many slots there are.
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
                Sources
                <span className="uhead-count">
                  {sources.received}/{sources.total}
                </span>
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: sources.received < sources.total ? AMBER : '#16A34A',
                }}
              >
                {sources.received < sources.total
                  ? `${sources.total - sources.received} pending`
                  : 'All received'}
              </span>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {sources.slots.map((slot) =>
                // Same row, filled a different way: a meetings slot is ticked
                // from what's already on the platform, never uploaded.
                slot.kind === 'meetings' ? (
                  <MeetingSlotRow
                    key={slot.slot}
                    reportId={reportId}
                    slot={slot}
                    // `locked`, not `readOnly`: a generated report freezes its
                    // uploaded documents because swapping one would leave the
                    // produced text describing something else. Picking meetings
                    // feeds BR35/BR36 only, and those are still needs_input at
                    // that point — freezing them here is what stranded the
                    // "Select meetings" prompt on the Review step.
                    disabled={locked}
                    onSaved={() => void refetch().catch(() => {})}
                  />
                ) : (
                  <SlotRow
                    key={slot.slot}
                    slot={slot}
                    stagedFiles={staged[slot.slot] ?? []}
                    duplicate={dupeSlots.includes(slot.slot)}
                    disabled={readOnly}
                    onStage={stageFiles}
                    onUnstage={unstageFile}
                    onRemove={removeDocument}
                  />
                ),
              )}
            </div>
          </div>
        )}

        <div ref={tailRef}>
          <StepActions
            back={() => navigate('/board-report')}
            backLabel="Board reports"
            hint={
              <span style={{ fontSize: 11.5, color: blocked ? AMBER : FAINT }}>
                {blocked
                  ? `${missingRequired.length} required source${missingRequired.length === 1 ? '' : 's'} still needed`
                  : stagedCount > 0
                    ? `${stagedCount} attached, not yet processed`
                    : 'All required sources are in.'}
              </span>
            }
          >
            <button
              className="btn bp"
              onClick={stagedCount > 0 ? process : () => navigate(`/board-report/${reportId}/sections`)}
              disabled={blocked}
              title={
                blocked ? `Still needed: ${missingRequired.map((s) => s.slot).join(', ')}` : undefined
              }
              style={{ padding: '11px 24px', fontSize: 13, fontWeight: 700 }}
            >
              {stagedCount > 0
                ? `Process ${stagedCount} document${stagedCount === 1 ? '' : 's'}`
                : 'Continue'}
            </button>
          </StepActions>
        </div>
      </SetupCard>
    </BoardStepShell>
  );
}

function SlotRow({
  slot,
  stagedFiles,
  duplicate,
  disabled,
  onStage,
  onUnstage,
  onRemove,
}: {
  slot: BoardSourceSlot;
  stagedFiles: File[];
  duplicate: boolean;
  disabled: boolean;
  onStage: (slot: string, files: File[]) => void;
  onUnstage: (slot: string, index: number) => void;
  onRemove: (documentId: string) => void;
}) {
  // Section titles, not codes — "BR04, BR19, BR30" told nobody what this
  // document is for. Three is enough to make the point; the rest are on hover.
  const feedTitles = slot.feeds.map((f) => f.title);
  const feeds = feedTitles.slice(0, 3).join(' · ');
  const moreFeeds = feedTitles.length - 3;

  return (
    <div
      style={{
        padding: '13px 18px',
        borderBottom: '1px solid #F4F5FB',
        background: duplicate ? 'rgba(229,72,77,.06)' : undefined,
        boxShadow: duplicate ? `inset 3px 0 0 ${RED}` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{slot.slot}</span>
            {slot.required && <span className="badge b-gn">Required</span>}
          </div>
          {feeds && (
            <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }} title={feedTitles.join(' · ')}>
              Feeds → {feeds}
              {moreFeeds > 0 && ` + ${moreFeeds} more`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {/* Always offered, however many are already attached — a register split
              across two files is ordinary, and the old row had no way to say so. */}
          <label
            className="btn bs bsm"
            style={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              marginBottom: 0,
              opacity: disabled ? 0.55 : 1,
            }}
          >
            {stagedFiles.length
              ? 'Add another file'
              : slot.documents.length
                ? 'Add file'
                : 'Attach file'}
            <input
              type="file"
              multiple
              disabled={disabled}
              style={{ display: 'none' }}
              onChange={(e) => {
                onStage(slot.slot, Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* Waiting to be sent — one row each, each removable on its own. */}
      {stagedFiles.length > 0 && (
        <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stagedFiles.map((f, i) => (
            <div
              key={`${f.name}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 8,
                background: 'rgba(64,64,200,.05)',
                border: `1px solid rgba(64,64,200,.2)`,
              }}
            >
              <span style={{ fontSize: 11.5, color: ACCENT, fontWeight: 700, flex: 1, minWidth: 0 }}>
                {f.name}
              </span>
              <span style={{ fontSize: 10.5, fontFamily: MONO, color: FAINT }}>not yet sent</span>
              <button className="btn bs bsm" disabled={disabled} onClick={() => onUnstage(slot.slot, i)}>
                Clear
              </button>
            </div>
          ))}
        </div>
      )}

      {slot.documents.length > 0 && (
        <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slot.documents.map((d) => (
            <div
              key={d.document_id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 8,
                background: '#FAFBFE',
                border: `1px solid ${BORDER_SOFT}`,
              }}
            >
              <span style={{ fontSize: 11.5, color: INK, fontWeight: 600, flex: 1, minWidth: 0 }}>
                {d.file_name}
              </span>
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily: MONO,
                  color: d.extraction_status === 'completed' ? '#16A34A' : AMBER,
                }}
              >
                {d.extraction_status}
              </span>
              {/* Untags the slot only — the document stays in the document bank,
                  so "replace" is remove-then-attach and nothing is destroyed. */}
              <button
                className="btn bs bsm"
                disabled={disabled}
                onClick={() => onRemove(d.document_id)}
                title="Remove from this slot — the document stays in your document bank"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A `kind: "meetings"` slot: no file input, no staging — the picker writes
// straight through and the screen refetches, so the row is either satisfied or
// it isn't the moment the operator saves.
function MeetingSlotRow({
  reportId,
  slot,
  disabled,
  onSaved,
}: {
  reportId: string;
  slot: BoardSourceSlot;
  disabled: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const feedTitles = slot.feeds.map((f) => f.title);
  const feeds = feedTitles.slice(0, 3).join(' · ');
  const moreFeeds = feedTitles.length - 3;
  const count = slot.selected_count ?? slot.selected_ids?.length ?? 0;

  return (
    <div style={{ padding: '13px 18px', borderBottom: '1px solid #F4F5FB' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: INK }}>{slot.slot}</span>
            {slot.required && <span className="badge b-gn">Required</span>}
          </div>
          {feeds && (
            <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }} title={feedTitles.join(' · ')}>
              Feeds → {feeds}
              {moreFeeds > 0 && ` + ${moreFeeds} more`}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: count > 0 ? ACCENT : AMBER,
              fontFamily: MONO,
            }}
          >
            {count} selected
          </span>
          <button className="btn bs bsm" onClick={() => setOpen((v) => !v)}>
            {open ? 'Close' : 'Select meetings'}
          </button>
        </div>
      </div>

      {open && slot.section_code && (
        <BoardMeetingPicker
          reportId={reportId}
          sectionCode={slot.section_code}
          disabled={disabled}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
