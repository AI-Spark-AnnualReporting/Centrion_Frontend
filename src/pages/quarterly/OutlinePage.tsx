import { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Lock } from 'lucide-react';
import { Spinner } from '@/components/shared/Spinner';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports, ApiError } from '@/lib/api';
import type { OutlineSection, OutlineResponse } from '@/types/quarterly';
import type { ProcessingPageState } from '@/pages/ProcessingPage';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import { byDisplayOrder } from '@/components/quarterly/sectionState';

// ─── colours (shared quarterly conventions) ──────────────────────────────────
const ACCENT = '#4040C8';
const GREEN = '#10B981';
const MUTED = '#6B7280';
const DARK = '#1F2340';

type Preset = 'required' | 'recommended' | 'everything';
type SaveState = 'idle' | 'saving' | 'saved';

// ─── Feeder badge — the per-section "where the content comes from" signal ─────
function FeederBadge({ feeder }: { feeder: OutlineSection['feeder'] }) {
  switch (feeder.status) {
    case 'ready':
      return (
        <span className="badge b-gn">
          From {feeder.document_name ?? 'document'}
        </span>
      );
    case 'template':
      return <span className="badge b-gy">System template</span>;
    case 'external':
      return <span className="badge b-am">External data</span>;
    case 'needs_input':
      // No orange badge class exists — inline it.
      return (
        <span
          className="badge"
          style={{ background: 'rgba(249,115,22,.12)', color: '#EA580C' }}
        >
          Needs input{feeder.message ? `: ${feeder.message}` : ''}
        </span>
      );
    default:
      return null;
  }
}

// ─── Custom checkbox button (mirrors QuarterlyReportForm's report-area check) ──
function CheckBox({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      onClick={
        disabled
          ? undefined
          : (e) => {
              e.stopPropagation();
              onToggle?.();
            }
      }
      style={{
        width: 18,
        height: 18,
        padding: 0,
        borderRadius: 5,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: checked ? 'none' : '1.5px solid #C9CDE4',
        background: checked ? ACCENT : '#fff',
        opacity: disabled && !checked ? 0.6 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2l2.2 2.2L9.5 3.6"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

// ─── Page shell (stepper + bounded flex column) ───────────────────────────────
function Shell({
  reportId,
  children,
}: {
  reportId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100% - 48px)',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {reportId && <QuarterlyReportStepper activeStep={3} reportId={reportId} />}
      {children}
    </div>
  );
}

// A single row (used for both required and optional groups).
function SectionRow({
  section,
  number,
  locked,
  isRequired,
  dragging,
  dragOver,
  onToggle,
  dragHandleProps,
}: {
  section: OutlineSection;
  number: number;
  locked: boolean; // whole-outline frozen
  isRequired: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onToggle?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement> & {
    draggable?: boolean;
  };
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 12,
        border: `1px solid ${dragOver ? ACCENT : '#E8EAF3'}`,
        background: dragOver ? 'rgba(64,64,200,.05)' : isRequired ? '#FAFBFE' : '#fff',
        opacity: dragging ? 0.4 : 1,
        transition: 'border-color .12s, background .12s, opacity .12s',
      }}
    >
      {/* Lead: grip handle — required and optional rows are both reorderable.
          (Required-ness is conveyed by the disabled checkbox + badges.) */}
      <span
        {...dragHandleProps}
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${section.title}`}
        title="Drag to reorder (or use arrow keys)"
        style={{
          display: 'inline-flex',
          flexShrink: 0,
          cursor: 'grab',
          color: '#9BA3C4',
          outlineOffset: 2,
        }}
      >
        <GripVertical size={16} aria-hidden />
      </span>

      <CheckBox
        checked={section.included}
        disabled={locked || isRequired}
        onToggle={onToggle}
        label={
          section.included
            ? `Exclude ${section.title}`
            : `Include ${section.title}`
        }
      />

      <span
        style={{
          width: 22,
          fontSize: 12,
          fontWeight: 700,
          color: '#9BA3C4',
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
        {number}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: DARK,
            lineHeight: 1.35,
          }}
        >
          {section.title}
        </div>
        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>
          {section.part_label}
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <FeederBadge feeder={section.feeder} />
        {isRequired && <span className="badge b-gy">REQUIRED</span>}
        {isRequired && <span className="badge b-gy">LOCKED</span>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function OutlinePage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  // Required sections are pinned+sorted; optionals are user-orderable.
  const [required, setRequired] = useState<OutlineSection[]>([]);
  const [optionals, setOptionals] = useState<OutlineSection[]>([]);
  const [totalCatalogue, setTotalCatalogue] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [submitting, setSubmitting] = useState(false);

  // Snapshot of the backend's default `included` flags (for the Recommended preset).
  const defaultIncludedRef = useRef<Record<string, boolean>>({});
  // Debounce + latest-wins guards for autosave.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
  // Drag state. `dragGroup` scopes highlight + drop to the group being dragged
  // (required or optional) so the two lists reorder independently.
  const dragIndexRef = useRef<number | null>(null);
  const dragGroupRef = useRef<'required' | 'optional' | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragGroup, setDragGroup] = useState<'required' | 'optional' | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    quarterlyReports
      .getOutline(companyId, reportId)
      .then((res) => {
        if (cancelled) return;
        applyResponse(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(
          err instanceof Error ? err.message : 'Failed to load the outline.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reportId, retryKey]);

  // Split a response into pinned required + ordered optionals.
  const applyResponse = (res: OutlineResponse) => {
    const req = res.sections
      .filter((s) => s.requirement === 'required')
      .sort(byDisplayOrder)
      .map((s) => ({ ...s, included: true }));
    const opt = res.sections
      .filter((s) => s.requirement === 'optional')
      .sort(byDisplayOrder);
    setRequired(req);
    setOptionals(opt);
    setTotalCatalogue(res.total_catalogue ?? res.sections.length);
    // Whole-outline freeze: explicit flag, or every section locked.
    setIsLocked(
      res.locked === true ||
        (res.sections.length > 0 && res.sections.every((s) => s.locked)),
    );
    defaultIncludedRef.current = Object.fromEntries(
      opt.map((s) => [s.section_code, s.included]),
    );
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const includedCount =
    required.length + optionals.filter((o) => o.included).length;

  // ── Persist (debounced PUT) ───────────────────────────────────────────────
  // includedOnly: post-lock the SET is frozen, so a reorder must carry ONLY the
  // sections in the locked/included set. Sending excluded optionals with a fresh
  // display_order reads as "positioning a section not in the set" and the backend
  // rejects it (409). Pre-lock we send the full catalogue so tick/untick persists.
  const buildPayload = useCallback(
    (req: OutlineSection[], opts: OutlineSection[], includedOnly = false) => {
      const all = [...req, ...opts];
      const rows = includedOnly ? all.filter((s) => s.included) : all;
      return {
        sections: rows.map((s, i) => ({
          section_code: s.section_code,
          included: s.included,
          display_order: i,
        })),
      };
    },
    [],
  );

  // Handle a 409 uniformly: the outline was locked elsewhere → go read-only,
  // re-fetch, and swallow (no toast).
  const handleLocked409 = useCallback(() => {
    setIsLocked(true);
    setSaveState('idle');
    if (companyId && reportId) {
      quarterlyReports
        .getOutline(companyId, reportId)
        .then(applyResponse)
        .catch(() => {
          /* keep current state read-only */
        });
    }
  }, [companyId, reportId]);

  const scheduleSave = useCallback(
    (req: OutlineSection[], opts: OutlineSection[]) => {
      // Persist reorders even when locked — the SET is frozen (include toggles are
      // disabled), so any autosave here is a display_order change, which the
      // backend must accept on a locked report (no 409, no regeneration).
      if (!companyId || !reportId) return;

      // One PUT attempt. On a 409 (the report is actually locked) we retry ONCE
      // with the included-only payload — only the locked/included set, order-only —
      // which is exactly what the backend's post-lock reorder path accepts. A drag
      // never changes the section SET, so re-sending just the included set is always
      // correct. If the retry ALSO 409s, the backend isn't honoring reorder-while-
      // locked and we revert (a real backend bug, now surfaced).
      const runSave = (includedOnly: boolean, seq: number, retried: boolean) => {
        quarterlyReports
          .saveOutline(companyId, reportId, buildPayload(req, opts, includedOnly))
          .then(() => {
            if (seq === saveSeqRef.current) setSaveState('saved');
          })
          .catch((err: unknown) => {
            if (seq !== saveSeqRef.current) return;
            if (err instanceof ApiError && err.status === 409) {
              console.warn('[outline] PUT /outline rejected (409):', err.body);
              if (!retried) {
                // The set is locked after all → retry as an included-only reorder.
                setIsLocked(true);
                runSave(true, seq, true);
                return;
              }
              handleLocked409();
              return;
            }
            // Non-lock error: surface softly in the indicator, keep local state.
            setSaveState('idle');
          });
      };

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      saveTimerRef.current = setTimeout(() => {
        const seq = ++saveSeqRef.current;
        runSave(isLocked, seq, false);
      }, 700);
    },
    [companyId, reportId, buildPayload, handleLocked409, isLocked],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const toggleOptional = (code: string) => {
    if (isLocked) return;
    setOptionals((prev) => {
      const next = prev.map((o) =>
        o.section_code === code ? { ...o, included: !o.included } : o,
      );
      scheduleSave(required, next);
      return next;
    });
  };

  const applyPreset = (preset: Preset) => {
    if (isLocked) return;
    setOptionals((prev) => {
      const next = prev.map((o) => {
        let included = o.included;
        if (preset === 'required') included = false;
        else if (preset === 'everything') included = true;
        else included = defaultIncludedRef.current[o.section_code] ?? false;
        return { ...o, included };
      });
      scheduleSave(required, next);
      return next;
    });
  };

  const moveRequired = (from: number, to: number) => {
    // Reordering is allowed even when the set is locked — only the include/exclude
    // SET is frozen, not the display order.
    if (to < 0 || to >= required.length || from === to) return;
    setRequired((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      scheduleSave(next, optionals);
      return next;
    });
  };

  const moveOptional = (from: number, to: number) => {
    if (to < 0 || to >= optionals.length || from === to) return;
    setOptionals((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      scheduleSave(required, next);
      return next;
    });
  };

  // Which quick-select preset the current optional set matches (for highlight).
  const activePreset: Preset | null = (() => {
    if (optionals.length === 0) return null;
    if (optionals.every((o) => o.included)) return 'everything';
    if (optionals.every((o) => !o.included)) return 'required';
    if (
      optionals.every(
        (o) => o.included === (defaultIncludedRef.current[o.section_code] ?? false),
      )
    )
      return 'recommended';
    return null;
  })();

  // ── Continue: flush save, lock, produce all sections, advance ─────────────
  // Locking freezes the outline; produceAll kicks batch section production and
  // we hand off to the shared processing loader, which polls to completion then
  // redirects to Preview (so the user never presses Produce per section).
  const goProduceOrPreview = async () => {
    if (!companyId || !reportId) return;
    try {
      const handle = await quarterlyReports.produceAll(companyId, reportId);
      if (handle?.run_id && handle?.poll_url) {
        const processingState: ProcessingPageState = {
          runId: handle.run_id,
          pollUrl: handle.poll_url,
          reportId,
          companyId,
          estimatedDurationSeconds: null,
          fileName: null,
          isExisting: false,
          reportType: 'quarterly',
          quarterlyNext: 'preview',
        };
        navigate('/reports/processing', { state: processingState });
        return;
      }
    } catch {
      // Batch produce couldn't be kicked — fall through to Preview, where each
      // section can still be produced individually.
    }
    navigate(`/quarterly-report/${reportId}/preview`);
  };

  const onGenerate = async () => {
    if (!companyId || !reportId) return;
    if (isLocked) {
      // Already locked → sections were produced on the first pass. Just view them;
      // do NOT re-run produceAll (that would regenerate everything on every revisit).
      navigate(`/quarterly-report/${reportId}/preview`);
      return;
    }
    setSubmitting(true);
    try {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await quarterlyReports.saveOutline(
        companyId,
        reportId,
        buildPayload(required, optionals),
      );
      await quarterlyReports.lockOutline(companyId, reportId);
      await goProduceOrPreview();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        // Already locked elsewhere — sections are (being) produced; just view them.
        // Don't re-kick production.
        navigate(`/quarterly-report/${reportId}/preview`);
        return;
      }
      setSubmitting(false);
      setFetchError(
        err instanceof Error ? err.message : 'Failed to lock the outline.',
      );
    }
  };

  // ── Drag handlers — group-aware (required and optional both reorderable, each
  //    within its own group). `group` scopes the drag so a required row can't be
  //    dropped into the optional list or vice versa. ─────────────────────────
  type DragGroup = 'required' | 'optional';
  const moveInGroup = (group: DragGroup, from: number, to: number) =>
    group === 'required' ? moveRequired(from, to) : moveOptional(from, to);

  const resetDrag = () => {
    dragIndexRef.current = null;
    dragGroupRef.current = null;
    setDragIndex(null);
    setDragGroup(null);
    setOverIndex(null);
  };
  const onDragStart = (group: DragGroup, index: number) => (e: React.DragEvent) => {
    dragIndexRef.current = index;
    dragGroupRef.current = group;
    setDragIndex(index);
    setDragGroup(group);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (group: DragGroup, index: number) => (e: React.DragEvent) => {
    if (dragIndexRef.current === null || dragGroupRef.current !== group) return;
    e.preventDefault();
    if (index !== overIndex) setOverIndex(index);
  };
  const onDrop = (group: DragGroup, index: number) => (e: React.DragEvent) => {
    if (dragIndexRef.current === null || dragGroupRef.current !== group) return;
    e.preventDefault();
    moveInGroup(group, dragIndexRef.current, index);
    resetDrag();
  };
  const onDragEnd = () => resetDrag();
  const onGripKeyDown = (group: DragGroup, index: number) => (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveInGroup(group, index, index - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveInGroup(group, index, index + 1);
    }
  };

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <Shell reportId={reportId}>
        <Spinner pad={80} />
      </Shell>
    );
  }

  if (fetchError) {
    return (
      <Shell reportId={reportId}>
        <div style={{ padding: '24px 28px' }}>
          <div
            style={{
              padding: '16px 20px',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <span style={{ fontSize: 13, color: '#DC2626' }}>{fetchError}</span>
            <button
              className="bs"
              style={{ fontSize: 12, padding: '6px 14px' }}
              onClick={() => {
                setFetchError(null);
                setRetryKey((k) => k + 1);
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  if (required.length === 0 && optionals.length === 0) {
    return (
      <Shell reportId={reportId}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 14 }}>📄</div>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: DARK,
              margin: '0 0 8px',
            }}
          >
            No outline available yet
          </h2>
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 24 }}>
            The report catalogue hasn't been prepared for this report.
          </p>
          <button
            className="btn bs"
            style={{ padding: '10px 20px' }}
            onClick={() => navigate('/reports/quarterly')}
          >
            ← Back to Reports
          </button>
        </div>
      </Shell>
    );
  }

  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'required', label: 'Required only' },
    { key: 'recommended', label: 'Recommended' },
    { key: 'everything', label: 'Everything' },
  ];

  return (
    <Shell reportId={reportId}>
      {/* Header */}
      <div
        style={{
          padding: '22px 28px 14px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: DARK,
              margin: '0 0 4px',
              lineHeight: 1.2,
            }}
          >
            Report outline
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: MUTED, maxWidth: 560 }}>
            Required sections are locked at the top. Tick optional ones to include
            them, then drag to set their order.
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>
            Template · {totalCatalogue}
          </div>
          <div style={{ fontSize: 13, color: ACCENT, fontWeight: 800, marginTop: 2 }}>
            {includedCount} in report
          </div>
        </div>
      </div>

      {/* Quick Select + locked banner */}
      <div
        style={{
          padding: '0 28px 14px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        {isLocked ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 12,
              fontWeight: 700,
              color: '#6B72A0',
              background: '#F2F3FA',
              border: '1px solid #E2E4F0',
              borderRadius: 20,
              padding: '6px 14px',
            }}
          >
            <Lock size={13} aria-hidden />
            Section set locked · drag to reorder
          </span>
        ) : (
          <>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.5px',
                textTransform: 'uppercase',
                color: '#9BA3C4',
              }}
            >
              Quick select
            </span>
            <div className="tabs" style={{ marginBottom: 0 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`tab ${activePreset === p.key ? 'act' : ''}`}
                  onClick={() => applyPreset(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 28px 20px' }}>
        {/* REQUIRED group */}
        {required.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <span className="ct">
                REQUIRED — always included · drag to reorder
              </span>
            </div>
            <div
              className="cb"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {required.map((s, i) => (
                <div
                  key={s.section_code}
                  onDragOver={onDragOver('required', i)}
                  onDrop={onDrop('required', i)}
                >
                  <SectionRow
                    section={s}
                    number={i + 1}
                    locked={isLocked}
                    isRequired
                    dragging={dragGroup === 'required' && dragIndex === i}
                    dragOver={dragGroup === 'required' && overIndex === i && dragIndex !== i}
                    dragHandleProps={{
                      draggable: true,
                      onDragStart: onDragStart('required', i),
                      onDragEnd,
                      onKeyDown: onGripKeyDown('required', i),
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPTIONAL group */}
        {optionals.length > 0 && (
          <div className="card">
            <div className="ch">
              <span className="ct">
                OPTIONAL — drag to reorder
              </span>
            </div>
            <div
              className="cb"
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {optionals.map((s, i) => (
                <div
                  key={s.section_code}
                  onDragOver={onDragOver('optional', i)}
                  onDrop={onDrop('optional', i)}
                >
                  <SectionRow
                    section={s}
                    number={required.length + i + 1}
                    locked={isLocked}
                    isRequired={false}
                    dragging={dragGroup === 'optional' && dragIndex === i}
                    dragOver={dragGroup === 'optional' && overIndex === i && dragIndex !== i}
                    onToggle={() => toggleOptional(s.section_code)}
                    dragHandleProps={{
                      draggable: true,
                      onDragStart: onDragStart('optional', i),
                      onDragEnd,
                      onKeyDown: onGripKeyDown('optional', i),
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          background: '#fff',
          borderTop: '1px solid #E5E7EF',
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <button
          className="btn bs"
          style={{ fontSize: 13, padding: '10px 18px' }}
          onClick={() => navigate('/reports/quarterly')}
        >
          ← Back
        </button>

        <span
          style={{
            fontSize: 13,
            color: MUTED,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {includedCount} sections · in your order
          {saveState !== 'idle' && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: saveState === 'saved' ? GREEN : '#9BA3C4',
              }}
            >
              {saveState === 'saving' ? 'Saving…' : '✓ Saved'}
            </span>
          )}
        </span>

        <button
          className="bp"
          disabled={submitting}
          style={{
            fontSize: 14,
            padding: '10px 24px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            opacity: submitting ? 0.6 : 1,
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
          onClick={onGenerate}
        >
          {isLocked ? 'View report' : submitting ? 'Locking…' : 'Generate & Preview'}
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path
              d="M8 4l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </Shell>
  );
}
