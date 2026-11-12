import type { CSSProperties, ReactNode } from 'react';
import { CheckCircle2, ChevronRight, FileText, MinusCircle, XCircle } from 'lucide-react';
import type { LiveRun, LiveRunFile, LiveStep } from '@/types/company';
import {
  bannerHeading,
  countFinishedSteps,
  overruleLine,
  popupForStep,
  stateWords,
  type SummaryKey,
} from './extractionLive';

// The live table on Upload Previous Reports: a banner saying which file and year is
// being read, then one row per step that fills in while the report is read.
// Motion lives in the .xlive-* classes in index.css (switched off for reduced motion).

const SKELETON_WIDTHS = [150, 110, 90, 130, 120, 100, 140, 115, 95, 125, 105];

const rowBase: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  width: '100%',
  padding: '11px 16px',
  background: 'none',
  // Each side on its own (no `border` shorthand): the start edge changes colour
  // while a row runs, and React warns when a shorthand and a longhand are mixed.
  borderTop: 'none',
  borderInlineEnd: 'none',
  borderBottom: '1px solid #EEF0F7',
  borderInlineStartWidth: 3,
  borderInlineStartStyle: 'solid',
  borderInlineStartColor: 'transparent',
  textAlign: 'start',
  fontFamily: 'inherit',
};

/** The banner above the table: file name(s), year, the overrule line, progress. */
export function RunBanner({ run, running, percent, detail }: {
  run: LiveRun | null;
  running: boolean;
  percent: number | null;
  detail: string | null;
}) {
  const files = run?.files ?? [];
  const overrule = run ? overruleLine(run) : null;
  return (
    <div
      className="xlive-banner"
      role="status"
      style={{
        border: `1px solid ${running ? '#D8DCEF' : '#ECEEF8'}`,
        background: running ? '#F8F9FE' : '#FAFBFE',
        borderRadius: 12,
        padding: '12px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {running && (
          <span className="proc-ring" aria-hidden="true" style={{ width: 13, height: 13, borderWidth: 2, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1A1D2E' }}>
          {bannerHeading(running, files.length)}
        </span>
        {running && percent !== null && (
          <span style={{ marginInlineStart: 'auto', fontSize: 11, fontWeight: 700, color: '#4040C8' }}>
            {percent}%
          </span>
        )}
      </div>
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {files.map((file) => (
            <FileChip key={file.document_id} file={file} />
          ))}
        </div>
      )}
      {overrule && run && <OverruleLine text={overrule} overrules={run.overrules} />}
      {running && detail && (
        <div style={{ fontSize: 11, color: '#5A6080', marginTop: 8 }}>{detail}</div>
      )}
      {running && percent !== null && <ProgressBar percent={percent} />}
    </div>
  );
}

/** One uploaded file: its name and the year we read from it. */
function FileChip({ file }: { file: LiveRunFile }) {
  const hasPeriod = Boolean(file.period) && file.period !== 'FY-unknown';
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
        background: '#fff', border: '1px solid #ECEEF8', borderRadius: 999,
        padding: '3px 10px', fontSize: 11.5, color: '#3A3F58',
      }}
    >
      <FileText size={12} color="#9BA3C4" aria-hidden="true" style={{ flexShrink: 0 }} />
      <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
        {file.filename}
      </span>
      {hasPeriod && <span style={{ fontWeight: 800, color: '#4040C8', flexShrink: 0 }}>{file.period}</span>}
    </span>
  );
}

/** Green when this upload replaces the company-wide results, amber when it does not. */
function OverruleLine({ text, overrules }: { text: string; overrules: boolean }) {
  return (
    <div
      style={{
        display: 'inline-block', marginTop: 8, borderRadius: 8, padding: '4px 10px',
        fontSize: 11.5, fontWeight: 700,
        color: overrules ? '#0F9D6B' : '#B45309',
        background: overrules ? '#E9F7F1' : '#FDF3E2',
      }}
    >
      {text}
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ height: 4, borderRadius: 999, background: '#ECEEF8', marginTop: 10, overflow: 'hidden' }}
    >
      <div className="xlive-bar" style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: '#4040C8' }} />
    </div>
  );
}

/** The vertical table: one row per step, in the order the backend gives. */
export function LiveStepsTable({ steps, onOpen }: {
  steps: LiveStep[];
  onOpen: (popup: SummaryKey) => void;
}) {
  const finished = countFinishedSteps(steps);
  return (
    <div className="card xlive" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', padding: '9px 16px',
          background: '#FAFBFE', borderBottom: '1px solid #EEF0F7',
          fontSize: 10.5, fontWeight: 700, letterSpacing: '.6px', textTransform: 'uppercase', color: '#9BA3C4',
        }}
      >
        <span>What we read</span>
        <span>{finished} of {steps.length} finished</span>
      </div>
      {steps.map((step, index) => (
        <StepRow key={step.key} step={step} index={index} onOpen={onOpen} />
      ))}
    </div>
  );
}

/** One row. Rows with details are buttons that open the popup once they have ended. */
function StepRow({ step, index, onOpen }: {
  step: LiveStep;
  index: number;
  onOpen: (popup: SummaryKey) => void;
}) {
  const popup = popupForStep(step.key);
  const hasEnded = step.state !== 'pending' && step.state !== 'running';
  const isRunning = step.state === 'running';
  const label = `${step.label}: ${stateWords(step.state)}`;
  const reasonId = `xlive-reason-${step.key}`;
  const showsReason = hasEnded && step.state !== 'done' && Boolean(step.message);
  const style: CSSProperties = {
    ...rowBase,
    borderInlineStartColor: isRunning ? '#4040C8' : 'transparent',
  };
  const className = `xlive-row${isRunning ? ' xlive-row-running' : ''}`;
  const content = (
    <>
      <span style={{ width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <StepIcon step={step} index={index} />
      </span>
      <span style={{ width: 230, maxWidth: '42%', flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: step.state === 'pending' ? '#9BA3C4' : '#1A1D2E' }}>
        {step.label}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <StepValue step={step} index={index} />
        {showsReason && <StepReason id={reasonId} step={step} />}
      </span>
    </>
  );

  if (popup && hasEnded) {
    return (
      <button
        type="button"
        className={className}
        style={{ ...style, cursor: 'pointer' }}
        aria-label={label}
        aria-describedby={showsReason ? reasonId : undefined}
        onClick={() => onOpen(popup)}
      >
        {content}
        <ChevronRight size={15} color="#9BA3C4" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
      </button>
    );
  }
  return (
    <div
      role="group"
      className={className}
      style={style}
      aria-label={label}
      aria-describedby={showsReason ? reasonId : undefined}
      aria-busy={isRunning || undefined}
    >
      {content}
    </div>
  );
}

/** Spinner, tick, cross, dash, or a faint dot while the step waits its turn. */
function StepIcon({ step, index }: { step: LiveStep; index: number }) {
  if (step.state === 'running') {
    return <span className="proc-ring" aria-hidden="true" style={{ width: 13, height: 13, borderWidth: 2 }} />;
  }
  if (step.state === 'pending') {
    return <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#D8DCEF' }} />;
  }
  // Keyed by state so the icon is a new element (and pops in) when the state changes,
  // but is left alone by the polls in between.
  return (
    <span
      key={step.state}
      className="xlive-pop"
      aria-hidden="true"
      style={{ display: 'flex', animationDelay: `${index * 35}ms` }}
    >
      <EndIcon step={step} />
    </span>
  );
}

function EndIcon({ step }: { step: LiveStep }): ReactNode {
  if (step.state === 'done') return <CheckCircle2 size={18} color="#0F9D6B" />;
  if (step.state === 'failed') return <XCircle size={18} color="#DC2626" />;
  return <MinusCircle size={18} color="#9BA3C4" />;
}

/** The right-hand cell: shimmer bar, "Working on it", the value, or a short verdict. */
function StepValue({ step, index }: { step: LiveStep; index: number }) {
  if (step.state === 'pending') {
    const width = SKELETON_WIDTHS[index % SKELETON_WIDTHS.length];
    return <span className="skel" aria-hidden="true" style={{ display: 'block', width, maxWidth: '100%', height: 10, marginTop: 5 }} />;
  }
  if (step.state === 'running') {
    return <span style={{ fontSize: 12, color: '#4040C8', fontWeight: 600 }}>Working on it…</span>;
  }
  const text = step.value || endWords(step);
  const color = step.state === 'done' ? '#1A1D2E' : step.state === 'failed' ? '#DC2626' : '#5A6080';
  return (
    <span
      key={step.state}
      className="xlive-fade"
      dir="auto"
      style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color, overflowWrap: 'anywhere' }}
    >
      {text}
    </span>
  );
}

/** What to print when an ended step carries no value of its own. */
function endWords(step: LiveStep): string {
  if (step.state === 'done') return 'Done';
  if (step.state === 'failed') return 'Not extracted';
  return 'Skipped';
}

/** The reason sentence under a failed or skipped row. */
function StepReason({ id, step }: { id: string; step: LiveStep }) {
  return (
    <span
      id={id}
      className="xlive-fade"
      style={{ display: 'block', marginTop: 2, fontSize: 11.5, lineHeight: 1.45, color: step.state === 'failed' ? '#B4302A' : '#5A6080' }}
    >
      {step.message}
    </span>
  );
}
