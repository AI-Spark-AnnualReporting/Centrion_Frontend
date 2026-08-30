import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { statusPill } from '@/components/dashboard/report-status';
import { useAuth } from '@/context/AuthContext';
import {
  boardReports,
  communications,
  earnings,
  quarterlyReports,
  ApiError,
  type CommunicationMember,
  type ReviewComment,
  type ReviewSection,
  type ReviewViewResponse,
} from '@/lib/api';
import type { EarningsProducedSection } from '@/types/earnings';
import type { AssembledSection, BrandColors } from '@/types/quarterly';
import type { BoardAssembledSection } from '@/types/board';
import { isBoardCoverSection, numberBoardHeadings } from '@/pages/annual-report/board-helpers';
import { SectionRenderer } from '@/components/earnings/SectionRenderer';
import { SectionContent } from '@/components/quarterly/SectionContent';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import { isTableOfContentsSection } from '@/pages/earnings/helpers';
import { isCoverSection } from '@/components/quarterly/sectionState';
import { initials, relativeTime } from './helpers';
import { Skeleton } from '@/components/ui/skeleton';

/* Reviewer screen — the "Open as reviewer" destination.

   Any company member may READ this (a creator watching their report get
   reviewed sees can_act: false); only the write calls are restricted:
     can_act     → you are the assigned reviewer (reassign / request changes)
     can_approve → additionally requires the report to be in review

   Approve is rendered DISABLED, not hidden, when can_act && !can_approve.

   Section bodies: the review payload carries metadata only (id/order/title),
   where `id` is the `section_code` verbatim ("s01_cover"). The content comes
   from the report's own endpoint — quarterly reports from
   quarterlyReports.getAssembled(), everything else from
   earnings.getEarningsSections() — and is paired on that code. The review list
   is the source of truth — it returns only the ticked sections (e.g. 11 of 19),
   so iterating it drops the extras for free. Any section without a content
   match still renders its heading and Add comment. */

// ApiError.message already carries the backend's `detail` (or a generic
// message for 429/5xx infra failures) — read it rather than re-parsing
// `err.body.detail` directly, which would bypass that sanitization.
function detailMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  return fallback;
}

// Report-level comments come back under the JSON key "null".
const REPORT_LEVEL_KEY = 'null';

// Anchors for the in-document sections, so the comments rail can jump to one.
const sectionDomId = (sectionId: string) => `review-sec-${sectionId}`;

// Quarterly and board reports each assemble from their own endpoint; every
// other type reads through the earnings sections endpoint. `board_pack` is the
// older type string for the same report.
const QUARTERLY = 'quarterly';
const EARNINGS = 'earnings';
const ANNUAL = 'annual';
const BOARD = ['board_report', 'board_pack'];

// Document presentation, matched to AssembledReportPage so the reviewer reads
// exactly what the creator approved — same page width, numbering, and accents.
const DOC_WIDTH = 820;
const MONO = "'DM Mono', 'Courier New', monospace";
const BRAND = 'var(--brand-primary, #4040C8)';
const pad2 = (n: number) => String(n).padStart(2, '0');

// /assemble returns a leaner section than the earnings one — and may hand back
// table content already parsed, which SectionRenderer (it calls .trim()) can't
// take. Normalise to a string and fill the earnings-only fields with the
// read-only defaults the renderer expects.
export function assembledToProduced(s: AssembledSection): EarningsProducedSection {
  const raw = s.content as unknown;
  return {
    section_code: s.section_code,
    title: s.title,
    display_order: s.display_order ?? 0,
    source_type: s.source_type ?? null,
    mode: s.mode,
    status: 'produced',
    content: raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw),
    included: true,
    feeder_status: 'ready',
    feeder_message: null,
    source_label: null,
    source_ref: null,
    confidence: null,
    flag: null,
    grounding_flag: null,
    grounding_acknowledged: false,
    edited: false,
  };
}

// The board document's own assemble shape, mapped to what the renderers read.
// Board content arrives as Markdown prose or a JSON table, the same two shapes
// the quarterly renderer already draws.
function boardToProduced(s: BoardAssembledSection): EarningsProducedSection {
  const raw = s.content as unknown;
  const content = raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
  return {
    section_code: s.section_code,
    title: s.title,
    display_order: s.display_order ?? 0,
    source_type: s.source_type ?? null,
    mode: s.mode === 'table' ? 'table' : 'generate',
    status: 'produced',
    // Headings inside a section are numbered from the section's own number, as
    // on the Report step — the reviewer reads what the creator approved.
    content: numberBoardHeadings(content, s.number ?? null) || content,
    included: true,
    feeder_status: 'ready',
    feeder_message: null,
    source_label: null,
    source_ref: null,
    confidence: null,
    flag: null,
    grounding_flag: null,
    grounding_acknowledged: false,
    edited: false,
  };
}

const ICON_SHARE = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
    <circle cx="13.4" cy="4.2" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="4.6" cy="9" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="13.4" cy="13.8" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6.5 7.9l5-2.6M6.5 10.1l5 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ICON_COMMENT = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M12 8.4a1.4 1.4 0 0 1-1.4 1.4H4.3L1.9 12V3.1a1.4 1.4 0 0 1 1.4-1.4h7.3A1.4 1.4 0 0 1 12 3.1v5.3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

const RAIL_LABEL: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: '.6px',
  textTransform: 'uppercase',
  color: '#8890AE',
  marginBottom: 10,
};

// `onJump` makes the whole row a target that scrolls the document to the
// section this comment is on. Omitted for report-level comments (no section to
// scroll to) and for the rows already rendered inside their own section.
function CommentRow({
  comment,
  showSection,
  onJump,
}: {
  comment: ReviewComment;
  showSection?: boolean;
  onJump?: () => void;
}) {
  return (
    <div
      style={{ display: 'flex', gap: 9, padding: '9px 0', borderTop: '1px solid #F4F5FB', cursor: onJump ? 'pointer' : undefined }}
      {...(onJump && {
        role: 'button',
        tabIndex: 0,
        title: `Go to ${comment.section_title ?? 'this section'}`,
        onClick: onJump,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onJump();
          }
        },
      })}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          flexShrink: 0,
          background: comment.author.is_you ? 'linear-gradient(150deg,#5B5BF0,#4040C8)' : '#EEEEFF',
          color: comment.author.is_you ? '#fff' : '#4040C8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {comment.author.initials || initials(comment.author.full_name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>
            {comment.author.full_name}
            {comment.author.is_you && ' (you)'}
          </span>
          <span style={{ fontSize: 10.5, color: '#9BA3C4' }}>{relativeTime(comment.created_at)}</span>
          {comment.resolved && <span className="badge b-gy">Resolved</span>}
        </div>
        {showSection && comment.section_title && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7C3AED', marginTop: 2 }}>
            {comment.section_title}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#3A4066', marginTop: 3, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {comment.body}
        </div>
      </div>
    </div>
  );
}

// "23 Aug 2026" for the removed-from-thread banner.
/* Placeholder lines while a section's body is still in flight.

   Ragged widths on purpose: three equal bars read as a table, not as text
   about to arrive. */
function SectionBodySkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }} aria-busy="true" aria-label="Loading section content">
      <Skeleton style={{ height: 11, width: '92%' }} />
      <Skeleton style={{ height: 11, width: '100%' }} />
      <Skeleton style={{ height: 11, width: '78%' }} />
    </div>
  );
}

function formatRemovedOn(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ReviewerView({
  threadId,
  onClose,
  onBack,
  onChanged,
}: {
  threadId: string;
  onClose: () => void;
  // Back chevron — returns to the thread modal. Falls back to onClose.
  onBack?: () => void;
  // Fired after approve / request-changes / reassign so the parent re-fetches.
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  // getAssembled is company-scoped in its path; the earnings endpoint isn't.
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewViewResponse | null>(null);

  // Which section's composer is open. `null` = the report-level composer.
  const [composerFor, setComposerFor] = useState<string | null | undefined>(undefined);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const [members, setMembers] = useState<CommunicationMember[]>([]);
  const [reassignTo, setReassignTo] = useState<string>('');
  const [reassigning, setReassigning] = useState(false);

  // Report body, keyed by section_code (== the review payload's section.id).
  const [bodies, setBodies] = useState<Record<string, EarningsProducedSection>>({});
  // The bodies arrive in their own request, after the headings. Until it lands
  // every section rendered "hasn't been generated yet", which is a lie about a
  // report that is merely still loading — and the reviewer's first impression
  // of it was an empty document.
  const [bodiesLoading, setBodiesLoading] = useState(false);
  // Why the document came back empty. Swallowing this is what made a permission
  // failure look like "nothing has been written yet" — two very different things
  // to the reviewer looking at the screen.
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null);
  // Quarterly only: the cover page's real values + brand accents, so the review
  // renders the same document AssembledReportPage does. Null until loaded — the
  // cover is skipped rather than drawn with "Your Company" placeholders.
  const [cover, setCover] = useState<{
    companyName: string | null;
    period: string | null;
    title: string | null;
    preparedOn: string | null;
  } | null>(null);
  const [brand, setBrand] = useState<BrandColors | null>(null);

  // Approve / request-changes note panels.
  const [panel, setPanel] = useState<'approve' | 'send_back' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await communications.reviewView(threadId);
      setData(res);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // session flow ran
      setError(detailMessage(e, 'Could not load the review. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Pull the report body once we know the report id and type. Both endpoints
  // are company-scoped on the backend, so a non-owner reviewer can read them.
  // A type neither branch resolves still renders its headings without a body.
  const reportId = data?.report?.id;
  const reportType = data?.report?.report_type;
  // Types whose written body this screen can actually fetch — see the effect
  // below. Annual is written in the reporting-cycles system and ESG has no
  // sections at all, so for those the headings are all there is to show, and
  // saying "not generated yet" about them would be a lie.
  const hasBodySource =
    BOARD.includes(reportType ?? '') ||
    reportType === QUARTERLY ||
    reportType === EARNINGS ||
    reportType === ANNUAL;

  // The reassign dropdown needs the member list — scoped to this report, so
  // only people who can open it are offered.
  useEffect(() => {
    if (!reportId) return;
    communications
      .members(reportId)
      .then((r) => setMembers(r.members))
      .catch(() => {});
  }, [reportId]);
  // Read off `data` here, not inside the effect, so re-fetching the review (a
  // posted comment reloads it) doesn't re-pull the whole document body.
  const userCompanyName = user?.company_name ?? null;
  const annualPeriod = data?.report?.period ?? null;
  const annualTitle = data?.report?.title ?? null;
  useEffect(() => {
    if (!reportId || !reportType) return;
    let cancelled = false;
    const load = BOARD.includes(reportType)
      ? boardReports.getAssemble(reportId).then((res) => {
          if (!cancelled) {
            const values = (res.cover?.values ?? {}) as Record<string, unknown>;
            const str = (k: string) => (typeof values[k] === 'string' ? (values[k] as string) : null);
            setCover({
              companyName: str('company_name') ?? userCompanyName,
              period: str('period_label') ?? res.period ?? null,
              title: str('title') ?? 'Board of Directors’ Report',
              preparedOn: str('prepared_on'),
            });
            setBrand(res.brand ?? res.cover?.brand ?? null);
          }
          return {
            sections: res.sections.map(boardToProduced),
            cover_template_key: res.cover?.template_key ?? null,
          };
        })
      : reportType === QUARTERLY && companyId
        ? quarterlyReports.getAssembled(companyId, reportId).then((res) => {
            if (!cancelled) {
              // /assemble often omits `header` entirely. AssembledReportPage
              // covers the company name from the JWT (see its `companyName`) —
              // do the same, or the cover reads "Your Company". Nothing else
              // gets a fallback there, so nothing else gets one here: the point
              // is to show the cover the creator approved, not a better one.
              const h = res.header ?? null;
              setCover({
                companyName: h?.company_name ?? userCompanyName,
                period: h?.period_label ?? null,
                title: h?.title ?? null,
                preparedOn: h?.prepared_on ?? null,
              });
              setBrand(res.brand ?? res.cover?.brand ?? null);
            }
            return {
              sections: res.sections.map(assembledToProduced),
              cover_template_key: res.cover?.cover_template_key ?? null,
            };
          })
        : reportType === EARNINGS
          ? earnings.getEarningsSections(reportId)
          : reportType === ANNUAL
            // Written in the reporting-cycles system, so it comes from the
            // Hub's own endpoint rather than a per-report module table. Its
            // cover page has no /assemble call behind it either — the report's
            // own meta is the header, which is what the cycle prints too.
            ? communications.reviewAnnualSections(reportId).then((res) => {
                if (!cancelled) {
                  setCover({
                    companyName: userCompanyName,
                    period: annualPeriod,
                    title: annualTitle,
                    preparedOn: null,
                  });
                }
                return res;
              })
            // ESG keeps metrics, not sections. This used to fall through to
            // earnings, which answered "Earnings report <id> not found" — an
            // error about the wrong report, on a report that is fine.
            : null;
    setBodyError(null);
    if (!load) {
      setBodies({});
      setBodiesLoading(false);
      return;
    }
    setBodiesLoading(true);
    load
      .then((res) => {
        if (cancelled) return;
        const byCode: Record<string, EarningsProducedSection> = {};
        for (const s of res.sections) byCode[s.section_code] = s;
        setBodies(byCode);
        setCoverTemplateKey(res.cover_template_key);
      })
      .catch((e: unknown) => {
        if (!cancelled) setBodyError(detailMessage(e, 'Could not load the report content.'));
      })
      .finally(() => {
        if (!cancelled) setBodiesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, reportType, companyId, userCompanyName, annualPeriod, annualTitle]);

  // Earnings brand accents. Quarterly and board get their brand from the
  // /assemble calls above; earnings keeps it behind the cover-template
  // endpoint, which is the same source EarningsPreviewPage reads and works on
  // locked reports. Every other type has no earnings cover to ask for.
  useEffect(() => {
    if (reportType !== EARNINGS || !reportId) return;
    let cancelled = false;
    earnings
      .getEarningsCoverSelection(reportId)
      .then((res) => {
        if (!cancelled && res?.brand) setBrand(res.brand);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reportId, reportType]);

  const bySection = data?.comments_by_section ?? {};
  const reportLevel = data?.comments_by_section?.[REPORT_LEVEL_KEY] ?? [];
  const allComments = data?.comments ?? [];

  const openComposer = (sectionId: string | null) => {
    setComposerFor(sectionId);
    setCommentBody('');
  };

  // Rail comment → its section in the document. A comment can outlive the
  // section it was left on (the report was regenerated with a different
  // outline), so a missing anchor is a no-op rather than a crash.
  const jumpToSection = (sectionId: string) => {
    document.getElementById(sectionDomId(sectionId))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const postComment = async (sectionId: string | null, sectionTitle: string | null) => {
    const body = commentBody.trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    try {
      await communications.addReviewComment(threadId, {
        // Omit both for a report-level comment; the backend fills in the title.
        section_id: sectionId ?? undefined,
        section_title: sectionId ? (sectionTitle ?? undefined) : undefined,
        body,
      });
      setCommentBody('');
      setComposerFor(undefined);
      await load(); // re-read so counts and grouping stay authoritative
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      toast({ title: detailMessage(e, 'Could not post the comment.'), variant: 'destructive' });
    } finally {
      setPostingComment(false);
    }
  };

  // Reassigning and the approve / request-changes panel are two ways to end the
  // same review — never both at once. An open panel holds a note the reassign
  // would discard, and the send-back that followed would 403 (no longer the
  // reviewer), so each side locks the other while it's in play.
  const reassignLocked = !!panel || busy;

  const runReassign = async () => {
    if (!reassignTo || reassigning) return;
    setReassigning(true);
    setActionError(null);
    try {
      const res = await communications.reassignReview(threadId, { assigned_to: reassignTo });
      toast({ title: 'Review reassigned', description: `Now with ${res.full_name}.` });
      setReassignTo('');
      // The caller is no longer the reviewer — re-read rather than guess.
      await load();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(detailMessage(e, 'Could not reassign the review.'));
    } finally {
      setReassigning(false);
    }
  };

  // `kind` is passed explicitly by the send-back button, which fires without a
  // panel: reading `panel` there would read the state before React commits it.
  const runPanelAction = async (kind: 'approve' | 'send_back' | null = panel) => {
    if (busy || !kind) return;
    setBusy(true);
    setActionError(null);
    try {
      if (kind === 'approve') {
        const res = await communications.approveReview(threadId, note.trim() || undefined);
        toast({ title: 'Report approved', description: res.status_label });
      } else {
        const res = await communications.sendBackReview(threadId, note.trim());
        // The review is reassigned to the report's owner, not left unassigned —
        // name them, since the reviewer is handing the work to a person.
        const back = data?.owner?.full_name;
        toast({
          title: back ? `Sent back to ${back}` : 'Sent back to the creator',
          description: res.status_label,
        });
      }
      setPanel(null);
      setNote('');
      await load();
      onChanged?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setActionError(detailMessage(e, 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const report = data?.report;
  const assignment = data?.assignment ?? null;
  // The person is the identity; `label` is the authority they sign off as
  // ("Board Chairman"), so it must not stand in for their name.
  const assignedName = assignment ? (assignment.full_name || assignment.label) : null;
  const canAct = data?.can_act ?? false;
  // Removed from the thread → read the record, add nothing to it. can_act
  // already folds in the removal, so the approve/reassign buttons need nothing.
  // No assignment means nobody was asked to review this — the screen is here to
  // be read. The reviewer furniture (the brief, the comment controls, the
  // assignment/comments rail) is all about a review that isn't happening.
  const viewOnly = !data?.assignment;
  const canComment = !viewOnly && (data?.can_comment ?? true);
  const removedAt = data?.removed_at ?? null;
  const canApprove = data?.can_approve ?? false;
  // The review payload's section list is earnings-only on the backend — it comes
  // back empty for a quarterly report even when the report is fully assembled,
  // which rendered the whole screen as "no generated sections yet". Fall back to
  // the sections we already fetched for the bodies. Comments key off
  // section_code either way, so posting and grouping are unaffected.
  const allSections: ReviewSection[] = data?.sections?.length
    ? data.sections
    : Object.values(bodies)
        .sort((a, b) => a.display_order - b.display_order)
        .map((s, i) => ({ id: s.section_code, order: i + 1, title: s.title, type: s.mode }));
  // Quarterly renders as the assembled document: cover as its own page, so it
  // drops out of the numbered body list exactly as AssembledReportPage does.
  // Both assemble into a real document — cover as its own page, prose and
  // tables through the quarterly renderer — so they render the same way. Board
  // content is the one difference: it's Markdown, and needs parsing.
  const isBoard = BOARD.includes(reportType ?? '');
  // Annual too: what the reviewer signs off is the assembled report, so it
  // renders as one — cover as its own page, prose typeset down the page —
  // rather than as a stack of cards.
  const isDocument = reportType === QUARTERLY || isBoard || reportType === ANNUAL;
  // The board cover's code is BR01, which the quarterly /cover/i test misses —
  // it would then render as an empty body section under the cover CoverRenderer
  // already drew. Use the board's own detector for board reports.
  const sections = isDocument
    ? allSections.filter((s) => {
        if (isBoard) {
          return !isBoardCoverSection({ section_code: s.id, content: bodies[s.id]?.content });
        }
        // A cycle's contents page is generated at export from the sections
        // themselves — as a section here it is an empty card in the middle of
        // the document.
        if (reportType === ANNUAL && isTableOfContentsSection(s.id)) return false;
        return !isCoverSection({ section_code: s.id });
      })
    : allSections;
  // Once the report is approved (or otherwise finished) the review is over —
  // reassign / request-changes no longer make sense even though the backend
  // still reports can_act. Gate the reviewer actions on the review being open.
  const FINISHED_STATUSES = ['approved', 'locked', 'published', 'complete', 'completed'];
  const reviewClosed = !!report && FINISHED_STATUSES.includes(report.status);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ alignItems: 'stretch', justifyContent: 'stretch', padding: 10 }}
    >
      <div
        className="modal-content"
        style={{
          width: '100%',
          maxWidth: 'none',
          height: '100%',
          maxHeight: 'none',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: '1px solid #ECEEF8' }}>
          <button
            type="button"
            onClick={onBack ?? onClose}
            aria-label="Back to thread"
            style={{
              flexShrink: 0,
              width: 32,
              height: 32,
              borderRadius: 9,
              border: '1.5px solid #E5E7EF',
              background: '#fff',
              color: '#5A6080',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              flexShrink: 0,
              background: '#EDEAFB',
              color: '#5B34D6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ICON_SHARE}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.2px' }}>
              {viewOnly ? report?.title ?? 'Report' : 'Review report'}
            </div>
            <div style={{ fontSize: 12, color: '#8890AE', marginTop: 1 }}>
              {viewOnly ? (
                report?.type_label ?? 'Read-only'
              ) : !assignedName ? (
                'Unassigned'
              ) : assignment?.is_you ? (
                <>
                  Reviewing as <span style={{ fontWeight: 800, color: '#5A6080' }}>{assignedName}</span>
                </>
              ) : (
                // You're not the assignee — don't imply you are. Name who is.
                <>
                  Viewing · assigned to <span style={{ fontWeight: 800, color: '#5A6080' }}>{assignedName}</span>
                </>
              )}
            </div>
          </div>
          {report && (() => {
            const pill = statusPill(report.status, report.status_label);
            return (
              <span
                style={{
                  flexShrink: 0,
                  padding: '5px 13px',
                  borderRadius: 20,
                  background: pill.bg,
                  color: pill.color,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {pill.text}
              </span>
            );
          })()}
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div className="proc-ring" style={{ width: 34, height: 34, borderWidth: 3 }} />
            <div style={{ fontSize: 12, color: '#9BA3C4', fontWeight: 600 }}>Loading review…</div>
          </div>
        ) : error ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <div style={{ fontSize: 13, color: '#DC2626' }}>{error}</div>
            <button type="button" className="btn bs" onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: viewOnly ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 340px',
            }}
          >
            {/* Report + sections */}
            <div style={{ overflowY: 'auto', padding: '18px 24px 24px', background: '#F4F5FA', minWidth: 0 }}>
              {/* Reviewing instructions, so only where a review is happening.
                  The exception is the removal notice: someone reading a thread
                  they were taken out of needs to know why it is read-only. */}
              {(!viewOnly || removedAt) && (
              <div
                style={{
                  padding: '13px 16px',
                  borderRadius: 10,
                  background: '#EFEDFC',
                  fontSize: 12.5,
                  color: '#4A5170',
                  lineHeight: 1.6,
                  marginBottom: 16,
                }}
              >
                {canComment ? (
                  <>
                    Read the report below. Click <strong>Add comment</strong> on any section to leave a note or
                    requested change. When you're done, approve it or send it back to the creator.
                  </>
                ) : (
                  <>
                    You were removed from this conversation
                    {removedAt ? ` on ${formatRemovedOn(removedAt)}` : ''}. You can read what was said up to then.
                  </>
                )}
              </div>
              )}

              {/* The headings come from the review payload, the content from the
                  report's own endpoint — so the content can fail on its own.
                  Say so, rather than letting every section read as unwritten. */}
              {bodyError && Object.keys(bodies).length === 0 && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: 10,
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    fontSize: 12.5,
                    color: '#DC2626',
                    marginBottom: 16,
                  }}
                >
                  Could not load the report content — {bodyError}
                </div>
              )}

              {sections.length === 0 && (
                <div
                  className="card"
                  style={{ padding: '28px 20px', textAlign: 'center', fontSize: 13, color: '#8890AE', marginBottom: 12 }}
                >
                  {canComment
                    ? 'This report has no generated sections yet — leave a comment on the report as a whole below.'
                    : 'This report has no generated sections yet.'}
                </div>
              )}

              {/* Quarterly cover — page 1, same renderer and width the assembled
                  report uses. Skipped until the real header values load. */}
              {isDocument && cover && (
                <div
                  style={{
                    marginBottom: 20,
                    ['--brand-primary' as string]: brand?.primary ?? '#4040C8',
                    ['--brand-secondary' as string]: brand?.secondary ?? '#4040C8',
                  }}
                >
                  <CoverRenderer
                    companyName={cover.companyName}
                    period={cover.period}
                    title={cover.title}
                    preparedOn={cover.preparedOn}
                    brand={brand}
                    templateKey={coverTemplateKey}
                    maxWidth={DOC_WIDTH}
                  />
                </div>
              )}

              {/* The document itself. Quarterly assembles onto one page; the
                  earnings preview keeps a card per section — each matches its
                  own assembled screen. The brand vars drive report-content
                  accents (headings, table headers, figures) in both. */}
              <div
                className={isDocument && sections.length > 0 ? 'card' : undefined}
                style={{
                  ['--brand-primary' as string]: brand?.primary ?? '#4040C8',
                  ['--brand-secondary' as string]: brand?.secondary ?? '#4040C8',
                  ...(isDocument && sections.length > 0
                    ? { padding: '32px 40px', maxWidth: DOC_WIDTH, margin: '0 auto' }
                    : {}),
                }}
              >
              {sections.map((s, i) => {
                const comments = bySection[s.id] ?? [];
                const open = composerFor === s.id;
                // section.id is the earnings section_code verbatim.
                const body = bodies[s.id];
                return (
                  <div key={s.id} id={sectionDomId(s.id)} style={{ marginBottom: isDocument ? 34 : 16, scrollMarginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: isDocument ? 10 : 11, marginBottom: isDocument ? 14 : 10 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          fontWeight: isDocument ? 700 : 800,
                          ...(isDocument
                            ? { fontFamily: MONO, fontSize: 12, color: BRAND }
                            : // EarningsPreviewPage: faint "01", tabular figures.
                              { fontSize: 11, color: '#9BA3C4', fontVariantNumeric: 'tabular-nums' }),
                        }}
                      >
                        {pad2(i + 1)}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontWeight: 800,
                          color: BRAND,
                          ...(isDocument ? { fontSize: 19, lineHeight: 1.25 } : { fontSize: 16 }),
                        }}
                      >
                        {s.title}
                      </span>
                      {comments.length > 0 && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: 18,
                            height: 18,
                            padding: '0 5px',
                            borderRadius: 6,
                            background: '#F1ECFF',
                            color: '#7C3AED',
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          {comments.length}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => (open ? setComposerFor(undefined) : openComposer(s.id))}
                        style={{
                          flexShrink: 0,
                          display: canComment ? 'inline-flex' : 'none',
                          alignItems: 'center',
                          gap: 7,
                          padding: '7px 13px',
                          borderRadius: 9,
                          border: '1.5px solid #E5E7EF',
                          background: '#fff',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: '#4A5170',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span style={{ color: '#7C3AED', display: 'inline-flex' }}>{ICON_COMMENT}</span>
                        {open ? 'Cancel' : 'Add comment'}
                      </button>
                    </div>

                    {/* Section body — paired on section_code. Quarterly reads
                        through the quarterly renderer (same tables and prose the
                        assembled report draws) and sits directly on the document
                        page rather than in its own card. */}
                    <div className={isDocument ? undefined : 'card'} style={isDocument ? undefined : { padding: '18px 22px' }}>
                      {body ? (
                        isDocument ? (
                          <SectionContent section={body} />
                        ) : (
                          <SectionRenderer section={body} coverTemplateKey={coverTemplateKey} />
                        )
                      ) : bodiesLoading ? (
                        <SectionBodySkeleton />
                      ) : (
                        <div style={{ fontSize: 12.5, color: '#9BA3C4', fontStyle: 'italic' }}>
                          {hasBodySource
                            ? "This section hasn't been generated yet."
                            : 'This report keeps no section text — open the report to see its data.'}
                        </div>
                      )}

                      {comments.map((c) => (
                        <CommentRow key={c.id} comment={c} />
                      ))}

                      {open && (
                        <div style={{ marginTop: 12 }}>
                          <textarea
                            className="inp"
                            value={commentBody}
                            onChange={(e) => setCommentBody(e.target.value)}
                            placeholder={`Comment on ${s.title}…`}
                            style={{ minHeight: 68, resize: 'vertical', lineHeight: 1.5 }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                            <button
                              type="button"
                              className="btn bp"
                              style={{ padding: '6px 12px', fontSize: 12, opacity: commentBody.trim() && !postingComment ? 1 : 0.55 }}
                              disabled={!commentBody.trim() || postingComment}
                              onClick={() => void postComment(s.id, s.title)}
                            >
                              {postingComment ? 'Posting…' : 'Post comment'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>

              {/* Report-level comments (section_id: null) */}
              {!viewOnly && (
              <div className="card" style={{ padding: '16px 20px', maxWidth: isDocument ? DOC_WIDTH : undefined, margin: isDocument ? '16px auto 0' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: '#1A1D2E' }}>
                    On the report as a whole
                  </span>
                  {reportLevel.length > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: 18,
                        height: 18,
                        padding: '0 5px',
                        borderRadius: 6,
                        background: '#F1ECFF',
                        color: '#7C3AED',
                        fontSize: 11,
                        fontWeight: 800,
                      }}
                    >
                      {reportLevel.length}
                    </span>
                  )}
                  {canComment && (
                    <button
                      type="button"
                      className="btn bs"
                      style={{ padding: '6px 11px', fontSize: 12 }}
                      onClick={() => (composerFor === null ? setComposerFor(undefined) : openComposer(null))}
                    >
                      {composerFor === null ? 'Cancel' : 'Add comment'}
                    </button>
                  )}
                </div>

                {reportLevel.map((c) => (
                  <CommentRow key={c.id} comment={c} />
                ))}

                {composerFor === null && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      className="inp"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Comment on the report…"
                      style={{ minHeight: 68, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn bp"
                        style={{ padding: '6px 12px', fontSize: 12, opacity: commentBody.trim() && !postingComment ? 1 : 0.55 }}
                        disabled={!commentBody.trim() || postingComment}
                        onClick={() => void postComment(null, null)}
                      >
                        {postingComment ? 'Posting…' : 'Post comment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Right rail — the review's own controls, so it goes with it. */}
            {!viewOnly && (
            <div
              style={{
                borderLeft: '1px solid #ECEEF8',
                overflowY: 'auto',
                padding: '18px 18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              {/* Assignment + reassign */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div style={RAIL_LABEL}>Assignment</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: 'linear-gradient(150deg,#7C5CFF,#5B34D6)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11.5,
                      fontWeight: 800,
                    }}
                  >
                    {assignedName ? initials(assignedName) : '—'}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: '#1A1D2E' }}>
                      {assignedName ?? 'Unassigned'}
                      {assignment?.is_you && ' (you)'}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: '#8890AE' }}>
                      {assignment?.label ? `Current reviewer · ${assignment.label}` : 'Current reviewer'}
                    </span>
                  </span>
                </div>

                {canAct && !reviewClosed && (
                  <>
                    <div style={{ ...RAIL_LABEL, marginTop: 16 }}>Reassign to</div>
                    {members.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: '#8890AE', lineHeight: 1.5 }}>
                        No one in your company has access to this report yet — an admin can grant it
                        in Admin Console.
                      </div>
                    ) : (
                      <>
                    <select
                      className="inp"
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      disabled={reassignLocked}
                      style={{ width: '100%', opacity: reassignLocked ? 0.55 : 1 }}
                    >
                      <option value="">Choose a person…</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name} · {m.display_role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn bs"
                      style={{
                        width: '100%',
                        marginTop: 8,
                        gap: 7,
                        opacity: reassignTo && !reassigning && !reassignLocked ? 1 : 0.55,
                      }}
                      disabled={!reassignTo || reassigning || reassignLocked}
                      onClick={() => void runReassign()}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 12L12 2M8.4 2H12v3.6M5.6 12H2V8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {reassigning ? 'Reassigning…' : 'Reassign review'}
                    </button>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Comments */}
              <div className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ ...RAIL_LABEL, marginBottom: 0 }}>Comments</span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 18,
                      height: 18,
                      padding: '0 5px',
                      borderRadius: 6,
                      background: '#F1ECFF',
                      color: '#7C3AED',
                      fontSize: 11,
                      fontWeight: 800,
                    }}
                  >
                    {allComments.length}
                  </span>
                </div>
                {allComments.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9BA3C4', textAlign: 'center', padding: '18px 6px', lineHeight: 1.5 }}>
                    No comments yet. Click “Add comment” on a section.
                  </div>
                ) : (
                  allComments.map((c) => (
                    <CommentRow
                      key={c.id}
                      comment={c}
                      showSection
                      // Report-level comments have no section to scroll to.
                      onJump={c.section_id ? () => jumpToSection(c.section_id!) : undefined}
                    />
                  ))
                )}
              </div>

              {/* Actions. Order matters: a finished report is "review complete"
                  for everyone (the backend also flips can_act to false), so check
                  that before the not-the-reviewer messaging. */}
              {reviewClosed ? (
                <div
                  style={{
                    marginTop: 'auto',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '13px 15px',
                    borderRadius: 12,
                    background: '#ECFDF3',
                    border: '1px solid #C7EED8',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="10" cy="10" r="8.4" fill="#16A34A" />
                    <path d="M6.4 10.2l2.4 2.4 4.8-4.8" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#15803D' }}>
                      Review complete
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: '#3F9E66', marginTop: 2, lineHeight: 1.5 }}>
                      This report has been {report?.status_label?.toLowerCase() ?? 'approved'}. No further review
                      actions are available.
                    </span>
                  </span>
                </div>
              ) : !canAct ? (
                assignment?.is_you ? (
                  // The payload says this assignment is yours, yet the server withheld
                  // the action gate on an open review — surface that rather than the
                  // generic read-only line.
                  <div style={{ fontSize: 12, color: '#B45309', lineHeight: 1.5, marginTop: 'auto' }}>
                    You're the assigned reviewer, but the review actions aren't available for this
                    report right now. Try reloading — if it persists, ask an admin to re-share it.
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#8890AE', lineHeight: 1.5, marginTop: 'auto' }}>
                    You're viewing this review. Only the assigned reviewer can approve, reassign, or request
                    changes.
                  </div>
                )
              ) : (
                <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {panel && (
                    <div className="card" style={{ padding: '12px 14px' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', marginBottom: 8 }}>
                        {panel === 'approve' ? 'Approve report' : 'Request changes'}
                      </div>
                      <textarea
                        className="inp"
                        value={note}
                        onChange={(e) => {
                          setNote(e.target.value);
                          if (actionError) setActionError(null);
                        }}
                        placeholder={
                          panel === 'approve' ? 'Sign-off note (optional)' : 'What needs to change? (required)'
                        }
                        style={{ minHeight: 76, resize: 'vertical', lineHeight: 1.5 }}
                      />
                      {actionError && (
                        <div style={{ fontSize: 11.5, fontWeight: 600, color: '#DC2626', marginTop: 7 }}>
                          {actionError}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn bs"
                          style={{ flex: 1 }}
                          onClick={() => {
                            setPanel(null);
                            setNote('');
                            setActionError(null);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn bp"
                          style={{
                            flex: 1,
                            opacity: busy ? 0.6 : 1,
                          }}
                          disabled={busy}
                          onClick={() => void runPanelAction()}
                        >
                          {busy ? 'Working…' : panel === 'approve' ? 'Approve' : 'Send back'}
                        </button>
                      </div>
                    </div>
                  )}

                  {!panel && actionError && (
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#DC2626' }}>{actionError}</div>
                  )}

                  {/* The triggers hide while a panel is open — the open panel
                      already carries its own Approve / Send back button. */}
                  {!panel && (
                    <>
                      <button
                        type="button"
                        className="btn bp"
                        style={{
                          width: '100%',
                          gap: 8,
                          padding: '12px 16px',
                          opacity: canApprove ? 1 : 0.5,
                          cursor: canApprove ? 'pointer' : 'not-allowed',
                        }}
                        disabled={!canApprove || reassigning}
                        onClick={() => {
                          setPanel('approve');
                          setNote('');
                          setActionError(null);
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                          <path d="M3.5 8.4l3 3 6-6.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Approve report
                      </button>
                      {!canApprove && (
                        <div style={{ fontSize: 11.5, color: '#8890AE', lineHeight: 1.45 }}>
                          Available once the report is in review.
                        </div>
                      )}

                      <button
                        type="button"
                        className="btn bs"
                        style={{ width: '100%', gap: 8, padding: '12px 16px', opacity: reassigning ? 0.55 : 1 }}
                        disabled={reassigning}
                        // Straight to it: what needs changing is in the section
                        // comments this reviewer has been leaving, and a second
                        // required box only got "see comments" typed into it.
                        onClick={() => {
                          setNote('');
                          setActionError(null);
                          void runPanelAction('send_back');
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M9.5 1.9l2.6 2.6-7 7-3.1.5.5-3.1 7-7z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                        </svg>
                        {/* It goes to the report's creator — nobody is
                            reassigned, the assignment is simply cleared. */}
                        {data?.owner?.full_name
                          ? `Send back to ${data.owner.full_name}`
                          : 'Send back to the creator'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
