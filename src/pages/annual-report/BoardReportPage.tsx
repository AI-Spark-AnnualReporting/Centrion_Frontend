// Board of Directors' Report — the four-step builder at /board-report/:reportId.
//
// Issuer profile → source documents → resolved sections → the report itself.
//
// The registry and the resolver are the server's: the client PATCHes a profile
// and renders whatever `GET /outline` comes back with, including the sections
// that DON'T apply — greying them, with the server's own note explaining why, is
// the reassurance the sections screen exists to give.
//
// Two operations are asynchronous (202 + poll_url): uploading documents and
// producing every section. Both refetch their domain data on each poll tick, so
// extraction status and section status move without a reload.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { ApiError, boardReports, getSectors } from '@/lib/api';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import { Spinner } from '@/components/shared/Spinner';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import { ApproveConfirmDialog } from '@/components/quarterly/ApproveConfirmDialog';
import { DownloadMenu } from '@/components/quarterly/DownloadMenu';
import type { Sector } from '@/types/company';
import type { BrandColors } from '@/types/brand';
import type {
  BoardAssembleResponse,
  BoardCompletion,
  BoardIssuerProfile,
  BoardOutlineSection,
  BoardProfileResponse,
  BoardReportSummary,
  BoardRequirement,
  BoardSection,
  BoardResolution,
  BoardSourceSlot,
  BoardSourcesResponse,
} from '@/types/board';
import {
  BOARD_LAST_STEP,
  BOARD_STEPS,
  boardProduceSummary,
  errorMessage,
  initialStep,
  isBoardCoverSection,
  isBoardExcluded,
  isBoardLocked,
  outlinePayload,
  readCompletionFromError,
  readDuplicateSlots,
  readExistingRunId,
  sameProfile,
  toBoardProduced,
} from './board-helpers';
import {
  ACCENT,
  AMBER,
  BORDER,
  BORDER_SOFT,
  FAINT,
  GREEN,
  INK,
  MONO,
  MUTED,
  Notice,
  ProfileFields,
  RED,
  ResolvedProfilePanel,
  SetupCard,
} from './board-ui';

const BRAND = 'var(--brand-primary, #4040C8)';
const DOC_WIDTH = 820;

const STEPS = [...BOARD_STEPS];

const UPLOAD_MILESTONES = [
  'Uploading your documents',
  'Reading the text and tables',
  'Matching figures to line items',
  'Filing each document against its sections',
];
const PRODUCE_MILESTONES = [
  'Reading your source documents',
  'Drafting the narrative sections',
  'Building the financial statements',
  'Assembling governance tables',
  'Finishing the report',
];
const BOARD_TIPS = [
  'Sections that do not apply to your issuer type stay listed and greyed, so you can see what was left out and why.',
  'Anything carried forward from last year is flagged until you confirm it is still accurate.',
  'You can edit any section by hand afterwards — your edit wins over anything regenerated later.',
];

const STEP_HEADERS = [
  {
    title: 'Issuer profile',
    sub: 'Changing any of this re-resolves the whole outline — which sections apply, and how they read.',
  },
  {
    title: 'Add the source documents',
    sub: 'Each document feeds named sections. Only the documents this issuer actually needs are asked for.',
  },
  {
    title: "What's in, what dropped, what changed",
    sub: 'The registry resolved against your profile. Sections that do not apply stay listed, greyed, with the reason.',
  },
  {
    title: 'Board of Directors report',
    sub: 'Click the pencil on a section to edit it. Approving locks the report and freezes every edit.',
  },
];

const REQ_LABEL: Record<BoardRequirement, string> = {
  M: 'Mandatory',
  O: 'Optional',
  C: 'Conditional',
};
const REQ_CLASS: Record<BoardRequirement, string> = { M: 'b-gn', O: 'b-gy', C: 'b-pp' };

const RESOLUTION_META: Record<BoardResolution, { label: string; cls: string }> = {
  in: { label: 'In', cls: 'b-gn' },
  variant: { label: 'Variant', cls: 'b-am' },
  dropped: { label: 'Dropped', cls: 'b-rd' },
  na: { label: 'N/A', cls: 'b-gy' },
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: FAINT },
  drafting: { label: 'Drafting…', color: ACCENT },
  produced: { label: 'Produced', color: GREEN },
  needs_input: { label: 'Needs input', color: AMBER },
  empty: { label: 'No data', color: FAINT },
  locked: { label: 'Locked', color: GREEN },
};

// ─── page ─────────────────────────────────────────────────────────────────────

export default function BoardReportPage() {
  const { reportId = '' } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  // Set by the setup page when it has just created this report — the profile was
  // answered there, so skip straight to Sources instead of asking again.
  const startAtStep = (useLocation().state as { startAtStep?: number } | null)?.startAtStep ?? null;
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const [summary, setSummary] = useState<BoardReportSummary | null>(null);
  const [saved, setSaved] = useState<BoardIssuerProfile | null>(null);
  const [draft, setDraft] = useState<BoardIssuerProfile | null>(null);
  const [derived, setDerived] = useState<BoardProfileResponse['derived'] | null>(null);
  const [counts, setCounts] = useState<BoardProfileResponse['counts'] | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [sectors, setSectors] = useState<Sector[] | null>(null);

  const [sources, setSources] = useState<BoardSourcesResponse | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [uploadRun, setUploadRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  // Files picked but not yet sent, keyed by slot name.
  const [staged, setStaged] = useState<Record<string, File>>({});
  // Slots the server rejected as holding the same document — highlighted so the
  // operator can see which rows to fix.
  const [dupeSlots, setDupeSlots] = useState<string[]>([]);
  // Every section with its content, status, provenance and feeder — the body of
  // step 4. /assemble covers only produced sections, so it can't show what's
  // still missing or why.
  const [sections, setSections] = useState<BoardSection[]>([]);

  const [outline, setOutline] = useState<BoardOutlineSection[]>([]);
  const [showExcluded, setShowExcluded] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const [produceRun, setProduceRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [produceError, setProduceError] = useState<string | null>(null);

  const [assembled, setAssembled] = useState<BoardAssembleResponse | null>(null);
  const [completion, setCompletion] = useState<BoardCompletion | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<{ code: string; message: string } | null>(null);

  const [approveOpen, setApproveOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const locked = isBoardLocked(summary?.status);
  const period = summary?.period ?? '';
  const brand: BrandColors | null = assembled?.brand ?? assembled?.cover?.brand ?? null;

  // ── refetchers ──
  const refetchOutline = useCallback(async () => {
    if (!reportId) return;
    const res = await boardReports.getOutline(reportId);
    setOutline(res.sections ?? []);
    setCounts(res.counts);
  }, [reportId]);

  const refetchSources = useCallback(async () => {
    if (!reportId) return;
    setSources(await boardReports.getSources(reportId));
  }, [reportId]);

  const refetchCompletion = useCallback(async () => {
    if (!reportId) return;
    setCompletion(await boardReports.getCompletion(reportId));
  }, [reportId]);

  const refetchAssembled = useCallback(async () => {
    if (!reportId) return;
    // /sections is the body — every section, with status, provenance and feeder.
    // /assemble supplies the cover and brand, and is what the exporter renders.
    const [secs, asm] = await Promise.all([
      boardReports.getSections(reportId),
      boardReports.getAssemble(reportId).catch(() => null),
    ]);
    setSections(secs.sections ?? []);
    if (asm) setAssembled(asm);
  }, [reportId]);

  // ── bootstrap ──
  // Everything the four steps need, in one round trip. /assemble is the
  // exception — it's the heavy one and is invalid before anything is produced.
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    setLoading(true);
    setFatal(null);

    Promise.all([
      boardReports.getProfile(reportId),
      boardReports.getOutline(reportId),
      boardReports.getSources(reportId),
      boardReports.getCompletion(reportId).catch(() => null),
      companyId ? boardReports.listReports(companyId).catch(() => null) : Promise.resolve(null),
      getSectors().catch(() => [] as Sector[]),
    ])
      .then(([prof, out, src, comp, list, sectorList]) => {
        if (cancelled) return;
        setSaved(prof.issuer_profile);
        setDraft(prof.issuer_profile);
        setDerived(prof.derived);
        setCounts(prof.counts ?? out.counts);
        setOutline(out.sections ?? []);
        setSources(src);
        setCompletion(comp);
        setSectors(sectorList);
        const found = list?.reports?.find((r) => r.report_id === reportId) ?? null;
        setSummary(found);
        if (!bootstrappedRef.current) {
          bootstrappedRef.current = true;
          setStep(startAtStep ?? initialStep(found, src, out.sections ?? []));
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFatal(
          err instanceof ApiError && err.status === 404
            ? 'That board report does not exist, or belongs to another company.'
            : errorMessage(err, 'Could not load this board report.'),
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reportId, companyId, startAtStep]);

  // Load the document when we land on the report step. Guarded on "already
  // have it" rather than "have tried once", so a failed first attempt retries
  // when the operator comes back instead of stranding them on the empty state.
  // A produce run refetches on its own when it finishes.
  const bodyLoadingRef = useRef(false);
  useEffect(() => {
    if (step !== BOARD_LAST_STEP || loading || fatal) return;
    if (sections.length > 0 || bodyLoadingRef.current) return;
    bodyLoadingRef.current = true;
    void refetchAssembled()
      .catch(() => {
        /* nothing produced yet — the step renders its own empty state */
      })
      .finally(() => {
        bodyLoadingRef.current = false;
      });
  }, [step, loading, fatal, sections.length, refetchAssembled]);

  useEffect(() => {
    if (!savedCode) return;
    const t = setTimeout(() => setSavedCode(null), 2000);
    return () => clearTimeout(t);
  }, [savedCode]);

  useEffect(() => () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
  }, []);

  // ── upload polling ──
  // The hook has no completion callback, so this ref-guarded effect does the
  // work: refetching sources every tick is what makes extraction_status move.
  const upload = usePipelinePoll(uploadRun?.run_id ?? null, uploadRun?.poll_url ?? null);
  useEffect(() => {
    if (!uploadRun) return;
    void refetchSources().catch(() => {});
    if (upload.state.phase === 'running' || upload.state.phase === 'idle') return;
    setUploadRun(null);
    // Always resolve the banner on a finished run: leaving a previous attempt's
    // error in state makes a successful upload look like it failed.
    setSourcesError(
      upload.state.phase === 'completed'
        ? null
        : upload.state.phase === 'timeout'
          ? 'Still reading your documents — refresh in a moment to see the result.'
          : (upload.state.run?.error_message ?? 'Reading the documents failed. Try uploading again.'),
    );
    // Slot contents feed the outline's per-section status.
    void refetchOutline().catch(() => {});
  }, [
    upload.state.phase,
    upload.state.elapsedMs,
    upload.state.run?.error_message,
    uploadRun,
    refetchSources,
    refetchOutline,
  ]);

  // ── produce polling ──
  const produce = usePipelinePoll(produceRun?.run_id ?? null, produceRun?.poll_url ?? null);
  useEffect(() => {
    if (!produceRun) return;
    void refetchOutline().catch(() => {});
    if (produce.state.phase === 'running' || produce.state.phase === 'idle') return;
    setProduceRun(null);
    setProduceError(
      produce.state.phase === 'completed'
        ? null
        : produce.state.phase === 'timeout'
          ? 'Still generating — refresh in a moment to see the result.'
          : (produce.state.run?.error_message ?? 'Generation failed. Try again.'),
    );
    void Promise.all([refetchAssembled(), refetchCompletion()]).catch(() => {});
    setStep(BOARD_LAST_STEP);
  }, [
    produce.state.phase,
    produce.state.elapsedMs,
    produce.state.run?.error_message,
    produceRun,
    refetchOutline,
    refetchAssembled,
    refetchCompletion,
  ]);

  // ── step 1 ──
  const setField = useCallback(<K extends keyof BoardIssuerProfile>(key: K, value: BoardIssuerProfile[K]) => {
    setDraft((p) => (p ? { ...p, [key]: value } : p));
  }, []);

  // PATCH on Continue, never per pill: the server re-resolves and re-saves the
  // whole outline on every profile change, so a per-click PATCH would discard
  // the operator's include/order choices each time they touched a flag.
  const continueFromProfile = useCallback(async () => {
    if (!draft) return;
    if (sameProfile(draft, saved)) {
      setStep(2);
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const res = await boardReports.patchProfile(reportId, draft);
      setSaved(res.issuer_profile);
      setDraft(res.issuer_profile);
      setDerived(res.derived);
      setCounts(res.counts);
      // Both: the outline is re-resolved, and the slot list derives from the
      // issuer type (a corporate is asked for 10 documents, a bank 11).
      await Promise.all([refetchOutline(), refetchSources()]);
      setStep(2);
    } catch (err: unknown) {
      setProfileError(errorMessage(err, 'Could not save the issuer profile.'));
    } finally {
      setProfileSaving(false);
    }
  }, [draft, saved, reportId, refetchOutline, refetchSources]);

  // ── step 2 ──
  // Files are staged locally as they're picked, across as many slots as the
  // operator likes, and sent as ONE batch. Uploading on pick would 409 on the
  // second slot — only one job may run per report.
  const stageFile = useCallback((slot: string, file: File | null) => {
    setSourcesError(null);
    setDupeSlots([]);
    setStaged((prev) => {
      const next = { ...prev };
      if (file) next[slot] = file;
      else delete next[slot];
      return next;
    });
  }, []);

  const processDocuments = useCallback(async () => {
    const batch = Object.entries(staged).map(([slot, file]) => ({ slot, file }));
    if (!batch.length) return;
    setSourcesError(null);
    setDupeSlots([]);
    try {
      const handle = await boardReports.uploadSources(reportId, batch);
      setUploadRun({ run_id: handle.run_id, poll_url: handle.poll_url });
      setStaged({});
    } catch (err: unknown) {
      // If another tab already started a job, adopt it rather than showing an
      // error the operator can't act on.
      const existing = readExistingRunId(err);
      if (existing) {
        setUploadRun({ run_id: existing, poll_url: `/api/v1/agent_runs/${existing}` });
        return;
      }
      // The same file attached to two slots — name the rows rather than making
      // the operator re-check all of them.
      const dupes = readDuplicateSlots(err);
      if (dupes) {
        setDupeSlots(dupes.slots);
        setSourcesError(dupes.message);
        return;
      }
      setSourcesError(errorMessage(err, 'Could not process those documents.'));
    }
  }, [reportId, staged]);

  const handleRemoveDocument = useCallback(
    async (documentId: string) => {
      setSourcesError(null);
      try {
        await boardReports.deleteSourceDocument(reportId, documentId);
        await refetchSources();
      } catch (err: unknown) {
        setSourcesError(errorMessage(err, 'Could not remove that document.'));
      }
    },
    [reportId, refetchSources],
  );

  // ── step 3 ──
  // Debounced PUT with a latest-wins guard, mirroring the quarterly outline.
  // On failure, refetch: a 422 means nothing was saved, so the server is truth.
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
            void refetchOutline().catch(() => {});
          });
      }, 700);
    },
    [reportId, refetchOutline],
  );

  const toggleSection = useCallback(
    (code: string) => {
      setOutline((prev) => {
        const next = prev.map((s) =>
          s.section_code === code ? { ...s, included: !s.included } : s,
        );
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

  const handleGenerate = useCallback(async () => {
    setProduceError(null);
    try {
      const handle = await boardReports.produceAll(reportId);
      setProduceRun({ run_id: handle.run_id, poll_url: handle.poll_url });
    } catch (err: unknown) {
      const existing = readExistingRunId(err);
      if (existing) {
        setProduceRun({ run_id: existing, poll_url: `/api/v1/agent_runs/${existing}` });
        return;
      }
      setProduceError(errorMessage(err, 'Could not start generating the report.'));
    }
  }, [reportId]);

  // ── step 4 ──
  const handleSaveContent = useCallback(
    async (code: string, content: string) => {
      setSavingCode(code);
      setEditError(null);
      try {
        const res = await boardReports.patchSectionContent(reportId, code, content);
        const next = res?.content ?? content;
        setSections((prev) =>
          prev.map((s) =>
            s.section_code === code
              ? { ...s, content: next, status: 'produced', provenance: 'updated' }
              : s,
          ),
        );
        setEditingCode(null);
        setSavedCode(code);
        void refetchCompletion().catch(() => {});
      } catch (err: unknown) {
        setEditError(errorMessage(err, 'Could not save. Please try again.'));
      } finally {
        setSavingCode(null);
      }
    },
    [reportId, refetchCompletion],
  );

  const handleProduceSection = useCallback(
    async (code: string, regenerate = false) => {
      setBusyCode(code);
      setSectionError(null);
      try {
        // `cached: true` means nothing it depends on changed — a success, not
        // something to retry.
        await boardReports.produceSection(reportId, code, regenerate);
        await Promise.all([refetchAssembled(), refetchOutline(), refetchCompletion()]);
      } catch (err: unknown) {
        // 422 = this section has no producer yet. Say so on the section rather
        // than hiding it.
        setSectionError({
          code,
          message:
            err instanceof ApiError && err.status === 422
              ? 'No producer for this section yet — it will stay empty until the backend adds one.'
              : errorMessage(err, 'Could not produce this section.'),
        });
      } finally {
        setBusyCode(null);
      }
    },
    [reportId, refetchAssembled, refetchOutline, refetchCompletion],
  );

  const handleConfirmSection = useCallback(
    async (code: string) => {
      setBusyCode(code);
      setSectionError(null);
      try {
        await boardReports.confirmSection(reportId, code);
      } catch {
        /* 409 means it wasn't carried forward — the flag was stale, refetch below */
      } finally {
        await Promise.all([refetchOutline(), refetchCompletion()]).catch(() => {});
        setBusyCode(null);
      }
    },
    [reportId, refetchOutline, refetchCompletion],
  );

  const handleApprove = useCallback(async () => {
    setApproving(true);
    setApproveError(null);
    try {
      await boardReports.approve(reportId);
      setSummary((prev) => (prev ? { ...prev, status: 'approved' } : prev));
      setApproveOpen(false);
      setEditingCode(null);
      void refetchCompletion().catch(() => {});
    } catch (err: unknown) {
      // The 409 body IS the completion payload, so the dialog can list exactly
      // what's missing without a second request.
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
  }, [reportId, refetchCompletion]);

  // ── render ──
  const header = STEP_HEADERS[step - 1];
  const onLastStep = step === BOARD_LAST_STEP;
  const busy = !!uploadRun || !!produceRun;
  // Has this report already been written? Drives whether step 3 offers
  // "Generate report" or "View report".
  const anyProduced = outline.some((s) => s.status === 'produced' || s.status === 'locked');
  const stagedCount = Object.keys(staged).length;
  // Once the report has been written, its inputs are read-only: swapping a
  // source document or re-ticking a section would silently leave the produced
  // content describing something else. Regenerate is the way back.
  const inputsLocked = locked || anyProduced;
  // Slots the server marked required — at least one mandatory section depends on
  // each. Producing without them yields sections that can only say what is
  // missing, so the flow stops here until they are in.
  const missingRequired = (sources?.slots ?? []).filter(
    (slot) => slot.required && slot.status !== 'received',
  );

  const titleByCode = useMemo(
    () => new Map(outline.map((s) => [s.section_code, s.title])),
    [outline],
  );

  if (loading) {
    return (
      <div>
        <div className="card" style={{ padding: '4px 20px 0', marginBottom: 16 }}>
          <QuarterlyReportStepper activeStep={1} steps={STEPS} />
        </div>
        <div className="card">
          <Spinner pad={80} />
        </div>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="card" role="alert" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>{fatal}</div>
        <button className="btn bs" style={{ marginTop: 14 }} onClick={() => navigate('/board-report')}>
          Back to board reports
        </button>
      </div>
    );
  }

  const actions = (
    <div
      className="print-hide"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 18,
        paddingTop: 16,
        borderTop: `1px solid ${BORDER_SOFT}`,
      }}
    >
      <button
        className="btn bs"
        onClick={() => (step === 1 ? navigate('/board-report') : setStep((s) => s - 1))}
        style={{ padding: '10px 18px', fontSize: 13 }}
      >
        ← {step === 1 ? 'Board reports' : STEPS[step - 2]}
      </button>
      {step === 2 ? (
        <span style={{ fontSize: 11.5, color: missingRequired.length > 0 ? AMBER : FAINT }}>
          {stagedCount > 0
            ? `${stagedCount} attached, not yet processed`
            : missingRequired.length > 0
              ? `${missingRequired.length} required document${missingRequired.length === 1 ? '' : 's'} still needed`
              : 'All required documents are in.'}
        </span>
      ) : (
        counts && (
          <span style={{ fontSize: 11.5, color: FAINT }}>
            {counts.included} sections · {counts.mandatory} mandatory · {counts.dropped} dropped ·{' '}
            {counts.na} N/A
          </span>
        )
      )}
      {step === 1 ? (
        <button
          className="btn bp"
          onClick={continueFromProfile}
          disabled={profileSaving || locked}
          style={{ padding: '11px 24px', fontSize: 13, fontWeight: 700, opacity: profileSaving || locked ? 0.55 : 1 }}
        >
          {profileSaving ? 'Saving…' : 'Continue'}
        </button>
      ) : step === 2 ? (
        // One primary action: send the attached files if there are any, else
        // move on — and only move on once every required document is in.
        <button
          className="btn bp"
          onClick={stagedCount > 0 ? processDocuments : () => setStep(3)}
          disabled={stagedCount === 0 && missingRequired.length > 0}
          title={
            stagedCount === 0 && missingRequired.length > 0
              ? `Still needed: ${missingRequired.map((slot) => slot.slot).join(', ')}`
              : undefined
          }
          style={{
            padding: '11px 24px',
            fontSize: 13,
            fontWeight: 700,
            opacity: stagedCount === 0 && missingRequired.length > 0 ? 0.55 : 1,
            cursor: stagedCount === 0 && missingRequired.length > 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {stagedCount > 0
            ? `Process ${stagedCount} document${stagedCount === 1 ? '' : 's'}`
            : 'Continue'}
        </button>
      ) : step === 3 ? (
        // Once the report has been generated, Continue means "go read it" —
        // regenerating is a separate, explicit choice. Making the only action
        // "Generate report" would re-run the whole pipeline every time someone
        // stepped back to check the section list.
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {anyProduced && !locked && (
            <button
              className="btn bs"
              onClick={handleGenerate}
              disabled={busy}
              title="Re-run every section from your source documents"
              style={{ padding: '10px 18px', fontSize: 13 }}
            >
              Regenerate all
            </button>
          )}
          <button
            className="btn bp"
            onClick={anyProduced ? () => setStep(BOARD_LAST_STEP) : handleGenerate}
            disabled={busy || (locked && !anyProduced)}
            title={locked && !anyProduced ? 'This report is approved and locked.' : undefined}
            style={{
              padding: '11px 24px',
              fontSize: 13,
              fontWeight: 700,
              opacity: busy || (locked && !anyProduced) ? 0.55 : 1,
            }}
          >
            {anyProduced ? 'View report →' : 'Generate report'}
          </button>
        </div>
      ) : (
        <button
          className="btn bp"
          onClick={() => setStep((s) => Math.min(s + 1, BOARD_LAST_STEP))}
          disabled={onLastStep}
          style={{ padding: '11px 24px', fontSize: 13, fontWeight: 700, opacity: onLastStep ? 0.55 : 1 }}
        >
          Continue
        </button>
      )}
    </div>
  );

  // Both long jobs take over the screen with the app's standard AI loader, the
  // same one the quarterly and earnings flows use. Progress is real: it comes
  // from the run's own output_summary, not a simulated climb.
  if (uploadRun || produceRun) {
    const s = boardProduceSummary(produce.state.run);
    const uploading = !!uploadRun;
    const pct = s && s.total > 0 ? Math.round((s.produced / s.total) * 100) : 0;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1400, overflowY: 'auto' }}>
        <AiLoadingScreen
          title={uploading ? 'Reading your documents' : 'Writing your board report'}
          subtitle={
            uploading
              ? 'Extracting the figures, tables and governance data your sections need.'
              : 'Each section is drafted from the documents you provided.'
          }
          milestones={uploading ? UPLOAD_MILESTONES : PRODUCE_MILESTONES}
          tips={BOARD_TIPS}
          indeterminate={uploading || !s}
          controlledProgress={uploading || !s ? undefined : pct}
          progressCaption={
            uploading
              ? 'Reading and extracting — this usually takes a minute or two.'
              : s
                ? `${s.produced} of ${s.total} sections${s.skipped ? ` · ${s.skipped} skipped (no producer yet)` : ''}${s.failed ? ` · ${s.failed} failed` : ''}`
                : 'Starting…'
          }
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ['--brand-primary' as string]: brand?.primary ?? ACCENT,
        ['--brand-secondary' as string]: brand?.secondary ?? ACCENT,
      }}
    >
      <div className="print-hide">
        <div className="card" style={{ padding: '4px 20px 0', marginBottom: 16 }}>
          <QuarterlyReportStepper activeStep={step} steps={STEPS} />
        </div>
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>{header.title}</h1>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{header.sub}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {period && <span className="badge b-gy" style={{ fontFamily: MONO }}>{period}</span>}
            {locked && <span className="badge b-gn">● Approved &amp; Locked</span>}
          </div>
        </div>
      </div>


      {!produceRun && step === 1 && draft && (
        <SetupCard title="Issuer profile" sub="The answers here resolve which sections the report carries">
          <ProfileStep
            profile={draft}
            derived={derived}
            counts={counts}
            sectors={sectors}
            locked={locked}
            error={profileError}
            dirty={!sameProfile(draft, saved)}
            onChange={setField}
          />
          {actions}
        </SetupCard>
      )}

      {!produceRun && step === 2 && (
        <SetupCard title="Source documents" sub="Only the documents this issuer's sections actually need">
          <SourcesStep
            sources={sources}
            error={sourcesError}
            staged={staged}
            dupeSlots={dupeSlots}
            locked={inputsLocked}
            generated={anyProduced && !locked}
            onStage={stageFile}
            onRemove={handleRemoveDocument}
          />
          {actions}
        </SetupCard>
      )}

      {!produceRun && step === 3 && (
        <SetupCard title="Resolved sections" sub="The registry resolved against your issuer profile">
          <OutlineStep
            outline={outline}
            counts={counts}
            showExcluded={showExcluded}
            saveState={saveState}
            locked={inputsLocked}
            generated={anyProduced && !locked}
            error={produceError}
            dragOver={dragOver}
            onToggleExcluded={() => setShowExcluded((v) => !v)}
            onToggle={toggleSection}
            onDragStart={(i) => (dragIndexRef.current = i)}
            onDragOver={setDragOver}
            onDrop={(i) => {
              const from = dragIndexRef.current;
              dragIndexRef.current = null;
              setDragOver(null);
              if (from != null) reorder(from, i);
            }}
          />
          {actions}
        </SetupCard>
      )}

      {!produceRun && onLastStep && (
        <>
          <ReportStep
            assembled={assembled}
            sections={sections}
            outline={outline}
            completion={completion}
            locked={locked}
            editingCode={editingCode}
            savingCode={savingCode}
            savedCode={savedCode}
            editError={editError}
            busyCode={busyCode}
            sectionError={sectionError}
            onEdit={(c) => {
              setEditError(null);
              setEditingCode(c);
            }}
            onSave={handleSaveContent}
            onProduceSection={handleProduceSection}
            onConfirmSection={handleConfirmSection}
            onRetry={() => void refetchAssembled().catch(() => {})}
          />
          <div className="card" style={{ padding: '2px 20px 18px', marginTop: 16 }}>
            <div
              className="print-hide"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 18,
                paddingTop: 16,
                borderTop: `1px solid ${BORDER_SOFT}`,
                flexWrap: 'wrap',
              }}
            >
              <button className="btn bs" onClick={() => setStep(3)} style={{ padding: '10px 18px', fontSize: 13 }}>
                ← Sections
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button
                  className="btn bs"
                  onClick={() => window.print()}
                  style={{ padding: '10px 18px', fontSize: 13 }}
                >
                  Print
                </button>
                <DownloadMenu
                  companyId={companyId}
                  reportId={reportId}
                  label="Export"
                  disabled={!assembled}
                  onDownload={(fmt) =>
                    boardReports.downloadExport(reportId, fmt, `board-report-${period || 'draft'}`)
                  }
                />
                {!locked && (
                  <button
                    className="btn bp"
                    // Gated on the server's own readiness flag. The strip above
                    // says what is outstanding, and each chip jumps to it.
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
              </div>
            </div>
          </div>
        </>
      )}

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
  );
}

// ─── approval blockers ────────────────────────────────────────────────────────

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

// ─── step 1 · issuer profile ──────────────────────────────────────────────────

function ProfileStep({
  profile,
  derived,
  counts,
  sectors,
  locked,
  error,
  dirty,
  onChange,
}: {
  profile: BoardIssuerProfile;
  derived: BoardProfileResponse['derived'] | null;
  counts: BoardProfileResponse['counts'] | null;
  sectors: Sector[] | null;
  locked: boolean;
  error: string | null;
  dirty: boolean;
  onChange: <K extends keyof BoardIssuerProfile>(key: K, value: BoardIssuerProfile[K]) => void;
}) {
  return (
    <div>
      {locked && <Notice tone="green">This report is approved and locked — the profile is read-only.</Notice>}
      {error && <Notice tone="red">{error}</Notice>}
      {dirty && !locked && (
        <Notice tone="amber">
          Changing the profile re-resolves the whole outline — any sections you switched on or
          reordered will be reset.
        </Notice>
      )}

      <ProfileFields profile={profile} sectors={sectors} disabled={locked} onChange={onChange} />

      <ResolvedProfilePanel profile={profile} regulator={derived?.regulator} counts={counts} />
    </div>
  );
}

// ─── step 2 · source documents ────────────────────────────────────────────────

function SourcesStep({
  sources,
  error,
  staged,
  dupeSlots,
  locked,
  generated,
  onStage,
  onRemove,
}: {
  sources: BoardSourcesResponse | null;
  error: string | null;
  staged: Record<string, File>;
  dupeSlots: string[];
  locked: boolean;
  generated: boolean;
  onStage: (slot: string, file: File | null) => void;
  onRemove: (documentId: string) => void;
}) {
  if (!sources) return <Spinner pad={40} />;
  const { received, total, slots } = sources;
  const missingRequired = slots.filter((slot) => slot.required && slot.status !== 'received');

  return (
    <div>
      {error && <Notice tone="red">{error}</Notice>}
      {generated && (
        <Notice tone="green">
          This report has been generated, so its source documents are read-only. Use{' '}
          <b>Regenerate all</b> on the Sections step to rebuild it.
        </Notice>
      )}
      {!generated && missingRequired.length > 0 && (
        <Notice tone="amber">
          Every required document is needed before the report can be built —{' '}
          <b>{missingRequired.map((slot) => slot.slot).join(', ')}</b>{' '}
          {missingRequired.length === 1 ? 'is' : 'are'} still outstanding.
        </Notice>
      )}

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div className="uhead">
          <span className="uhead-title">
            Documents
            <span className="uhead-count">
              {received}/{total}
            </span>
          </span>
          <span style={{ fontSize: 11, color: received < total ? AMBER : '#16A34A', fontWeight: 700 }}>
            {received < total ? `${total - received} pending` : 'All received'}
          </span>
        </div>

        {slots.map((slot) => (
          <SlotRow
            key={slot.slot}
            slot={slot}
            stagedFile={staged[slot.slot] ?? null}
            duplicate={dupeSlots.includes(slot.slot)}
            disabled={locked}
            onStage={onStage}
            onRemove={onRemove}
          />
        ))}
      </div>

    </div>
  );
}

function SlotRow({
  slot,
  stagedFile,
  duplicate,
  disabled,
  onStage,
  onRemove,
}: {
  slot: BoardSourceSlot;
  stagedFile: File | null;
  duplicate: boolean;
  disabled: boolean;
  onStage: (slot: string, file: File | null) => void;
  onRemove: (documentId: string) => void;
}) {
  const feeds = slot.feeds.map((f) => f.section_code).join(', ');

  return (
    <div
      style={{
        padding: '13px 18px',
        borderBottom: `1px solid #F4F5FB`,
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
          {feeds && <div style={{ fontSize: 11, color: FAINT, marginTop: 3 }}>Feeds → {feeds}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {stagedFile ? (
            <>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: ACCENT }}>{stagedFile.name}</span>
              <button className="btn bs bsm" disabled={disabled} onClick={() => onStage(slot.slot, null)}>
                Clear
              </button>
            </>
          ) : (
            <label
              className="btn bs bsm"
              style={{ cursor: disabled ? 'not-allowed' : 'pointer', marginBottom: 0, opacity: disabled ? 0.55 : 1 }}
            >
              {slot.documents.length ? 'Replace file' : 'Attach file'}
              <input
                type="file"
                disabled={disabled}
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onStage(slot.slot, f);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
      </div>

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

// ─── step 3 · resolved sections ───────────────────────────────────────────────

function OutlineStep({
  outline,
  counts,
  showExcluded,
  saveState,
  locked,
  generated,
  error,
  dragOver,
  onToggleExcluded,
  onToggle,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  outline: BoardOutlineSection[];
  counts: BoardProfileResponse['counts'] | null;
  showExcluded: boolean;
  saveState: 'idle' | 'saving' | 'saved';
  locked: boolean;
  generated: boolean;
  error: string | null;
  dragOver: number | null;
  onToggleExcluded: () => void;
  onToggle: (code: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number | null) => void;
  onDrop: (index: number) => void;
}) {
  return (
    <div>
      {error && <Notice tone="red">{error}</Notice>}
      {generated && (
        <Notice tone="green">
          This report has been generated, so the section list is read-only.{' '}
          <b>Regenerate all</b> rebuilds it from your documents.
        </Notice>
      )}

      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
        <div className="uhead">
          <span className="uhead-title">
            Sections<span className="uhead-count">{counts?.included ?? outline.length}</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {saveState !== 'idle' && (
              <span style={{ fontSize: 11, fontWeight: 700, color: saveState === 'saving' ? ACCENT : GREEN }}>
                {saveState === 'saving' ? 'Saving…' : 'Saved'}
              </span>
            )}
            <button className="btn bs bsm" onClick={onToggleExcluded}>
              {showExcluded ? 'Hide non-applicable' : 'Show non-applicable'}
            </button>
          </div>
        </div>

        {outline.map((s, i) => {
          const excluded = isBoardExcluded(s);
          if (excluded && !showExcluded) return null;
          // Mandatory sections are force-included server-side, so the checkbox
          // is shown ticked and disabled rather than letting a click visibly
          // revert on the next fetch.
          const mandatory = s.requirement === 'M';
          const draggable = !excluded && !locked;

          return (
            <div
              key={s.section_code}
              draggable={draggable}
              onDragStart={() => draggable && onDragStart(i)}
              onDragOver={(e) => {
                if (!draggable) return;
                e.preventDefault();
                onDragOver(i);
              }}
              onDragLeave={() => onDragOver(null)}
              onDrop={(e) => {
                if (!draggable) return;
                e.preventDefault();
                onDrop(i);
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '11px 18px',
                borderBottom: `1px solid #F4F5FB`,
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
                    disabled={mandatory || locked}
                    onChange={() => onToggle(s.section_code)}
                    title={mandatory ? 'Mandatory — always included' : undefined}
                    style={{ accentColor: ACCENT, cursor: mandatory || locked ? 'not-allowed' : 'pointer' }}
                  />
                )}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: ACCENT, width: 48, flexShrink: 0, paddingTop: 1 }}>
                {s.section_code}
              </span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                  <span className={`badge ${REQ_CLASS[s.requirement]}`} title={REQ_LABEL[s.requirement]}>
                    {s.requirement}
                  </span>
                  {s.data_source && <span className="badge b-tl">{s.data_source}</span>}
                  {s.provenance === 'carried_forward' && <span className="badge b-am">Carried forward</span>}
                </div>
                {/* The server's own explanation of what changed or fell away. */}
                {s.note && (
                  <div style={{ fontSize: 11.5, color: FAINT, fontStyle: 'italic', marginTop: 5 }}>→ {s.note}</div>
                )}
              </div>
              <span
                className={`badge ${RESOLUTION_META[s.resolution]?.cls ?? 'b-gy'}`}
                style={{ flexShrink: 0, marginTop: 2 }}
              >
                {RESOLUTION_META[s.resolution]?.label ?? s.resolution}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── batch produce progress ───────────────────────────────────────────────────

// ─── step 4 · the report ──────────────────────────────────────────────────────

function ReportStep({
  assembled,
  sections,
  outline,
  completion,
  locked,
  editingCode,
  savingCode,
  savedCode,
  editError,
  busyCode,
  sectionError,
  onEdit,
  onSave,
  onProduceSection,
  onConfirmSection,
  onRetry,
}: {
  assembled: BoardAssembleResponse | null;
  sections: BoardSection[];
  outline: BoardOutlineSection[];
  completion: BoardCompletion | null;
  locked: boolean;
  editingCode: string | null;
  savingCode: string | null;
  savedCode: string | null;
  editError: string | null;
  busyCode: string | null;
  sectionError: { code: string; message: string } | null;
  onEdit: (code: string | null) => void;
  onSave: (code: string, content: string) => void;
  onProduceSection: (code: string, regenerate: boolean) => void;
  onConfirmSection: (code: string) => void;
  onRetry: () => void;
}) {
  const byCode = useMemo(() => new Map(outline.map((s) => [s.section_code, s])), [outline]);

  // The cover is drawn by CoverRenderer. `isCoverSection` from the quarterly
  // helpers can't be used — it matches /cover/i on the section_code, and this
  // one is BR01.
  const body = sections
    .filter((s) => s.included && !isBoardExcluded(s) && !isBoardCoverSection(s))
    .slice()
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  if (!sections.length) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK }}>Nothing produced yet</div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>
          Go back to <b>Sections</b> and choose <b>Generate report</b>.
        </div>
        <button className="btn bs bsm" style={{ marginTop: 14 }} onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  const values = (assembled?.cover?.values ?? {}) as Record<string, unknown>;
  const str = (k: string): string | null => (typeof values[k] === 'string' ? (values[k] as string) : null);

  return (
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
          {/* Each chip jumps to the first section holding the report up. */}
          <BlockerChips completion={completion} />
        </div>
      )}

      <div
        className="print-doc"
        style={{ maxWidth: DOC_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        <CoverRenderer
          companyName={str('company_name')}
          period={str('period_label') ?? assembled?.period ?? null}
          title={str('title') ?? 'Board of Directors’ Report'}
          preparedOn={str('prepared_on')}
          brand={assembled?.brand ?? null}
          templateKey={assembled?.cover?.template_key ?? null}
          maxWidth={DOC_WIDTH}
        />

        <div className="card" style={{ padding: '32px 40px', maxWidth: DOC_WIDTH }}>
          {body.map((s) => (
            <ReportSection
              key={s.section_code}
              section={s}
              meta={byCode.get(s.section_code)}
              locked={locked}
              editing={editingCode === s.section_code}
              saving={savingCode === s.section_code}
              saved={savedCode === s.section_code}
              editError={editingCode === s.section_code ? editError : null}
              busy={busyCode === s.section_code}
              error={sectionError?.code === s.section_code ? sectionError.message : null}
              onEdit={onEdit}
              onSave={onSave}
              onProduce={onProduceSection}
              onConfirm={onConfirmSection}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// Amber chips that scroll to the first section in each blocker list.
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

// One section of the document: heading, provenance, and either the content or
// an honest empty state saying exactly what is missing.
function ReportSection({
  section: s,
  meta,
  locked,
  editing,
  saving,
  saved,
  editError,
  busy,
  error,
  onEdit,
  onSave,
  onProduce,
  onConfirm,
}: {
  section: BoardSection;
  meta?: BoardOutlineSection;
  locked: boolean;
  editing: boolean;
  saving: boolean;
  saved: boolean;
  editError: string | null;
  busy: boolean;
  error: string | null;
  onEdit: (code: string | null) => void;
  onSave: (code: string, content: string) => void;
  onProduce: (code: string, regenerate: boolean) => void;
  onConfirm: (code: string) => void;
}) {
  const feeder = s.feeder ?? null;
  const produced = s.status === 'produced' || s.status === 'locked';
  const carried = s.provenance === 'carried_forward' && !s.confirmed;
  // BR13/BR15/BR21 have no generator yet, and `empty` means the section was
  // deliberately omitted — offering Produce on either only ever yields a 422 or
  // an identical empty result.
  const producible = produced || s.status === 'needs_input' || s.status === 'pending';
  const statusMeta = STATUS_LABEL[s.status] ?? { label: s.status, color: FAINT };

  return (
    <section id={`sec-${s.section_code}`} style={{ marginBottom: 34 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: BRAND }}>
          {s.section_code}
        </span>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: BRAND, flex: 1, minWidth: 0, lineHeight: 1.25 }}>
          {s.title}
        </h2>
        {meta?.requirement === 'M' && (
          <span className="badge b-gn print-hide" title="Mandatory">
            M
          </span>
        )}
        {!produced && (
          <span style={{ fontSize: 11, fontWeight: 700, color: statusMeta.color }}>{statusMeta.label}</span>
        )}
        {saved && <span style={{ fontSize: 12, fontWeight: 700, color: GREEN }}>Saved</span>}
        {!locked && produced && !editing && (
          <>
            <button
              type="button"
              className="print-hide btn bs bsm"
              disabled={busy}
              onClick={() => onProduce(s.section_code, true)}
              title="Regenerate this section from its source documents"
            >
              {busy ? 'Working…' : 'Regenerate'}
            </button>
            <button
              type="button"
              className="print-hide"
              onClick={() => onEdit(s.section_code)}
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
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* The safeguard against last year's board list going out as this year's.
          Loud on purpose — the report can't be approved until it's cleared. */}
      {carried && (
        <div
          className="print-hide"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
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
          <span>
            Carried forward{feeder?.carried_forward_from ? ` from ${feeder.carried_forward_from}` : ''} —
            confirm this is still accurate.
          </span>
          {!locked && (
            <button className="btn bs bsm" disabled={busy} onClick={() => onConfirm(s.section_code)}>
              {busy ? 'Confirming…' : 'Confirm'}
            </button>
          )}
        </div>
      )}

      {produced ? (
        <EditableSectionContent
          section={toBoardProduced(s)}
          editing={editing}
          saving={saving}
          error={editError}
          onSave={(content) => onSave(s.section_code, content)}
          onCancel={() => onEdit(null)}
        />
      ) : (
        // Never hidden: an unfilled section is what a reviewer most needs to see,
        // and feeder.message says exactly what it is waiting on.
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 9,
            background: s.status === 'needs_input' ? 'rgba(245,158,11,.08)' : '#FAFBFE',
            border: `1px solid ${s.status === 'needs_input' ? 'rgba(245,158,11,.3)' : BORDER_SOFT}`,
            fontSize: 12.5,
            color: s.status === 'needs_input' ? AMBER : MUTED,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <span>{feeder?.message ?? statusMeta.label}</span>
          {!locked && producible && (
            <button className="btn bs bsm print-hide" disabled={busy} onClick={() => onProduce(s.section_code, false)}>
              {busy ? 'Producing…' : 'Produce'}
            </button>
          )}
        </div>
      )}

      {error && <div style={{ marginTop: 6, fontSize: 11.5, color: RED }}>{error}</div>}

      <Provenance feeder={feeder} />
    </section>
  );
}

// Where a section's content came from — a reviewer has to be able to trace a
// line back to its source document and page.
function Provenance({ feeder }: { feeder: BoardSection['feeder'] }) {
  const citations = feeder?.citations ?? [];
  const note = feeder?.extraction_note;
  if (!citations.length && !note) return null;

  return (
    <div style={{ marginTop: 8, fontSize: 11, color: FAINT, lineHeight: 1.6 }}>
      {note && <div>{note}</div>}
      {citations.length > 0 && (
        <div>
          Source:{' '}
          {citations
            .map((c) => {
              const doc = c.document_name ?? c.document ?? 'document';
              return c.page != null ? `${doc}, p.${c.page}` : doc;
            })
            .join(' · ')}
        </div>
      )}
    </div>
  );
}
