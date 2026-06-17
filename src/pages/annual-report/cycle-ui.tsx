// Shared presentational helpers for the Annual Report cycle pages — status
// badge mapping, a compact date formatter, and a thin progress bar. Keeps the
// list/detail pages free of duplicated styling logic.

import type {
  CycleStatus,
  SectionLayer,
  SectionMode,
  SectionStatus,
  SessionStatus,
} from '@/types/cycles';

const PRIMARY = '#4040C8';

// Clamp/round a possibly-null/NaN API value to a 0–100 integer for "%" labels.
export const safePct = (n: number | null | undefined): number =>
  Number.isFinite(n as number) ? Math.max(0, Math.min(100, Math.round(n as number))) : 0;

// "Mar 31, 2026" — matches the deadline format in the design.
export function formatCycleDate(input?: string | null): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// A deadline is overdue once it's in the past and the cycle isn't finished.
export function isOverdue(deadline?: string | null, status?: CycleStatus): boolean {
  if (!deadline || status === 'completed' || status === 'archived') return false;
  const d = new Date(deadline).getTime();
  return !Number.isNaN(d) && d < Date.now();
}

const CYCLE_STATUS: Record<CycleStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'b-gy' },
  active: { label: 'Active', cls: 'b-gn' },
  in_review: { label: 'In Review', cls: 'b-am' },
  completed: { label: 'Completed', cls: 'b-bl' },
  archived: { label: 'Archived', cls: 'b-gy' },
};

export function CycleStatusBadge({ status }: { status: CycleStatus }) {
  const m = CYCLE_STATUS[status] ?? CYCLE_STATUS.draft;
  return <span className={`badge ${m.cls}`}>● {m.label}</span>;
}

const SESSION_STATUS: Record<SessionStatus, { label: string; cls: string }> = {
  not_started: { label: 'Not Started', cls: 'b-gy' },
  in_progress: { label: 'In Progress', cls: 'b-am' },
  submitted: { label: 'Submitted', cls: 'b-bl' },
  approved: { label: 'Approved', cls: 'b-gn' },
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const m = SESSION_STATUS[status] ?? SESSION_STATUS.not_started;
  return <span className={`badge ${m.cls}`}>● {m.label}</span>;
}

const SECTION_STATUS: Record<SectionStatus, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'b-gy' },
  drafting: { label: 'Drafting', cls: 'b-am' },
  locked: { label: 'Locked', cls: 'b-gn' },
};

export function SectionStatusBadge({ status }: { status: SectionStatus }) {
  const m = SECTION_STATUS[status] ?? SECTION_STATUS.pending;
  return <span className={`badge ${m.cls}`}>● {m.label}</span>;
}

const SECTION_LAYER: Record<SectionLayer, { label: string; cls: string }> = {
  common: { label: 'Common', cls: 'b-gy' },
  cma: { label: 'CMA', cls: 'b-pp' },
  sector: { label: 'Sector', cls: 'b-bl' },
  optional: { label: 'Optional', cls: 'b-am' },
};

export function SectionLayerBadge({ layer }: { layer: SectionLayer }) {
  const m = SECTION_LAYER[layer] ?? SECTION_LAYER.common;
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

const SECTION_MODE: Record<SectionMode, { label: string; cls: string }> = {
  generate: { label: 'Generate', cls: 'b-pp' },
  attach: { label: 'Attach', cls: 'b-bl' },
  auto: { label: 'Auto', cls: 'b-gy' },
  manual: { label: 'Manual', cls: 'b-am' },
  extract: { label: 'Extract', cls: 'b-tl' },
  analyze: { label: 'Analyze', cls: 'b-gn' },
};

export function SectionModeBadge({ mode }: { mode: SectionMode }) {
  const m = SECTION_MODE[mode] ?? SECTION_MODE.auto;
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

// Thin progress bar. `pct` is 0–100; bar turns teal/green at 100%.
export function ProgressBar({ pct, width = 110 }: { pct: number; width?: number | string }) {
  // Guard against null/undefined/NaN from the API — otherwise width becomes
  // `NaN%` (invalid CSS → the bar renders full) and labels read "NaN%".
  const safe = Number.isFinite(pct) ? pct : 0;
  const clamped = Math.max(0, Math.min(100, Math.round(safe)));
  return (
    <div
      style={{
        width,
        height: 6,
        borderRadius: 3,
        background: '#ECEEF8',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          borderRadius: 3,
          background: clamped >= 100 ? '#16A34A' : PRIMARY,
          transition: 'width .3s ease',
        }}
      />
    </div>
  );
}
