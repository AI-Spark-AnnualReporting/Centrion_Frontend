// Shared presentational helpers for the Annual Report cycle pages — status
// badge mapping, a compact date formatter, and a thin progress bar. Keeps the
// list/detail pages free of duplicated styling logic.

import { TooltipPortal } from '@radix-ui/react-tooltip';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

// "Nov 16" for this year, "Dec 3, 2025" for any other year — the short form for the
// Created column, in the same month-first style as the deadline next to it.
export function formatCreatedDate(input?: string | null, now: Date = new Date()): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  const showYear = d.getFullYear() !== now.getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: showYear ? 'numeric' : undefined,
  });
}

// "Created Nov 16, 2026, 9:04 AM" — full date and time for the hover tooltip.
export function formatCreatedTooltip(input?: string | null): string {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const when = d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Created ${when}`;
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

// `hint` = how the section gets its content, in one short line (feedback F15:
// the tags had no explanation). Shown on hover and in SectionModeLegend.
const SECTION_MODE: Record<SectionMode, { label: string; cls: string; hint: string }> = {
  generate: { label: 'Generate', cls: 'b-pp', hint: "AI writes it from the departments' answers." },
  attach: { label: 'Attach', cls: 'b-bl', hint: 'You upload a document; it goes in as-is.' },
  auto: { label: 'Auto', cls: 'b-gy', hint: 'Built automatically, e.g. the cover and contents.' },
  manual: { label: 'Manual', cls: 'b-am', hint: 'You write or paste it yourself.' },
  extract: { label: 'Extract', cls: 'b-tl', hint: 'AI pulls the content from a document you upload.' },
  analyze: { label: 'Analyze', cls: 'b-gn', hint: "AI draws findings from all the departments' inputs." },
};

// Same rest-before-opening delay as the onboarding "i" boxes, so moving the
// cursor down the outline table doesn't flash a note over every row.
const MODE_HINT_DELAY_MS = 500;

/** A section's mode tag; resting the cursor on it shows what the mode means. */
export function SectionModeBadge({ mode }: { mode: SectionMode }) {
  const m = SECTION_MODE[mode] ?? SECTION_MODE.auto;
  return (
    <TooltipProvider delayDuration={MODE_HINT_DELAY_MS}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`badge ${m.cls}`} style={{ cursor: 'help' }}>{m.label}</span>
        </TooltipTrigger>
        {/* Portal so the note isn't clipped by the table's card; z-[10002] so it
            also shows above the outline-picker modal (SelectOutlineModal). */}
        <TooltipPortal>
          <TooltipContent side="top" sideOffset={6} collisionPadding={12} className="hint-tip z-[10002]">
            {m.hint}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}

// The order the legend lists the modes in — the same as the filter chips.
const LEGEND_ORDER: SectionMode[] = ['generate', 'attach', 'auto', 'manual', 'extract', 'analyze'];

/** One compact row explaining every mode tag, shown above the outline table. */
export function SectionModeLegend() {
  return (
    <div className="mode-legend" aria-label="What the section tags mean">
      {LEGEND_ORDER.map((mode) => {
        const m = SECTION_MODE[mode];
        return (
          <span key={mode} className="mode-legend-item">
            <span className={`badge ${m.cls}`}>{m.label}</span>
            <span className="mode-legend-text">{m.hint}</span>
          </span>
        );
      })}
    </div>
  );
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
