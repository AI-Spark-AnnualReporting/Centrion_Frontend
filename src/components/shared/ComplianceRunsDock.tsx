// The "still validating" dock. Sits beside the Ask Centriyon launcher on every
// authenticated screen and is the reason a validation run no longer holds the
// user hostage: whatever they go off and do, the run stays visible here and
// says so when it lands.
//
// It is deliberately thin. The dock reports state, it doesn't own any — the
// provider polls, and the run's own screens are where anything gets decided.

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useComplianceRuns, type WatchedRun } from '@/context/ComplianceRunsContext';
import { runStateLabel, runTitle } from '@/lib/compliance-runs';
import { relativeSince } from '@/lib/time';

// The progress screen is a full-bleed takeover for one specific run, and the
// user is already looking at exactly what this dock would say about it. Only
// that run is hidden, though — a second run going at the same time is precisely
// the thing they can't otherwise see from in there.
const RUNNING_ROUTE = /^\/compliance\/runs\/([^/]+)\/running\/?$/;

function watchedRunId(pathname: string): string | null {
  const match = RUNNING_ROUTE.exec(pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

// Colour carries the state, as it does on the resume shelf. The words come from
// lib/compliance-runs so the two can't drift; only the dot is this widget's own.
const DOT_CLASS: Record<string, string> = {
  running: 'cdock-dot cdock-dot--running cdock-dot--live',
  done: 'cdock-dot cdock-dot--done',
  error: 'cdock-dot cdock-dot--error',
};

// "FY-2025" → "FY 2025". Mirrors the resume and certified cards.
function formatPeriod(period: string | null): string {
  return (period ?? '').replace(/[-_]/g, ' ').trim();
}

const TYPE_LABEL: Record<string, string> = {
  annual: 'Annual report',
  quarterly: 'Quarterly report',
  esg: 'ESG report',
  board_pack: 'Board pack',
};

// A run registered from the progress screen after a refresh has no title — the
// detail endpoint doesn't carry one. Name it by what it is rather than showing
// a blank card or a raw uuid.
function runLabel(run: WatchedRun): string {
  return runTitle(run.title) || (run.reportType && TYPE_LABEL[run.reportType]) || 'Validation run';
}

function Row({ run, onOpen, onDismiss }: { run: WatchedRun; onOpen: () => void; onDismiss: () => void }) {
  const period = formatPeriod(run.period);

  return (
    <div className="cdock-row">
      <span className={DOT_CLASS[run.status] ?? DOT_CLASS.done} aria-hidden />
      <button type="button" className="cdock-row-main" onClick={onOpen}>
        <span className="cdock-row-title">{runLabel(run)}</span>
        <span className="cdock-row-meta">
          {[period, runStateLabel(run.status), run.lostContact ? 'reconnecting…' : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </button>
      <span className="cdock-row-age">{relativeSince(run.createdAt)}</span>
      <button
        type="button"
        className="cdock-row-x"
        onClick={onDismiss}
        title="Stop showing me this"
        aria-label={`Stop showing ${runLabel(run)}`}
      >
        ×
      </button>
    </div>
  );
}

export function ComplianceRunsDock({ raised = false }: { raised?: boolean }) {
  const { runs: tracked, dismiss, forget, hrefFor } = useComplianceRuns();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const wrapRef = useRef<HTMLDivElement>(null);

  const onScreen = watchedRunId(pathname);
  const runs = onScreen ? tracked.filter((r) => r.runId !== onScreen) : tracked;
  const runningCount = runs.filter((r) => r.status === 'running').length;

  // Same dismissal affordances as the notification bell, the app's other
  // floating panel — a popover that can only be closed by its own × reads as
  // stuck, and is unreachable by keyboard alone.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (runs.length === 0) return null;

  // "Finished" is not one state. A run that failed has nothing ready to look
  // at, and calling it a result would contradict the row directly below, which
  // says it didn't finish.
  const ready = runs.filter((r) => r.status === 'done').length;
  const broken = runs.filter((r) => r.status === 'error').length;
  // Colour carries the state here exactly as it does on the resume shelf and on
  // the rows below: indigo while there's still work happening, green once
  // there's something to read, red when there's only a failure to explain.
  const tone = runningCount > 0 ? 'live' : ready > 0 ? 'ready' : 'failed';
  const summary =
    runningCount > 0
      ? `${runningCount} validating…`
      : ready > 0
        ? `${ready} ${ready === 1 ? 'result' : 'results'} ready`
        : `${broken} didn’t finish`;

  return (
    <div className={raised ? 'cdock cdock--raised' : 'cdock'} ref={wrapRef}>
      {open && (
        <div className="cdock-panel" role="group" aria-label="Validation runs">
          <div className="cdock-panel-head">
            <span>Validation runs</span>
            <button
              type="button"
              className="cdock-row-x"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {runs.map((run) => (
            <Row
              key={run.runId}
              run={run}
              onOpen={() => {
                setOpen(false);
                // A finished run has said all it has to say once it's opened.
                // One still going stays, so it can report back when it lands.
                if (run.status !== 'running') forget(run.runId);
                navigate(hrefFor(run));
              }}
              onDismiss={() => dismiss(run.runId)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className={`cdock-pill cdock-pill--${tone}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span
          className={
            tone === 'live'
              ? 'cdock-dot cdock-dot--onaccent cdock-dot--live'
              : 'cdock-dot cdock-dot--onaccent'
          }
          aria-hidden
        />
        <span className="cdock-pill-lbl">{summary}</span>
      </button>
    </div>
  );
}

export default ComplianceRunsDock;
