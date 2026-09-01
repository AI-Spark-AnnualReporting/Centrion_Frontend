import { useState, useEffect, useRef, useCallback } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRememberStep, reachedStepNumber } from './earnings-resume';
import { useAuth } from '@/context/AuthContext';
import { earnings, ApiError } from '@/lib/api';
import { startedRun } from '@/lib/run-handle';
import { Spinner } from '@/components/shared/Spinner';
import type { EarningsOutlineSection, EarningsOutlineResponse } from '@/types/earnings';
import { byDisplayOrder } from '@/components/quarterly/sectionState';
import { isTableOfContentsSection } from './helpers';
import { OutlineGroup } from '@/components/earnings/OutlineGroup';
import type { OutlineDragHandlers } from '@/components/earnings/OutlineGroup';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { INK, MUTED, FAINT } from '@/components/earnings/tokens';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import { GeneratingScreen } from '@/components/reports/GeneratingScreen';
import { computeProgress } from '@/components/reports/QuarterlyGeneratingScreen';

// Section-production loader — same "AI loader" used for the quarterly
// Outline → Preview handoff (AiLoadingScreen + usePipelinePoll), just with
// earnings-flavoured copy.
const PRODUCE_MILESTONES = [
  'Composing narrative sections',
  'Filling the report tables',
  'Applying your tone and voice',
  'Finalizing the report',
];
const PRODUCE_TIPS = [
  'Each section is written from your extracted figures and drivers.',
  'Table and KPI sections are rendered directly from the numbers.',
  'Sections that still need your input stay editable on the next screen.',
  "You can refine any AI-written section's tone right in the preview.",
];

// ApiError.message already carries the backend's `detail` (or a generic
// message for 429/5xx infra failures) — read it rather than re-parsing
// `err.body.detail` directly, which would bypass that sanitization.
function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message || fallback : fallback;
}

// "Available to add" is sorted by requirement tier (Required sections are
// always force-included so never appear here, in practice this only orders
// Recommended before Optional), then by the backend's display order. The
// included/"Report sections" group keeps the user's own drag order — that's
// the final assembled order and must never be re-sorted.
const REQUIREMENT_RANK: Record<string, number> = { required: 0, recommended: 1, optional: 2 };
function byTierThenOrder(a: EarningsOutlineSection, b: EarningsOutlineSection): number {
  const rankOf = (s: EarningsOutlineSection) => REQUIREMENT_RANK[s.requirement] ?? 3;
  return rankOf(a) - rankOf(b) || byDisplayOrder(a, b);
}

export default function EarningsOutlinePage() {
  const { reportId } = useParams<{ reportId: string }>();
  // So reopening this report from the list comes back HERE, rather than to the
  // middle of the flow — see earnings-resume.
  useRememberStep(reportId, 'outline');
  // How far the REPORT has got, so the stepper does not grey out a step this
  // user has already been to — see earnings-resume.
  const reached = reachedStepNumber(reportId, 2);
  const navigate = useNavigate();
  const { user } = useAuth();
  // The outline endpoints are report-scoped (no company_id). Read it defensively
  // so a null user never crashes the page.
  void (user?.company_id ?? null);

  const [included, setIncluded] = useState<EarningsOutlineSection[]>([]);
  const [available, setAvailable] = useState<EarningsOutlineSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // fatal load failure
  const [saveError, setSaveError] = useState<string | null>(null); // non-blocking save/422 banner
  const [retryKey, setRetryKey] = useState(0);
  const [saving, setSaving] = useState(false);
  // Which financial section is open. One at a time — two open panels just push
  // each other off screen.
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  // Sections the user is about to empty by removing them, as the server counted
  // them at the moment of the decision. null = nothing to confirm.
  // The brief for each financial section. Asked once, here -- Continue searches
  // with it and Preview never asks again.
  const [prompts, setPrompts] = useState<Record<string, string>>({});

  const [pendingDrop, setPendingDrop] = useState<
    { section_code: string; title: string; figure_count: number }[] | null
  >(null);

  // Section production, kicked once the outline is saved. Non-null → the
  // full-screen AI loader takes over; navigation to Preview only happens once
  // the run genuinely completes (never early — every section must be ready).
  const [produceRun, setProduceRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const { state: producePoll, restart: restartProduce } = usePipelinePoll(
    produceRun?.run_id ?? null,
    produceRun?.poll_url ?? null,
  );

  // Drag state — only the included group reorders. The active index lives in a ref
  // (no re-render needed); native HTML5 drag drives the move.
  // Which section's figure checklist is open, and that section's lines.
  // Loaded on expand rather than up front: a report can carry a thousand lines
  // and the user only ever looks at one section at a time.
  const dragIndexRef = useRef<number | null>(null);

  // Split a response into the ordered included set + the available-to-add set.
  // Table of Contents is dropped from both — never offered, never shown, and
  // never sent back on save (omitting it from the PUT reads to the backend as
  // excluded, which is exactly what we want here).
  const applyResponse = useCallback((res: EarningsOutlineResponse) => {
    const sections = res.sections.filter((s) => !isTableOfContentsSection(s.section_code));
    const inc = sections.filter((s) => s.included).sort(byDisplayOrder);
    const av = sections.filter((s) => !s.included).sort(byTierThenOrder);
    setIncluded(inc);
    setAvailable(av);
    // Seed from what is stored, but never over what is being typed.
    setPrompts((prev) => ({
      ...Object.fromEntries(sections.map((x) => [x.section_code, x.prompt ?? ''])),
      ...prev,
    }));
  }, []);


  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!reportId) {
      setError('Missing report id.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    earnings
      .getEarningsOutline(reportId)
      .then((res) => {
        if (!cancelled) applyResponse(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load the outline.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, retryKey, applyResponse]);

  // ── Toggle inclusion ──────────────────────────────────────────────────────
  // Required sections and unavailable optionals can't move (their toggles are
  // disabled), so this only ever moves an available optional in or out. Reads
  // the current included/available snapshots directly (no nested setState-
  // inside-setState) so the move is unambiguous.
  // Rename a financial section. Optimistic, because the name is the user's own
  // words and waiting on a round trip to see them is the wrong feel; on failure
  // the panel puts the old name back and says so.
  const renameSection = useCallback(
    async (code: string, title: string) => {
      if (!reportId) return;
      const apply = (list: EarningsOutlineSection[]) =>
        list.map((s) =>
          s.section_code === code
            ? { ...s, title: title || (s.title_original ?? s.title) }
            : s,
        );
      const before = { included, available };
      setIncluded(apply);
      setAvailable(apply);
      try {
        await earnings.renameEarningsSection(reportId, code, title);
      } catch (e) {
        setIncluded(before.included);
        setAvailable(before.available);
        throw e; // the panel restores its own input and shows the error
      }
    },
    [reportId, included, available],
  );

  const toggleSection = useCallback(
    (code: string) => {
      const incIdx = included.findIndex((s) => s.section_code === code);
      if (incIdx !== -1) {
        const section = included[incIdx];
        if (section.requirement === 'required') return; // required can't be excluded
        setIncluded((inc) => inc.filter((s) => s.section_code !== code));
        setAvailable((av) => [...av, { ...section, included: false }].sort(byTierThenOrder));
        return;
      }
      const avIdx = available.findIndex((s) => s.section_code === code);
      if (avIdx !== -1) {
        const section = available[avIdx];
        if (!section.available) return; // unavailable optional — not addable
        setAvailable((av) => av.filter((s) => s.section_code !== code));
        setIncluded((inc) => [...inc, { ...section, included: true }]);
      }
    },
    [included, available],
  );

  // ── Reorder within the included set ───────────────────────────────────────
  const moveIncluded = useCallback((from: number, to: number) => {
    setIncluded((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const drag: OutlineDragHandlers = {
    dragStart: (index: number) => (e: DragEvent) => {
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = 'move';
    },
    dragOver: () => (e: DragEvent) => {
      if (dragIndexRef.current === null) return;
      e.preventDefault(); // allow drop
    },
    drop: (index: number) => (e: DragEvent) => {
      if (dragIndexRef.current === null) return;
      e.preventDefault();
      moveIncluded(dragIndexRef.current, index);
      dragIndexRef.current = null;
    },
    dragEnd: () => {
      dragIndexRef.current = null;
    },
    gripKeyDown: (index: number) => (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveIncluded(index, index - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveIncluded(index, index + 1);
      }
    },
  };

  // ── Continue: save the arrangement, then ask the server to build.
  //
  // Whether anything actually needs building is the SERVER's call, not this
  // screen's — it is the only side that can compare each section's stored
  // content hash against its current inputs. It answers "nothing to do" by
  // starting no run, and this handler then skips the loader entirely.
  //
  // This used to be decided here, from section statuses read before the save.
  // That could not work: the backend reset every included section to 'pending'
  // on every save, even a no-op reorder, so no client-side reading of status
  // could tell a finished report from a fresh one. Both halves are fixed —
  // persist_earnings_outline keeps a produced section produced, and the produce
  // endpoint short-circuits — so the guard belongs where the facts are.
  const handleContinue = async (dropFigures?: string[]) => {
    if (!reportId) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      // Only ever sent on the retry, naming exactly the sections the user was
      // shown and agreed to. A section they never touched cannot be emptied by
      // somebody else's confirmation.
      ...(dropFigures?.length ? { drop_figures: dropFigures } : null),
      sections: [
        ...included.map((s, i) => ({
          section_code: s.section_code,
          included: true,
          display_order: i,
          prompt: prompts[s.section_code] ?? '',
        })),
        ...available.map((s) => ({
          section_code: s.section_code,
          included: false,
          display_order: 0,
        })),
      ],
    };
    try {
      await earnings.saveEarningsOutline(reportId, payload);
    } catch (err: unknown) {
      // 422 (e.g. a stale include of an unavailable optional): surface the message
      // and refetch the outline rather than pushing on.
      // Removing a section takes its figures with it, so the server refuses until
      // the user has been told what that costs. This is the only guard: the count
      // comes from the server at the moment of the decision, so it cannot be stale,
      // and a second tab or a fresh search can never make it wrong.
      const detail =
        err instanceof ApiError && err.status === 409
          ? (err.body as { detail?: { error?: string; sections?: typeof pendingDrop } })?.detail
          : null;
      if (detail?.error === 'sections_hold_figures' && detail.sections?.length) {
        setPendingDrop(detail.sections);
        setSaving(false);
        return;
      }
      if (err instanceof ApiError && err.status === 422) {
        setSaveError(apiErrorMessage(err, 'This arrangement was rejected — reloading the outline.'));
        setRetryKey((k) => k + 1); // refetch; the banner persists across the reload
      } else {
        setSaveError(apiErrorMessage(err, 'Failed to save the outline.'));
      }
      setSaving(false);
      return;
    }

    // Build the whole report here: search every financial section with the brief
    // typed on it, then produce every section. The loader runs for the whole job
    // and Preview opens finished -- it does not ask for anything.
    //
    // A failure still hands over. Preview can be curated by hand from whatever
    // landed, and stranding somebody on the Outline helps nobody.
    if (!reportId) return;
    try {
      const handle = await earnings.buildEarningsReport(reportId);
      // Nothing to build: the server found every section already produced and
      // unchanged, and started no run. Go straight through — raising a loader to
      // wait for work that will not happen is the whole reason coming back to a
      // finished report felt slow.
      const started = startedRun(handle);
      if (!started) {
        setSaving(false);
        navigate(`/earnings/${reportId}/preview`);
        return;
      }
      setProduceRun(started);
    } catch (err: unknown) {
      setSaveError(apiErrorMessage(err, "Couldn't start building the report."));
      setSaving(false);
      navigate(`/earnings/${reportId}/preview`);
    }
  };

  // ── Section production — full-screen loader, same one the quarterly
  // Outline → Preview handoff uses. Takes over as soon as produce is kicked;
  // the outline UI underneath is irrelevant once we're here.
  if (produceRun) {
    // See EarningsPreviewPage: `idle` is "watching nothing", never "working".
    const phase = producePoll.phase;
    if (phase === 'failed' || phase === 'timeout') {
      return (
        <GeneratingScreen
          phase={phase}
          errorMessage={phase === 'failed' ? producePoll.run?.error_message ?? null : null}
          onCancel={() => setProduceRun(null)}
          onRetry={() => setProduceRun(null)}
          onKeepWaiting={restartProduce}
        />
      );
    }
    const progress = computeProgress(phase === 'completed' ? 'completed' : 'running', producePoll.nodes);
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1400, overflowY: 'auto' }}>
        <AiLoadingScreen
          title="Composing your report"
          subtitle="Writing each section from your figures and inputs."
          doneTitle="Report ready"
          doneSubtitle="Taking you to the preview…"
          milestones={PRODUCE_MILESTONES}
          tips={PRODUCE_TIPS}
          controlledProgress={progress}
          done={phase === 'completed'}
          onDone={() => navigate(`/earnings/${reportId}/preview`)}
        />
      </div>
    );
  }

  // ── Loading / error / empty ───────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <EarningsStepper activeStep={2} reportId={reportId} reachedStep={reached} />
        <div className="card" style={{ padding: 0 }}>
          <Spinner pad={80} />
        </div>
      </div>
    );
  }

  if (error && included.length === 0 && available.length === 0) {
    return (
      <div>
        <EarningsStepper activeStep={2} reportId={reportId} reachedStep={reached} />
        <div
          className="card"
          role="alert"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
          <button className="btn bs bsm" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const includedCount = included.length;

  return (
    <div>
      <EarningsStepper activeStep={2} reportId={reportId} reachedStep={reached} />
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Arrange your report outline
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          Reorder and toggle the sections your report will include, then continue.
        </p>
      </div>

      {/* Non-blocking error banner (e.g. a rejected save that triggered a refetch). */}
      {saveError && (
        <div className="card" role="alert" style={{ padding: '12px 16px', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: '#DC2626' }}>{saveError}</span>
        </div>
      )}

      {included.length === 0 && available.length === 0 ? (
        <div
          className="card"
          style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}
        >
          No outline is available for this report yet.
        </div>
      ) : (
        <>
          <OutlineGroup
            title="Report sections"
            subtitle={`${includedCount} in report · drag to reorder`}
            sections={included}
            group="included"
            startNumber={0}
            emptyText="No sections included yet — add some from below."
            onToggle={toggleSection}
            drag={drag}
            expandedCode={expandedCode}
            onToggleExpand={(code) =>
              setExpandedCode((prev) => (prev === code ? null : code))
            }
            onRename={renameSection}
            prompts={prompts}
            onPromptChange={(code, v) =>
              setPrompts((p) => ({ ...p, [code]: v }))
            }
          />
          <OutlineGroup
            title="Available to add"
            sections={available}
            group="available"
            startNumber={included.length}
            emptyText="Every available section is already in your report."
            onToggle={toggleSection}
            expandedCode={expandedCode}
            onToggleExpand={(code) =>
              setExpandedCode((prev) => (prev === code ? null : code))
            }
            onRename={renameSection}
            prompts={prompts}
            onPromptChange={(code, v) =>
              setPrompts((p) => ({ ...p, [code]: v }))
            }
          />
        </>
      )}

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginTop: 18,
        }}
      >
        <button className="btn bs" onClick={() => navigate('/earnings/setup')}>
          ← Back
        </button>
        <span style={{ fontSize: 12, color: FAINT }}>
          {includedCount} section{includedCount === 1 ? '' : 's'} · in your order
        </span>
        <button
          className="btn bp"
          onClick={() => void handleContinue()}
          disabled={saving || includedCount === 0}
          style={{ opacity: saving || includedCount === 0 ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </div>

      {pendingDrop && (
        <DropFiguresConfirm
          sections={pendingDrop}
          onCancel={() => setPendingDrop(null)}
          onConfirm={() => {
            const codes = pendingDrop.map((x) => x.section_code);
            setPendingDrop(null);
            void handleContinue(codes);
          }}
        />
      )}
    </div>
  );
}

// Removing a section takes its figures with it. That is a real cost and it is the
// user's to weigh, so it is named — the section, and the number — rather than
// happening as a side effect of pressing Continue. This dialog is the only thing
// standing between a click and 83 figures.
function DropFiguresConfirm({
  sections,
  onCancel,
  onConfirm,
}: {
  sections: { section_code: string; title: string; figure_count: number }[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = sections.reduce((n, s) => n + s.figure_count, 0);
  const one = sections.length === 1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={one ? `Remove ${sections[0].title}?` : 'Remove these sections?'}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,22,40,.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 60,
      }}
      onClick={onCancel}
    >
      <div
        className="card analysis-pop"
        style={{ width: 'min(460px, 100%)', padding: '22px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: INK }}>
          {one ? `Remove ${sections[0].title}?` : `Remove ${sections.length} sections?`}
        </h2>
        <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: '9px 0 0' }}>
          {one ? 'It holds' : 'They hold'}{' '}
          <strong style={{ color: INK }}>
            {total} figure{total === 1 ? '' : 's'}
          </strong>{' '}
          you chose. Removing {one ? 'the section' : 'them'} removes those figures from
          this report.
        </p>

        {!one && (
          <div style={{ margin: '12px 0 0' }}>
            {sections.map((s) => (
              <div
                key={s.section_code}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '5px 0',
                  fontSize: 12.5,
                  color: INK,
                }}
              >
                <span>{s.title}</span>
                <span style={{ fontFamily: "'DM Mono', monospace", color: MUTED }}>
                  {s.figure_count}
                </span>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11.5, color: FAINT, lineHeight: 1.6, margin: '12px 0 0' }}>
          Your report's own lines are not touched, and we keep your brief — so putting a
          section back is one search. Any figure you edited by hand is kept.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 18 }}>
          <button type="button" className="btn bs bsm" onClick={onCancel}>
            Keep {one ? 'section' : 'them'}
          </button>
          <button type="button" className="btn bp bsm" onClick={onConfirm}>
            Remove and continue
          </button>
        </div>
      </div>
    </div>
  );
}
