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
import { useNavigate, useParams } from 'react-router-dom';
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
  toBoardProduced,
} from './board-helpers';
import { BoardStepShell, StepActions } from './board-shell';
import { useBoardReport } from './useBoardReport';
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

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Not produced', color: '#C9CDE4' },
  drafting: { label: 'Drafting…', color: ACCENT },
  produced: { label: 'Ready', color: GREEN },
  needs_input: { label: 'Needs input', color: AMBER },
  empty: { label: 'Nothing to report', color: '#C9CDE4' },
  locked: { label: 'Locked', color: GREEN },
};

export default function BoardPreviewPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { locked, period, error: reportError } = useBoardReport(reportId);

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

  const uploadPoll = usePipelinePoll(upload?.run_id ?? null, upload?.poll_url ?? null);
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
        <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0, 1fr)', gap: 18, alignItems: 'start' }}>
          <SectionRail
            sections={visible}
            activeCode={active?.section_code ?? null}
            readyCount={readyCount}
            onSelect={(code) => {
              setActiveCode(code);
              setEditing(false);
              setSectionError(null);
            }}
          />

          {active && (
            <SectionPanel
              key={active.section_code}
              section={active}
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
      )}

      <div className="card" style={{ padding: '2px 20px 18px', marginTop: 16 }}>
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
          {/* The report is the assembled document — it can't be assembled from
              sections that have no content, so this is the gate. */}
          <button
            className="btn bp"
            disabled={loading || visible.length === 0 || unfilled.length > 0}
            title={
              unfilled.length > 0
                ? 'Every section needs content before the report can be assembled.'
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
  return (
    <div className="card" style={{ padding: 0, position: 'sticky', top: 12 }}>
      <div
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${BORDER_SOFT}`,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '.6px',
          textTransform: 'uppercase',
          color: FAINT,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Sections · {sections.length}</span>
        <span style={{ color: ACCENT }}>{readyCount} ready</span>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 620, overflowY: 'auto' }}>
        {sections.map((s) => {
          const activeRow = s.section_code === activeCode;
          const meta = STATUS_META[s.status] ?? { label: s.status, color: '#C9CDE4' };
          const needsYou =
            s.status === 'needs_input' || (s.provenance === 'carried_forward' && !s.confirmed);
          return (
            <button
              key={s.section_code}
              type="button"
              onClick={() => onSelect(s.section_code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: 'none',
                fontFamily: 'inherit',
                cursor: 'pointer',
                background: activeRow ? 'rgba(64,64,200,.08)' : 'transparent',
              }}
            >
              <span
                aria-hidden
                style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }}
              />
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: activeRow ? 700 : 500,
                  color: activeRow ? ACCENT : INK,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.title}
              </span>
              {needsYou && (
                <span
                  aria-label="Needs your attention"
                  style={{ fontSize: 11, fontWeight: 800, color: AMBER, flexShrink: 0 }}
                >
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── right panel ──────────────────────────────────────────────────────────────

function SectionPanel({
  section: s,
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
  const feeder = s.feeder ?? null;
  const produced = s.status === 'produced' || s.status === 'locked';
  const carried = s.provenance === 'carried_forward' && !s.confirmed;
  const readOnly = locked || s.status === 'locked';
  const companyVoice = BOARD_COMPANY_VOICE.includes(s.section_code);
  const refinable = !readOnly && canRefineSection(s);
  const statusMeta = STATUS_META[s.status] ?? { label: s.status, color: FAINT };
  const refining = busy === 'refine';
  // The source slot this section is fed by — where an uploaded file gets filed.
  const slot = meta?.source_document || null;

  return (
    <div className="card" style={{ padding: '22px 26px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
        {meta?.requirement === 'M' && (
          <span className="badge b-gn" title="Mandatory">
            M
          </span>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: statusMeta.color }}>{statusMeta.label}</span>
        {feeder?.edited && <span className="badge b-bl">Edited</span>}
        {feeder?.refined && <span className="badge b-pp">Refined with AI</span>}
        {saved && <span style={{ fontSize: 11.5, fontWeight: 700, color: GREEN }}>Saved</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: INK, flex: 1, minWidth: 0 }}>
          {s.title}
        </h2>
        {!readOnly && produced && !editing && (
          <button
            className="btn bs bsm"
            disabled={!!busy}
            onClick={() => onEdit(true)}
            style={{ flexShrink: 0 }}
          >
            ✎ Edit
          </button>
        )}
      </div>

      {/* The chairman's statement is the chairman's, not the model's. */}
      {companyVoice && (
        <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 12 }}>
          Written by the company — edit directly or carry forward from last year.
        </div>
      )}

      {/* The safeguard against last year's board list going out as this year's. */}
      {carried && produced && (
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
            Carried forward{feeder?.carried_forward_from ? ` from ${feeder.carried_forward_from}` : ''} —
            confirm this is still accurate.
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
        // Unwritten, whether the server is waiting on a document (needs_input)
        // or simply hasn't written it (pending). Either way there are exactly
        // two ways forward, and re-producing isn't one of them: nothing it
        // depends on has changed, and some sections have no producer at all.
        <div
          style={{
            padding: '13px 15px',
            borderRadius: 9,
            background: s.status === 'needs_input' ? 'rgba(245,158,11,.08)' : '#FAFBFE',
            border: `1px solid ${s.status === 'needs_input' ? 'rgba(245,158,11,.3)' : BORDER_SOFT}`,
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              color: s.status === 'needs_input' ? AMBER : MUTED,
              marginBottom: readOnly ? 0 : 10,
            }}
          >
            {working
              ? 'Working on this section…'
              : (feeder?.message ??
                'Not written yet — upload the document it reads from, or write it here.')}
          </div>

          {working ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: INK, fontWeight: 600 }}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: 'spin 0.8s linear infinite', color: ACCENT, flexShrink: 0 }}
              >
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              {working} — this section will fill in when it lands.
            </div>
          ) : (
            !readOnly &&
            !editing && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/* Files the section's own slot, so there is no trip back to
                    Sources to work out which document it needed. */}
                <label
                  className="btn bp bsm"
                  style={{ cursor: slot ? 'pointer' : 'not-allowed', marginBottom: 0, opacity: slot ? 1 : 0.55 }}
                  title={slot ? `Files under "${slot}"` : 'This section has no document slot'}
                >
                  Upload the document
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
                </label>
                <button className="btn bs bsm" onClick={() => onEdit(true)}>
                  Write it manually
                </button>
              </div>
            )
          )}

          {editing && (
            <div style={{ marginTop: 12 }}>
              <EditableSectionContent
                section={toBoardProduced({ ...s, content: s.content ?? '' })}
                editing
                saving={saving}
                error={error}
                onSave={(content) => onSave(s.section_code, content)}
                onCancel={() => onEdit(false)}
              />
            </div>
          )}
        </div>
      )}

      {error && !editing && <div style={{ marginTop: 8, fontSize: 12, color: RED }}>{error}</div>}

      {refinable && !editing && (
        <BoardRefinePanel
          refining={refining}
          history={history}
          onRefine={(instruction) => onRefine(s.section_code, instruction)}
        />
      )}
    </div>
  );
}
