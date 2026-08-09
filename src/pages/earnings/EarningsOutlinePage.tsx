import { useState, useEffect, useRef, useCallback } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { earnings, ApiError } from '@/lib/api';
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

  // ── Continue: save the arrangement, then produce ONLY if something actually
  // needs it — a section already 'produced' or 'needs_input' has already been
  // attempted and re-running produce on it would just redo unchanged work (or
  // clobber a needs_input reason a fresh attempt won't resolve anyway). Only a
  // still-'pending' included section (never attempted — e.g. newly added)
  // triggers the loader; otherwise Preview is reached immediately, showing
  // whatever's already stored.
  //
  // The decision is made from `included` as loaded BEFORE this save — NOT
  // from PUT /outline's response. The backend resets every included section's
  // status back to 'pending' on every save (even a no-op reorder), so reading
  // post-save status would make this check always fire.
  const handleContinue = async () => {
    if (!reportId) return;
    const needsProduce = included.some((s) => s.status === 'pending' || s.status == null);
    setSaving(true);
    setSaveError(null);
    const payload = {
      sections: [
        ...included.map((s, i) => ({
          section_code: s.section_code,
          included: true,
          display_order: i,
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
      if (err instanceof ApiError && err.status === 422) {
        setSaveError(apiErrorMessage(err, 'This arrangement was rejected — reloading the outline.'));
        setRetryKey((k) => k + 1); // refetch; the banner persists across the reload
      } else {
        setSaveError(apiErrorMessage(err, 'Failed to save the outline.'));
      }
      setSaving(false);
      return;
    }

    if (!needsProduce) {
      navigate(`/earnings/${reportId}/preview`);
      return;
    }

    try {
      const handle = await earnings.produceEarningsReport(reportId);
      setProduceRun({ run_id: handle.run_id, poll_url: handle.poll_url });
    } catch (err: unknown) {
      setSaveError(apiErrorMessage(err, 'Failed to start report generation.'));
      setSaving(false);
    }
  };

  // ── Section production — full-screen loader, same one the quarterly
  // Outline → Preview handoff uses. Takes over as soon as produce is kicked;
  // the outline UI underneath is irrelevant once we're here.
  if (produceRun) {
    const phase = producePoll.phase === 'idle' ? 'running' : producePoll.phase;
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
        <EarningsStepper activeStep={3} reportId={reportId} />
        <div className="card" style={{ padding: 0 }}>
          <Spinner pad={80} />
        </div>
      </div>
    );
  }

  if (error && included.length === 0 && available.length === 0) {
    return (
      <div>
        <EarningsStepper activeStep={3} reportId={reportId} />
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
      <EarningsStepper activeStep={3} reportId={reportId} />
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
          />
          <OutlineGroup
            title="Available to add"
            sections={available}
            group="available"
            startNumber={included.length}
            emptyText="Every available section is already in your report."
            onToggle={toggleSection}
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
        <button className="btn bs" onClick={() => navigate(`/earnings/${reportId}/extract`)}>
          ← Back
        </button>
        <span style={{ fontSize: 12, color: FAINT }}>
          {includedCount} section{includedCount === 1 ? '' : 's'} · in your order
        </span>
        <button
          className="btn bp"
          onClick={handleContinue}
          disabled={saving || includedCount === 0}
          style={{ opacity: saving || includedCount === 0 ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}
