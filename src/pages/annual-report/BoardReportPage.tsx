// Board report · step 3 — the report itself.
//
// Rendered from GET /sections rather than /assemble: /assemble carries only the
// produced sections, so it can't show what is still missing or why. Every
// included section appears, with its own status, provenance and the feeder
// message saying exactly what it is waiting on.
//
// /assemble still supplies the cover and brand — it's what the exporter renders,
// so the preview and the PDF can't drift.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { boardReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import { SectionContent } from '@/components/quarterly/SectionContent';
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
  readCompletionFromError,
  toBoardProduced,
} from './board-helpers';
import { BoardStepShell, StepActions } from './board-shell';
import { useBoardReport } from './useBoardReport';
import { ACCENT, AMBER, BORDER_SOFT, FAINT, GREEN, INK, MUTED, Notice, RED } from './board-ui';

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
  const { summary, locked, period, error: reportError } = useBoardReport(reportId);

  const [sections, setSections] = useState<BoardSection[]>([]);
  const [outline, setOutline] = useState<BoardOutlineSection[]>([]);
  const [assembled, setAssembled] = useState<BoardAssembleResponse | null>(null);
  const [completion, setCompletion] = useState<BoardCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);


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

  const handleApprove = useCallback(async () => {
    setApproving(true);
    setApproveError(null);
    try {
      await boardReports.approve(reportId);
      setApprovedNow(true);
      setApproveOpen(false);
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
          <>
            {completion && (
              <div
                className="print-hide"
                style={{
                  maxWidth: DOC_WIDTH,
                  margin: '0 auto 16px',
                  padding: '11px 14px',
                  borderRadius: 10,
                  background: completion.can_approve ? 'rgba(34,197,94,.08)' : 'rgba(245,158,11,.08)',
                  border: `1px solid ${completion.can_approve ? 'rgba(34,197,94,.25)' : 'rgba(245,158,11,.3)'}`,
                  fontSize: 12,
                  color: completion.can_approve ? '#16803C' : AMBER,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <b>
                  {completion.ready} of {completion.total} sections ready
                </b>
                <BlockerChips completion={completion} />
              </div>
            )}

            <div
              className="print-doc"
              style={{ maxWidth: DOC_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}
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
                    meta={byCode.get(s.section_code)}
                    locked={isLocked}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        <div className="card" style={{ padding: '2px 20px 18px', marginTop: 16 }}>
          <StepActions
            back={() => navigate(`/board-report/${reportId}/preview`)}
            backLabel="Review"
            hint={
              !isLocked && (
                <span style={{ fontSize: 11.5, color: FAINT }}>
                  Approve &amp; Lock to enable export.
                </span>
              )
            }
          >
            {/* Only an approved report exports: the file is the deliverable, and
                a PDF of a half-written draft is the one thing that must not be
                able to leave the building. Print stays, for reviewing on paper. */}
            <DownloadMenu
              companyId={companyId}
              reportId={reportId}
              label="Export"
              disabled={!isLocked || sections.length === 0}
              onDownload={(fmt) =>
                boardReports.downloadExport(reportId, fmt, `board-report-${period || 'draft'}`)
              }
            />
            {!isLocked && (
              <button
                className="btn bp"
                // Gated on the server's own readiness flag; the strip above says
                // what is outstanding and each chip jumps to it.
                disabled={!completion?.can_approve}
                title={
                  completion?.can_approve
                    ? undefined
                    : 'Every section must be ready — see what is outstanding above.'
                }
                onClick={() => {
                  setApproveError(null);
                  setApproveOpen(true);
                }}
                style={{
                  padding: '11px 24px',
                  fontSize: 13,
                  fontWeight: 700,
                  opacity: completion?.can_approve ? 1 : 0.55,
                  cursor: completion?.can_approve ? 'pointer' : 'not-allowed',
                }}
              >
                Approve &amp; Lock
              </button>
            )}
          </StepActions>
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
// The assembled document, and nothing else. No control of any kind lives here:
// every way of changing a section — edit, refine, upload, confirm — is on the
// Review step, and Review won't let you leave until every section is filled.

function ReportSection({
  section: s,
  meta,
  locked,
}: {
  section: BoardSection;
  meta?: BoardOutlineSection;
  locked: boolean;
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
        {!produced && (
          <span className="print-hide" style={{ fontSize: 11, fontWeight: 700, color: statusMeta.color }}>
            {statusMeta.label}
          </span>
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
        <SectionContent section={toBoardProduced(s)} markdown />
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
