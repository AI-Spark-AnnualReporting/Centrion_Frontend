// Board report · step 3 — the editing workspace.
//
// Every section is reviewed here, one at a time: read it, edit it, refine it,
// confirm a carried-forward one, or supply what a needs_input one is waiting on.
// The Report step that follows is the finished document — read-only, for export
// and approval.
//
// Narrative content now comes out of the source document verbatim rather than
// being AI-written, so this screen is where a reviewer turns extracted text into
// prose. That's what Refine is for.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError, boardReports } from '@/lib/api';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { Spinner } from '@/components/shared/Spinner';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import type { BoardOutlineSection, BoardSection } from '@/types/board';
import {
  BOARD_COMPANY_VOICE,
  canRefineSection,
  errorMessage,
  isBoardCoverSection,
  isBoardExcluded,
  readExistingRunId,
  REQ_TEXT,
  toBoardProduced,
} from './board-helpers';
import { BoardStepShell, StepActions } from './board-shell';
import { useBoardReport } from './useBoardReport';
import { useFitFrame } from './useFitFrame';
import { BoardRefinePanel } from './BoardRefinePanel';
import {
  ACCENT,
  AMBER,
  BORDER_SOFT,
  FAINT,
  GREEN,
  INK,
  LockedNotice,
  MONO,
  MUTED,
  Notice,
  RED,
} from './board-ui';

// Same palette and pill shapes as the quarterly Preview, so the two review
// screens read as one product.
const ACCENT_LIGHT = 'rgba(64,64,200,.07)';
const ACCENT_RING = 'rgba(64,64,200,.35)';
const GREEN_LIGHT = '#D1FAE5';
const AMBER_LIGHT = '#FEF3C7';

const pad2 = (n: number) => String(n).padStart(2, '0');

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Not produced', color: '#9BA3C4', bg: '#F2F3FA' },
  drafting: { label: 'Composing…', color: ACCENT, bg: '#EEEEFF' },
  produced: { label: 'Produced', color: GREEN, bg: GREEN_LIGHT },
  needs_input: { label: 'Needs input', color: AMBER, bg: AMBER_LIGHT },
  empty: { label: 'No data', color: '#9BA3C4', bg: '#F2F3FA' },
  locked: { label: 'Locked', color: GREEN, bg: GREEN_LIGHT },
};

export default function BoardPreviewPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { locked, period, error: reportError } = useBoardReport(reportId);

  // Handed over by the Sections step when its produce run reported a spreadsheet
  // sheet it could not turn into a table. Dismissible: it describes one run, not
  // a standing state, and it would otherwise come back on every reload.
  const handover = useLocation().state as { sheetWarning?: unknown } | null;
  const [sheetWarning, setSheetWarning] = useState<string | null>(
    typeof handover?.sheetWarning === 'string' ? handover.sheetWarning : null,
  );

  const [sections, setSections] = useState<BoardSection[]>([]);
  const [outline, setOutline] = useState<BoardOutlineSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<null | 'refine' | 'confirm'>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  // What has been asked of each section, so the panel can list it back. The
  // backend is stateless per call, so this is the only record.
  const [history, setHistory] = useState<Record<string, string[]>>({});
  // A document being read for one section, so the loader shows on that section
  // rather than taking over the screen.
  const [upload, setUpload] = useState<{
    code: string;
    fileName: string;
    run_id: string;
    poll_url: string;
  } | null>(null);
  // Extraction is only half of it — the section is written from the document
  // afterwards, and that leg is a separate request. Held until BOTH finish, so
  // the buttons don't come back while the content is still on its way.
  const [writing, setWriting] = useState<string | null>(null);

  // Readiness is read off the sections themselves — /completion answers the
  // approve question, which belongs to the Report step, not this one.
  const load = useCallback(async () => {
    const [secs, out] = await Promise.all([
      boardReports.getSections(reportId),
      boardReports.getOutline(reportId),
    ]);
    setSections(secs.sections ?? []);
    setOutline(out.sections ?? []);
    return secs.sections ?? [];
  }, [reportId]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setLoading(true);
    load()
      .then((secs) => {
        if (cancelled) return;
        // Open on the first section that needs a human — that's why you're here.
        const visible = secs.filter((s) => s.included && !isBoardExcluded(s) && !isBoardCoverSection(s));
        const firstBlocked = visible.find(
          (s) =>
            s.status === 'needs_input' ||
            (s.provenance === 'carried_forward' && !s.confirmed) ||
            s.status === 'pending',
        );
        setActiveCode((prev) => prev ?? firstBlocked?.section_code ?? visible[0]?.section_code ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load the report sections.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, load]);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const patch = useCallback((code: string, next: Partial<BoardSection>) => {
    setSections((prev) => prev.map((s) => (s.section_code === code ? { ...s, ...next } : s)));
  }, []);

  const handleSave = useCallback(
    async (code: string, content: string) => {
      setSaving(true);
      setSectionError(null);
      try {
        const res = await boardReports.patchSectionContent(reportId, code, content);
        patch(code, {
          content: res?.content ?? content,
          status: 'produced',
          provenance: 'updated',
          feeder: { ...(res?.feeder ?? {}), edited: true },
        });
        setEditing(false);
        setSaved(true);
      } catch (err: unknown) {
        setSectionError(errorMessage(err, 'Could not save. Please try again.'));
      } finally {
        setSaving(false);
      }
    },
    [reportId, patch],
  );

  const handleRefine = useCallback(
    async (code: string, instruction: string) => {
      setBusy('refine');
      setSectionError(null);
      setHistory((h) => ({ ...h, [code]: [...(h[code] ?? []), instruction] }));
      try {
        const res = await boardReports.refineSection(reportId, code, instruction);
        patch(code, { ...res, feeder: { ...(res?.feeder ?? {}), refined: true } });
      } catch (err: unknown) {
        const status = err instanceof ApiError ? err.status : 0;
        setSectionError(
          status === 502
            ? 'The model returned nothing. Your text is unchanged — try again.'
            : status === 409
              ? 'There is no content to refine yet — produce this section first.'
              : status === 422
                ? 'This section cannot be refined.'
                : errorMessage(err, 'Could not refine this section.'),
        );
      } finally {
        setBusy(null);
      }
    },
    [reportId, patch],
  );

  // Upload straight into the slot this section feeds from, rather than sending
  // the reviewer back to the Sources screen to find it.
  const handleUploadFile = useCallback(
    async (code: string, slot: string, file: File) => {
      setSectionError(null);
      try {
        // The section is named on the upload so the backend can tie the
        // document to it directly, rather than inferring it from the slot.
        const handle = await boardReports.uploadSources(reportId, [{ slot, file }], code);
        setUpload({ code, fileName: file.name, run_id: handle.run_id, poll_url: handle.poll_url });
      } catch (err: unknown) {
        const existing = readExistingRunId(err);
        if (existing) {
          setUpload({
            code,
            fileName: file.name,
            run_id: existing,
            poll_url: `/api/v1/agent_runs/${existing}`,
          });
          return;
        }
        setSectionError(errorMessage(err, 'Could not upload that document.'));
      }
    },
    [reportId],
  );

  // No node timeline on this panel, so don't fetch one. Short cadence because
  // the whole wait is short: at 3s, up to three of those seconds are spent
  // after the run has already finished.
  const uploadPoll = usePipelinePoll(upload?.run_id ?? null, upload?.poll_url ?? null, {
    nodes: false,
    intervalMs: 1500,
  });
  useEffect(() => {
    if (!upload) return;
    const phase = uploadPoll.state.phase;
    if (phase === 'running' || phase === 'idle') return;
    const { code } = upload;
    setUpload(null);
    if (phase !== 'completed') {
      setSectionError(
        uploadPoll.state.run?.error_message ?? 'Reading that document failed. Try again.',
      );
      return;
    }
    // The document is in — write the section from it without another click, and
    // keep the section in a loading state until that lands too.
    setWriting(code);
    void boardReports
      .produceSection(reportId, code, true)
      .catch((err: unknown) => {
        setSectionError(
          err instanceof ApiError && err.status === 422
            ? 'The document is in, but this section has no producer yet — write it here instead.'
            : errorMessage(err, 'The document is in, but writing this section failed.'),
        );
      })
      .finally(() => {
        void load()
          .catch(() => {})
          .finally(() => setWriting(null));
      });
  }, [uploadPoll.state.phase, upload, reportId, load, uploadPoll.state.run?.error_message]);

  const handleConfirm = useCallback(
    async (code: string) => {
      setBusy('confirm');
      setSectionError(null);
      try {
        await boardReports.confirmSection(reportId, code);
      } catch {
        /* 409 = it wasn't carried forward; the reload settles it */
      } finally {
        await load().catch(() => {});
        setBusy(null);
      }
    },
    [reportId, load],
  );

  const visible = useMemo(
    () =>
      sections
        .filter((s) => s.included && !isBoardExcluded(s) && !isBoardCoverSection(s))
        .slice()
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [sections],
  );
  const byCode = useMemo(() => new Map(outline.map((s) => [s.section_code, s])), [outline]);
  const active = visible.find((s) => s.section_code === activeCode) ?? visible[0] ?? null;

  // Every section opens read-only, rendered — click the pencil to edit.
  // Cancel returns to the rendered view; an unwritten section keeps its
  // Upload / Write choice regardless.
  useEffect(() => {
    setEditing(false);
  }, [active]);

  // Both columns scroll inside themselves and the footer stays put, as on the
  // quarterly Preview.
  const { frameRef, tailRef, height: frameHeight } = useFitFrame([
    loading,
    visible.length,
    sheetWarning,
    error,
    reportError,
  ]);
  // "Filled" means it has content, or the server has said there is none to have.
  const unfilled = visible.filter(
    (s) => !(s.status === 'produced' || s.status === 'locked' || s.status === 'empty'),
  );
  const readyCount = visible.length - unfilled.length;

  return (
    <BoardStepShell
      step={3}
      reportId={reportId}
      locked={locked}
      period={period}
      title="Review and refine"
      sub="Read each section, edit it, or ask for a rewrite. Narrative sections come out of your documents as written — refining is how they become prose."
    >
      {locked && <LockedNotice />}
      {(error || reportError) && <Notice tone="red">{error ?? reportError}</Notice>}
      {sheetWarning && (
        <Notice tone="amber">
          {sheetWarning}{' '}
          <button
            type="button"
            onClick={() => setSheetWarning(null)}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              marginLeft: 6,
              fontFamily: 'inherit',
              fontSize: 'inherit',
              fontWeight: 700,
              color: 'inherit',
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </Notice>
      )}

      {loading ? (
        <div className="card">
          <Spinner pad={80} />
        </div>
      ) : visible.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>Nothing produced yet</div>
          <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>
            Go back to <b>Sections</b> and choose <b>Generate report</b>.
          </div>
        </div>
      ) : (
        <div
          ref={frameRef}
          style={{
            display: 'grid',
            gridTemplateColumns: '280px minmax(0, 1fr)',
            gap: 16,
            height: frameHeight ?? undefined,
            alignItems: 'stretch',
          }}
        >
          <SectionRail
            sections={visible}
            activeCode={active?.section_code ?? null}
            readyCount={readyCount}
            onSelect={(code) => {
              setActiveCode(code);
              setSectionError(null);
            }}
          />

          {/* Scrolls on its own, so the rail and the footer never move. */}
          <div style={{ minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
            {active && (
              <SectionPanel
                key={active.section_code}
                section={active}
                index={visible.findIndex((s) => s.section_code === active.section_code)}
                meta={byCode.get(active.section_code)}
                locked={locked}
                editing={editing}
                saving={saving}
                saved={saved}
                busy={busy}
                error={sectionError}
                history={history[active.section_code] ?? []}
                onEdit={setEditing}
                onSave={handleSave}
                onRefine={handleRefine}
                onConfirm={handleConfirm}
                onUploadFile={handleUploadFile}
                working={
                  upload?.code === active.section_code
                    ? `Reading ${upload.fileName}`
                    : writing === active.section_code
                      ? 'Writing this section from your document'
                      : null
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Sits below the frame, so it never scrolls away. */}
      <div
        ref={tailRef}
        style={{
          background: '#fff',
          border: `1px solid ${BORDER_SOFT}`,
          borderRadius: 12,
          padding: '0 20px 14px',
          marginTop: 12,
        }}
      >
        <StepActions
          back={() => navigate(`/board-report/${reportId}/sections`)}
          backLabel="Sections"
          hint={
            unfilled.length > 0 ? (
              // Naming the first one beats a bare count — it's the click you want.
              <button
                type="button"
                onClick={() => {
                  setActiveCode(unfilled[0].section_code);
                  setEditing(false);
                  setSectionError(null);
                }}
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: AMBER,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px dotted currentColor',
                  padding: 0,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {unfilled.length} section{unfilled.length === 1 ? '' : 's'} still empty — start with{' '}
                {unfilled[0].title}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: FAINT }}>
                All {visible.length} sections filled.
              </span>
            )
          }
        >
          {/* Not gated on every section being filled — the Report step already
              renders whatever's ready and shows exactly what's still missing
              on anything that isn't (see ReportSection in BoardReportPage),
              so there's no reason to block getting there. Approval and export
              are the real gates further down, and those are enforced by the
              server's own /completion check, not this button. */}
          <button
            className="btn bp"
            disabled={loading || visible.length === 0}
            title={
              unfilled.length > 0
                ? `${unfilled.length} section${unfilled.length === 1 ? '' : 's'} still empty — the report will show only what's ready.`
                : undefined
            }
            onClick={() => navigate(`/board-report/${reportId}/report`)}
            style={{ padding: '11px 24px', fontSize: 13, fontWeight: 700 }}
          >
            View the report →
          </button>
        </StepActions>
      </div>
    </BoardStepShell>
  );
}

// ─── left rail ────────────────────────────────────────────────────────────────

function SectionRail({
  sections,
  activeCode,
  readyCount,
  onSelect,
}: {
  sections: BoardSection[];
  activeCode: string | null;
  readyCount: number;
  onSelect: (code: string) => void;
}) {
  const allReady = readyCount === sections.length;
  return (
    <div
      className="card"
      style={{
        padding: '14px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          padding: '0 6px',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: MUTED,
            textTransform: 'uppercase',
          }}
        >
          Sections
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            fontFamily: MONO,
            color: allReady ? GREEN : ACCENT,
            background: allReady ? GREEN_LIGHT : ACCENT_LIGHT,
            padding: '2px 8px',
            borderRadius: 10,
          }}
        >
          {readyCount}/{sections.length}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
        {sections.map((s, i) => (
          <RailItem
            key={s.section_code}
            section={s}
            index={i}
            isCurrent={s.section_code === activeCode}
            onClick={() => onSelect(s.section_code)}
          />
        ))}
      </div>
    </div>
  );
}

// One rail row: a numbered circle that becomes a tick once the section is
// written, and an amber dot while it still wants a human.
function RailItem({
  section: s,
  index,
  isCurrent,
  onClick,
}: {
  section: BoardSection;
  index: number;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const ready = s.status === 'produced' || s.status === 'locked' || s.status === 'empty';
  const drafting = s.status === 'drafting';
  const needs =
    s.status === 'needs_input' ||
    s.status === 'pending' ||
    (s.provenance === 'carried_forward' && !s.confirmed);

  const dotBg = ready ? GREEN_LIGHT : needs ? AMBER_LIGHT : drafting ? ACCENT : '#F1F2F6';
  const dotColor = ready ? GREEN : needs ? AMBER : drafting ? '#fff' : MUTED;
  const dotBorder = ready ? '#A7F3D0' : needs ? '#FDE68A' : drafting ? ACCENT : '#E5E7EF';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: isCurrent ? ACCENT_LIGHT : 'transparent',
        border: isCurrent ? `1.5px solid ${ACCENT_RING}` : '1.5px solid transparent',
        transition: 'background 0.15s, border-color 0.15s',
        marginBottom: 2,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          background: dotBg,
          color: dotColor,
          border: `1px solid ${dotBorder}`,
        }}
      >
        {ready ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6.2L5 8.7l4.5-5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : drafting ? (
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            style={{ animation: 'spin 0.8s linear infinite' }}
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.35" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          String(index + 1)
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: isCurrent ? 700 : 500,
            color: isCurrent ? INK : '#374151',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {s.title}
        </div>
      </div>

      {needs && (
        <span
          title="Needs your input"
          style={{ width: 6, height: 6, borderRadius: '50%', background: AMBER, flexShrink: 0 }}
        />
      )}
    </div>
  );
}

// ─── right panel ──────────────────────────────────────────────────────────────

function SectionPanel({
  section: s,
  index,
  meta,
  locked,
  editing,
  saving,
  saved,
  busy,
  error,
  history,
  onEdit,
  onSave,
  onRefine,
  onConfirm,
  onUploadFile,
  working,
}: {
  section: BoardSection;
  index: number;
  meta?: BoardOutlineSection;
  locked: boolean;
  editing: boolean;
  saving: boolean;
  saved: boolean;
  busy: null | 'refine' | 'confirm';
  error: string | null;
  history: string[];
  onEdit: (v: boolean) => void;
  onSave: (code: string, content: string) => void;
  onRefine: (code: string, instruction: string) => void;
  onConfirm: (code: string) => void;
  onUploadFile: (code: string, slot: string, file: File) => void;
  /** What is happening to this section right now — reading, or writing. */
  working: string | null;
}) {
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const feeder = s.feeder ?? null;
  const produced = s.status === 'produced' || s.status === 'locked';
  const carried = s.provenance === 'carried_forward' && !s.confirmed;
  const readOnly = locked || s.status === 'locked';
  const companyVoice = BOARD_COMPANY_VOICE.includes(s.section_code);
  const refinable = !readOnly && canRefineSection(s);
  const statusMeta = STATUS_META[s.status] ?? { label: s.status, color: FAINT, bg: '#F2F3FA' };
  const refining = busy === 'refine';
  // The source slot this section is fed by — where an uploaded file gets filed.
  const slot = meta?.source_document || null;

  return (
    <div className="card" style={{ padding: '24px 28px' }}>
      {/* Header row, same order as the quarterly Preview: number · title ·
          badges · status. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            color: '#fff',
            background: ACCENT,
            padding: '3px 7px',
            borderRadius: 6,
          }}
        >
          {pad2(index + 1)}
        </span>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: INK, flex: 1, minWidth: 0 }}>
          {s.title}
        </h2>
        {meta?.requirement && (
          <span className="badge b-gy" style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>
            {REQ_TEXT[meta.requirement]}
          </span>
        )}
        {feeder?.edited && <span className="badge b-bl">Edited</span>}
        {feeder?.refined && <span className="badge b-pp">Refined with AI</span>}
        {saved && <span style={{ fontSize: 11.5, fontWeight: 700, color: GREEN }}>Saved</span>}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 11px',
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            color: statusMeta.color,
            background: statusMeta.bg,
            flexShrink: 0,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusMeta.color }} />
          {statusMeta.label}
        </span>
        {!readOnly && produced && !editing && (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => onEdit(true)}
            title="Edit this section"
            aria-label="Edit this section"
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: `1px solid ${BORDER_SOFT}`,
              background: '#fff',
              color: MUTED,
              cursor: busy ? 'not-allowed' : 'pointer',
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path
                d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* The chairman's statement is the chairman's, not the model's. */}
      {companyVoice && (
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          Written by the company — edit directly or carry forward from last year.
        </div>
      )}

      {/* The safeguard against last year's board list going out as this year's.
          Hidden once editing starts — opening the editor is itself the "I'm
          addressing this" signal, so the banner and the editor don't both
          compete for attention at once. */}
      {carried && produced && !editing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
            padding: '10px 13px',
            borderRadius: 9,
            background: 'rgba(245,158,11,.12)',
            border: '1px solid rgba(245,158,11,.45)',
            fontSize: 12,
            fontWeight: 600,
            color: AMBER,
            flexWrap: 'wrap',
          }}
        >
          <span>
            The text below is last year&rsquo;s wording
            {feeder?.carried_forward_from ? ` (from ${feeder.carried_forward_from})` : ''}, carried forward
            as a starting point — confirm it&rsquo;s still accurate, or edit it for this year.
          </span>
          {!readOnly && (
            <button className="btn bs bsm" disabled={!!busy} onClick={() => onConfirm(s.section_code)}>
              {busy === 'confirm' ? 'Confirming…' : 'Confirm'}
            </button>
          )}
        </div>
      )}

      {produced ? (
        // Dim the text while a rewrite is in flight, with the state named over
        // it — the content is about to change under the reader.
        <div style={{ position: 'relative' }}>
          {/* The editor works on raw Markdown, not the rendered preview — a
              small trigger rather than a permanent banner, so it doesn't
              compete with the content on every section that's ever edited. */}
          {editing && (
            <button
              type="button"
              // The editor saves-or-cancels on blur (see ProseEditor), so a
              // plain click here would steal focus from the textarea first
              // and read as "cancel" before the click even registers —
              // exactly like the Save/Cancel buttons below guard against.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowMarkdownHelp(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 10,
                padding: '5px 11px',
                borderRadius: 999,
                background: 'rgba(64,64,200,.06)',
                border: '1px solid rgba(64,64,200,.2)',
                fontSize: 11.5,
                fontWeight: 700,
                color: '#3A3F8C',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 7.2v4M8 5.2v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              You&rsquo;re editing raw Markdown — what do the symbols mean?
            </button>
          )}
          <div style={{ opacity: refining ? 0.5 : 1, pointerEvents: refining ? 'none' : undefined }}>
            <EditableSectionContent
              section={toBoardProduced(s)}
              editing={editing}
              saving={saving}
              error={editing ? error : null}
              markdown
              onSave={(content) => onSave(s.section_code, content)}
              onCancel={() => onEdit(false)}
            />
          </div>
          {refining && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,.95)',
                  border: `1px solid ${BORDER_SOFT}`,
                  boxShadow: '0 2px 10px rgba(26,29,46,.08)',
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: INK,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite', color: ACCENT }}>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Refining…
              </span>
            </div>
          )}
        </div>
      ) : s.status === 'empty' ? (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, fontStyle: 'italic' }}>
          Nothing to report this year.
        </p>
      ) : (
        <NeedsInput
          section={s}
          slot={slot}
          readOnly={readOnly}
          saving={saving}
          error={error}
          working={working}
          onSave={onSave}
          onUploadFile={onUploadFile}
        />
      )}

      {error && !editing && <div style={{ marginTop: 8, fontSize: 12, color: RED }}>{error}</div>}

      {/* Stays available while the editor is open — sections are now always
          open for editing, so hiding Refine behind "not editing" would hide it
          permanently. Refining replaces the draft, which is the point. */}
      {refinable && (
        <BoardRefinePanel
          refining={refining}
          history={history}
          onRefine={(instruction) => onRefine(s.section_code, instruction)}
        />
      )}

      {showMarkdownHelp && <MarkdownHelpModal onClose={() => setShowMarkdownHelp(false)} />}
    </div>
  );
}

// ─── Markdown cheat sheet (popup) ───────────────────────────────────────────
//
// The editor works on raw Markdown source, not the rendered preview, so the
// symbols a reviewer might casually delete (a leading #, a pair of **) carry
// real meaning. One reference, opened on demand rather than shown inline on
// every edit, so it doesn't turn into another permanent banner.
const MARKDOWN_CHEATSHEET: { syntax: string; meaning: string; example: string }[] = [
  { syntax: '# text', meaning: 'Heading', example: '# Overview' },
  { syntax: '## text', meaning: 'Sub-heading', example: '## Key risks' },
  { syntax: '**text**', meaning: 'Bold', example: '**material risk**' },
  { syntax: '*text*', meaning: 'Italic', example: '*subject to change*' },
  { syntax: '- text', meaning: 'Bullet list item', example: '- Commodity price risk' },
  { syntax: '1. text', meaning: 'Numbered list item', example: '1. Safety' },
];

function MarkdownHelpModal({ onClose }: { onClose: () => void }) {
  // The section editor underneath saves-or-cancels the moment it loses focus
  // (see ProseEditor), and it never gets a chance to regain focus while this
  // modal is open — so closing this modal, by any route, must not be the
  // click that steals that focus, or the reviewer's edit gets silently
  // cancelled the instant they dismiss a help popup.
  const keepEditorFocused = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="modal-overlay" onMouseDown={keepEditorFocused} onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 460 }}
        onMouseDown={keepEditorFocused}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 22px 4px' }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              flexShrink: 0,
              background: 'rgba(64,64,200,.1)',
              color: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
              <path d="M8 7.2v4M8 5.2v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: INK }}>You&rsquo;re editing raw Markdown</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>
              The box below is the source text, not the formatted preview. These symbols control how it
              renders — remove one by accident and that line loses its formatting once saved.
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px 6px' }}>
          {MARKDOWN_CHEATSHEET.map((row) => (
            <div
              key={row.syntax}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '9px 0',
                borderTop: `1px solid ${BORDER_SOFT}`,
              }}
            >
              <code
                style={{
                  flexShrink: 0,
                  width: 92,
                  fontFamily: MONO,
                  fontSize: 12,
                  fontWeight: 700,
                  color: ACCENT,
                  background: 'rgba(64,64,200,.08)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                {row.syntax}
              </code>
              <span style={{ flexShrink: 0, width: 110, fontSize: 12.5, fontWeight: 700, color: INK }}>
                {row.meaning}
              </span>
              <code style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 11.5, color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.example}
              </code>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 22px 20px' }}>
          <button type="button" className="btn bp" onClick={onClose} style={{ padding: '9px 20px', fontSize: 13 }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── a section with nothing in it yet ─────────────────────────────────────────
//
// One panel, not a choice of two: say what is missing, give a field to type it
// into, offer a document to fill that field from, and one Save. Matches the
// quarterly Preview's needs-input panel.

function NeedsInput({
  section: s,
  slot,
  readOnly,
  saving,
  error,
  working,
  onSave,
  onUploadFile,
}: {
  section: BoardSection;
  slot: string | null;
  readOnly: boolean;
  saving: boolean;
  error: string | null;
  working: string | null;
  onSave: (code: string, content: string) => void;
  onUploadFile: (code: string, slot: string, file: File) => void;
}) {
  // Local to the panel, which is remounted per section — no draft can leak from
  // one section to the next.
  const [draft, setDraft] = useState('');
  const need = s.feeder?.message?.trim() || 'the content for this section';

  if (working) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '24px 4px',
          fontSize: 13,
          fontWeight: 600,
          color: ACCENT,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        {working} — this section fills in when it lands.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          background: AMBER_LIGHT,
          border: '1px solid #FDE68A',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: AMBER, marginBottom: 3 }}>
          This section needs your input
        </div>
        <div style={{ fontSize: 13, color: '#92610A' }}>Needs: {need}</div>
      </div>

      {readOnly ? null : (
        <>
          <label
            style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#3A3F5C', marginBottom: 6 }}
          >
            Section content
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type or paste the section content…"
            rows={6}
            disabled={saving}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 8,
              border: `1.5px solid ${error ? '#FECACA' : '#E5E7EF'}`,
              fontSize: 13,
              lineHeight: 1.6,
              color: INK,
              background: saving ? '#F8F9FC' : '#fff',
              resize: 'vertical',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />

          {/* Files the section's own slot, so there is no trip back to Sources
              to work out which document it was waiting on. */}
          <label
            style={{
              marginTop: 12,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 14px',
              borderRadius: 8,
              border: '1.5px dashed #C9CDE4',
              background: '#fff',
              cursor: slot ? 'pointer' : 'not-allowed',
              opacity: slot ? 1 : 0.55,
              fontSize: 12.5,
              fontWeight: 600,
              color: '#5A6080',
            }}
            title={slot ? `Files under "${slot}"` : 'This section has no document slot'}
          >
            <input
              type="file"
              disabled={!slot}
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && slot) onUploadFile(s.section_code, slot, f);
                e.target.value = '';
              }}
            />
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v8M6 8l4-4 4 4" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
              <path
                d="M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1"
                stroke="#9BA3C4"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            Attach a supporting document
          </label>

          {error && <div style={{ marginTop: 8, fontSize: 12, color: RED }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
            <button
              className="btn bp"
              disabled={saving || !draft.trim()}
              onClick={() => onSave(s.section_code, draft.trim())}
              style={{ fontSize: 13, padding: '10px 22px' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
