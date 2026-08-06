// Board report · step 3 — the report itself.
//
// Rendered from GET /sections rather than /assemble: /assemble carries only the
// produced sections, so it can't show what is still missing or why. Every
// included section appears, with its own status, provenance and the feeder
// message saying exactly what it is waiting on.
//
// /assemble still supplies the cover and brand — it's what the exporter renders,
// so the preview and the PDF can't drift.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { boardReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import { ApproveConfirmDialog } from '@/components/quarterly/ApproveConfirmDialog';
import { DownloadMenu } from '@/components/quarterly/DownloadMenu';
import type {
  BoardAssembleResponse,
  BoardCompletion,
  BoardOutlineSection,
  BoardSection,
} from '@/types/board';
import {
  errorMessage,
  isBoardCoverSection,
  isBoardExcluded,
  numberBoardHeadings,
  readCompletionFromError,
  toBoardProduced,
} from './board-helpers';
import { BoardStepShell } from './board-shell';
import { useBoardReport } from './useBoardReport';
import { useFitFrame } from './useFitFrame';
import { ACCENT, AMBER, BORDER_SOFT, FAINT, GREEN, INK, MUTED, Notice } from './board-ui';

const BRAND = 'var(--brand-primary, #4040C8)';
const DOC_WIDTH = 820;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: FAINT },
  drafting: { label: 'Drafting…', color: ACCENT },
  produced: { label: 'Produced', color: GREEN },
  needs_input: { label: 'Needs input', color: AMBER },
  empty: { label: 'No data', color: FAINT },
  locked: { label: 'Locked', color: GREEN },
};

export default function BoardReportPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const { locked, period, error: reportError } = useBoardReport(reportId);

  const [sections, setSections] = useState<BoardSection[]>([]);
  const [outline, setOutline] = useState<BoardOutlineSection[]>([]);
  const [assembled, setAssembled] = useState<BoardAssembleResponse | null>(null);
  const [completion, setCompletion] = useState<BoardCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


  // Inline edit, as on the quarterly assembled report: the pencil is the only
  // way in, and it disappears once the report is approved.
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approvedNow, setApprovedNow] = useState(false);

  const isLocked = locked || approvedNow;
  const brand = assembled?.brand ?? assembled?.cover?.brand ?? null;

  const load = useCallback(async () => {
    const [secs, out, comp, asm] = await Promise.all([
      boardReports.getSections(reportId),
      boardReports.getOutline(reportId),
      boardReports.getCompletion(reportId).catch(() => null),
      boardReports.getAssemble(reportId).catch(() => null),
    ]);
    setSections(secs.sections ?? []);
    setOutline(out.sections ?? []);
    if (comp) setCompletion(comp);
    if (asm) setAssembled(asm);
  }, [reportId]);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, 'Could not load the report.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, load]);

  const handleSave = useCallback(
    async (code: string, content: string) => {
      setSavingCode(code);
      setEditError(null);
      try {
        const res = await boardReports.patchSectionContent(reportId, code, content);
        setSections((prev) =>
          prev.map((s) =>
            s.section_code === code
              ? {
                  ...s,
                  content: res?.content ?? content,
                  status: 'produced',
                  provenance: 'updated',
                  feeder: { ...(res?.feeder ?? {}), edited: true },
                }
              : s,
          ),
        );
        setEditingCode(null);
        setSavedCode(code);
        // An edit can clear a blocker, so the readiness strip has to keep up.
        boardReports.getCompletion(reportId).then(setCompletion).catch(() => {});
      } catch (err: unknown) {
        setEditError(errorMessage(err, 'Could not save. Please try again.'));
      } finally {
        setSavingCode(null);
      }
    },
    [reportId],
  );

  useEffect(() => {
    if (!savedCode) return;
    const t = setTimeout(() => setSavedCode(null), 2000);
    return () => clearTimeout(t);
  }, [savedCode]);

  const handleApprove = useCallback(async () => {
    setApproving(true);
    setApproveError(null);
    try {
      await boardReports.approve(reportId);
      setApprovedNow(true);
      setApproveOpen(false);
      // Editing is gated behind the pencil; drop any open editor so the
      // read-only view takes over cleanly.
      setEditingCode(null);
      boardReports.getCompletion(reportId).then(setCompletion).catch(() => {});
    } catch (err: unknown) {
      // The 409 body IS the completion payload, so the dialog can list exactly
      // what is missing without a second request.
      const blocked = readCompletionFromError(err);
      if (blocked) {
        setCompletion(blocked);
        setApproveError('This report is not ready to approve yet.');
      } else {
        setApproveError(errorMessage(err, 'Could not approve the report.'));
      }
    } finally {
      setApproving(false);
    }
  }, [reportId]);

  const { frameRef, tailRef, height: frameHeight } = useFitFrame([
    loading,
    sections.length,
    completion?.ready,
    error,
    reportError,
  ]);

  // The exporter's own numbering, keyed by section. Headings inside a section
  // are numbered from it, so the document on screen reads like the PDF.
  const numberByCode = useMemo(
    () =>
      new Map(
        (assembled?.sections ?? [])
          .filter((s) => typeof s.number === 'number')
          .map((s) => [s.section_code, s.number as number]),
      ),
    [assembled],
  );

  const byCode = useMemo(() => new Map(outline.map((s) => [s.section_code, s])), [outline]);
  const titleByCode = useMemo(
    () => new Map(outline.map((s) => [s.section_code, s.title])),
    [outline],
  );

  // The cover is drawn by CoverRenderer. `isCoverSection` from the quarterly
  // helpers can't be used — it matches /cover/i on the section_code, and this
  // one is BR01.
  const body = sections
    .filter((s) => s.included && !isBoardExcluded(s) && !isBoardCoverSection(s))
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const values = (assembled?.cover?.values ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null => (typeof values[k] === 'string' ? (values[k] as string) : null);

  return (
    <BoardStepShell
      step={4}
      reportId={reportId}
      locked={isLocked}
      period={period}
      title="Board of Directors report"
      sub="The finished document, exactly as it exports. Edits and refinements live on the Review step."
    >
      <div
        style={{
          ['--brand-primary' as string]: brand?.primary ?? ACCENT,
          ['--brand-secondary' as string]: brand?.secondary ?? ACCENT,
        }}
      >
        {/* No bar — just the controls, floating at the right and following you
            down a long document. The group has no background of its own, so
            only the buttons and the readiness pill sit over the page. */}
        <div
          className="print-hide"
          style={{
            position: 'sticky',
            top: 4,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          {completion && (
            // Its own pill, because it is legible over whatever scrolls beneath.
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 13px',
                borderRadius: 999,
                background: '#fff',
                border: `1px solid ${completion.can_approve ? 'rgba(34,197,94,.3)' : 'rgba(245,158,11,.35)'}`,
                boxShadow: '0 2px 10px rgba(26,29,46,.06)',
                fontSize: 12,
                fontWeight: 700,
                color: completion.can_approve ? '#16803C' : AMBER,
              }}
            >
              {completion.ready} of {completion.total} sections ready
              <BlockerChips completion={completion} />
            </span>
          )}

          {/* Only an approved report exports: the file is the deliverable, and a
              PDF of a half-written draft is the one thing that must not be able
              to leave the building. */}
          <span title={isLocked ? undefined : 'Approve & Lock to enable export.'}>
            <DownloadMenu
              companyId={companyId}
              reportId={reportId}
              label="Export"
              disabled={!isLocked || sections.length === 0}
              onDownload={(fmt) =>
                boardReports.downloadExport(reportId, fmt, `board-report-${period || 'draft'}`)
              }
            />
          </span>
          {!isLocked && (
            <button
              className="btn bp"
              // Gated on the server's own readiness flag; the pill beside it
              // says what is outstanding and each chip jumps to it.
              disabled={!completion?.can_approve}
              title={
                completion?.can_approve
                  ? undefined
                  : 'Every section must be ready — see what is outstanding beside this.'
              }
              onClick={() => {
                setApproveError(null);
                setApproveOpen(true);
              }}
              style={{ padding: '9px 20px', fontSize: 12.5, fontWeight: 700 }}
            >
              Approve &amp; Lock
            </button>
          )}
        </div>

        {(error || reportError) && <Notice tone="red">{error ?? reportError}</Notice>}

        {loading ? (
          <div className="card">
            <Spinner pad={80} />
          </div>
        ) : sections.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>Nothing produced yet</div>
            <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>
              Go back to <b>Sections</b> and choose <b>Generate report</b>.
            </div>
            <button
              className="btn bs bsm"
              style={{ marginTop: 14 }}
              onClick={() => void load().catch(() => {})}
            >
              Retry
            </button>
          </div>
        ) : (
          /* The document scrolls in its own frame, so the controls above it and
             the Review button below stay put however long the report runs. */
          <div
            ref={frameRef}
            className="doc-scroll"
            style={{ height: frameHeight ?? undefined, overflowY: 'auto', paddingRight: 6 }}
          >
            <div
              className="print-doc"
              style={{
                maxWidth: DOC_WIDTH,
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              <CoverRenderer
                companyName={str('company_name') ?? user?.company_name ?? null}
                period={str('period_label') ?? period ?? null}
                title={str('title') ?? 'Board of Directors’ Report'}
                preparedOn={str('prepared_on')}
                brand={brand}
                templateKey={assembled?.cover?.template_key ?? null}
                maxWidth={DOC_WIDTH}
              />

              <div className="card" style={{ padding: '32px 40px', maxWidth: DOC_WIDTH }}>
                {body.map((s) => (
                  <ReportSection
                    key={s.section_code}
                    section={s}
                    number={numberByCode.get(s.section_code) ?? null}
                    meta={byCode.get(s.section_code)}
                    locked={isLocked}
                    editing={editingCode === s.section_code}
                    saving={savingCode === s.section_code}
                    saved={savedCode === s.section_code}
                    error={editingCode === s.section_code ? editError : null}
                    onEdit={() => {
                      setEditError(null);
                      setEditingCode(s.section_code);
                    }}
                    onSave={(content) => handleSave(s.section_code, content)}
                    onCancel={() => {
                      setEditError(null);
                      setEditingCode(null);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Back navigation belongs at the end of the document, on its own — the
            top bar is for what you do with the finished report. */}
        <div ref={tailRef} className="print-hide" style={{ marginTop: 18 }}>
          <button
            className="btn bs"
            onClick={() => navigate(`/board-report/${reportId}/preview`)}
            style={{ padding: '10px 18px', fontSize: 13 }}
          >
            ← Review
          </button>
        </div>

        {approveOpen && (
          <ApproveConfirmDialog
            approving={approving}
            error={approveError}
            title="Approve and lock this board report?"
            onConfirm={handleApprove}
            onClose={() => setApproveOpen(false)}
          >
            {completion && !completion.can_approve && (
              <BlockerList completion={completion} titleByCode={titleByCode} />
            )}
          </ApproveConfirmDialog>
        )}
      </div>
    </BoardStepShell>
  );
}

// ─── approval blockers ────────────────────────────────────────────────────────

function BlockerChips({ completion }: { completion: BoardCompletion }) {
  const jump = (code?: string) => {
    if (!code) return;
    document.getElementById(`sec-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const groups: [string, string[]][] = [
    ['awaiting data', completion.awaiting_data],
    ['need confirmation', completion.pending_confirmation],
    ['not produced', completion.not_produced],
  ];
  return (
    <>
      {groups
        .filter(([, codes]) => codes.length > 0)
        .map(([label, codes]) => (
          <button
            key={label}
            type="button"
            onClick={() => jump(codes[0])}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'inherit',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px dotted currentColor',
              cursor: 'pointer',
              padding: 0,
              fontFamily: 'inherit',
            }}
          >
            {codes.length} {label}
          </button>
        ))}
    </>
  );
}

function BlockerList({
  completion,
  titleByCode,
}: {
  completion: BoardCompletion;
  titleByCode: Map<string, string>;
}) {
  const groups: [string, string[]][] = [
    ['Awaiting this year’s data', completion.awaiting_data],
    ['Carried forward, needs confirming', completion.pending_confirmation],
    ['Not produced yet', completion.not_produced],
  ];
  const shown = groups.filter(([, codes]) => codes.length > 0);
  if (!shown.length) return null;

  return (
    <div
      style={{
        marginTop: 14,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'rgba(245,158,11,.08)',
        border: '1px solid rgba(245,158,11,.3)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: AMBER, marginBottom: 8 }}>
        {completion.ready} of {completion.total} sections ready
      </div>
      {shown.map(([label, codes]) => (
        <div key={label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, marginBottom: 3 }}>
            {label} ({codes.length})
          </div>
          <div style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
            {codes.map((c) => titleByCode.get(c) ?? c).join(' · ')}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── one section of the finished document ─────────────────────────────────────
//
// Read-only until the pencil is clicked, exactly as on the quarterly assembled
// report. Refining, uploading and confirming still belong to the Review step —
// this is only the last-minute correction you spot while reading the finished
// document. The pencil disappears once the report is approved.

function ReportSection({
  section: s,
  number,
  meta,
  locked,
  editing,
  saving,
  saved,
  error,
  onEdit,
  onSave,
  onCancel,
}: {
  section: BoardSection;
  /** Its number in the finished document, from `/assemble`. */
  number: number | null;
  meta?: BoardOutlineSection;
  locked: boolean;
  editing: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onEdit: () => void;
  onSave: (content: string) => void;
  onCancel: () => void;
}) {
  const feeder = s.feeder ?? null;
  const produced = s.status === 'produced' || s.status === 'locked';
  const carried = s.provenance === 'carried_forward' && !s.confirmed;
  const statusMeta = STATUS_LABEL[s.status] ?? { label: s.status, color: FAINT };

  return (
    <section id={`sec-${s.section_code}`} style={{ marginBottom: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 800,
            color: BRAND,
            flex: 1,
            minWidth: 0,
            lineHeight: 1.25,
          }}
        >
          {s.title}
        </h2>
        {meta?.requirement === 'M' && (
          <span className="badge b-gn print-hide" title="Mandatory">
            M
          </span>
        )}
        {feeder?.edited && <span className="badge b-bl print-hide">Edited</span>}
        {feeder?.refined && <span className="badge b-pp print-hide">Refined with AI</span>}
        {saved && (
          <span
            className="print-hide"
            style={{ fontSize: 12, fontWeight: 700, color: GREEN, display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6.2L5 8.7l4.5-5"
                stroke={GREEN}
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Saved
          </span>
        )}
        {!produced && (
          <span className="print-hide" style={{ fontSize: 11, fontWeight: 700, color: statusMeta.color }}>
            {statusMeta.label}
          </span>
        )}
        {!locked && produced && !editing && (
          <button
            type="button"
            className="print-hide"
            onClick={onEdit}
            aria-label={`Edit ${s.title}`}
            title="Edit section"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 7,
              border: '1px solid #E4E6F1',
              background: '#fff',
              color: MUTED,
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Still flagged here, because the report can't be approved until it's
          cleared — but confirming it is a Review-step action. */}
      {carried && produced && !locked && (
        <div
          className="print-hide"
          style={{
            marginBottom: 12,
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
          Carried forward{feeder?.carried_forward_from ? ` from ${feeder.carried_forward_from}` : ''} —
          not yet confirmed.
        </div>
      )}

      {produced ? (
        // Numbered for reading, raw for editing — the numbers are display-only
        // and must never reach `PATCH .../content`.
        <EditableSectionContent
          section={toBoardProduced(
            editing ? s : { ...s, content: numberBoardHeadings(s.content, number) },
          )}
          editing={editing}
          saving={saving}
          error={error}
          markdown
          onSave={onSave}
          onCancel={onCancel}
        />
      ) : s.status === 'empty' ? (
        <p style={{ margin: 0, fontSize: 13, color: MUTED, fontStyle: 'italic' }}>
          Nothing to report this year.
        </p>
      ) : (
        // Never hidden: an unfilled section is what a reviewer most needs to see.
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 9,
            background: s.status === 'needs_input' ? 'rgba(245,158,11,.08)' : '#FAFBFE',
            border: `1px solid ${s.status === 'needs_input' ? 'rgba(245,158,11,.3)' : BORDER_SOFT}`,
            fontSize: 12.5,
            color: s.status === 'needs_input' ? AMBER : MUTED,
          }}
        >
          {feeder?.message ?? 'Not produced yet.'}
        </div>
      )}

    </section>
  );
}
