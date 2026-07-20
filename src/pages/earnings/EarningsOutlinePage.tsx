import { useState, useEffect, useRef, useCallback } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { earnings, ApiError } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { EarningsOutlineSection, EarningsOutlineResponse } from '@/types/earnings';
import { byDisplayOrder } from '@/components/quarterly/sectionState';
import { OutlineGroup } from '@/components/earnings/OutlineGroup';
import type { OutlineDragHandlers } from '@/components/earnings/OutlineGroup';
import { INK, MUTED, FAINT } from '@/components/earnings/tokens';

// Pull a human message out of an ApiError body (FastAPI puts it under `detail`,
// which can be a string or a validation array).
function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | null;
    const detail = body?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail) && detail.length) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
    return err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
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

  // Drag state — only the included group reorders. The active index lives in a ref
  // (no re-render needed); native HTML5 drag drives the move.
  const dragIndexRef = useRef<number | null>(null);

  // Split a response into the ordered included set + the available-to-add set.
  const applyResponse = useCallback((res: EarningsOutlineResponse) => {
    const inc = res.sections.filter((s) => s.included).sort(byDisplayOrder);
    const av = res.sections.filter((s) => !s.included).sort(byDisplayOrder);
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
  // disabled), so this only ever moves an available optional in or out.
  const toggleSection = useCallback((code: string) => {
    setIncluded((inc) => {
      const idx = inc.findIndex((s) => s.section_code === code);
      if (idx !== -1) {
        const section = inc[idx];
        if (section.requirement === 'required') return inc; // required can't be excluded
        setAvailable((av) => [...av, { ...section, included: false }]);
        return inc.filter((s) => s.section_code !== code);
      }
      return inc;
    });
    setAvailable((av) => {
      const idx = av.findIndex((s) => s.section_code === code);
      if (idx !== -1) {
        const section = av[idx];
        if (!section.available) return av; // unavailable optional — not addable
        setIncluded((inc) => [...inc, { ...section, included: true }]);
        return av.filter((s) => s.section_code !== code);
      }
      return av;
    });
  }, []);

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

  // ── Continue: save the arrangement, then advance to preview ────────────────
  const handleContinue = async () => {
    if (!reportId) return;
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
      navigate(`/earnings/${reportId}/preview`);
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
    }
  };

  // ── Loading / error / empty ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="card" style={{ padding: 0 }}>
        <Spinner pad={80} />
      </div>
    );
  }

  if (error && included.length === 0 && available.length === 0) {
    return (
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
    );
  }

  const includedCount = included.length;

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
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
