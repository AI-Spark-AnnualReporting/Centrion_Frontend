// "Cycle setup" panel on a draft cycle's page, for admins. It sits beside the page
// and stays in view while it scrolls, so the admin always sees what is left before
// the cycle can be submitted, and Submit cycle is always within reach.
//
// Three steps, in the order of the cards on the page. They are the same three rules
// the Submit button has always checked: at least one department is added, every
// department has a lead, an outline is picked. Clicking a step scrolls to the
// card where it is done.
//
// Display only: the page owns every value and the submit itself.
import type { CSSProperties } from 'react';

export type SetupTarget = 'outline' | 'departments';

const INK = '#1A1D2E';
const FAINT = '#9BA3C4';
const ACCENT = '#4040C8';
const GREEN = '#15803D';
const LINE = '#ECEEF8';

export interface SetupStep {
  title: string;
  /** What is done, or what is missing. */
  detail: string;
  done: boolean;
  target: SetupTarget;
}

/** The three steps, with the wording each one shows right now. */
export function buildSetupSteps(
  outlineChosen: boolean,
  departmentCount: number,
  withoutLead: number,
): SetupStep[] {
  const hasDepartments = departmentCount > 0;

  let leadDetail = 'Every department needs a lead';
  if (hasDepartments && withoutLead === 0) leadDetail = 'Every department has a lead';
  if (hasDepartments && withoutLead > 0) leadDetail = `${withoutLead} without a lead`;

  // Same order as the cards on the page: Assign Departments sits above the Outline.
  return [
    {
      title: 'Add departments',
      detail: hasDepartments
        ? `${departmentCount} department${departmentCount === 1 ? '' : 's'} added`
        : 'Add at least one department',
      done: hasDepartments,
      target: 'departments',
    },
    {
      title: 'Give each a lead',
      detail: leadDetail,
      done: hasDepartments && withoutLead === 0,
      target: 'departments',
    },
    {
      title: 'Choose the outline',
      detail: outlineChosen ? 'Outline selected' : 'Select an outline',
      done: outlineChosen,
      target: 'outline',
    },
  ];
}

export interface CycleSetupPanelProps {
  outlineChosen: boolean;
  departmentCount: number;
  /** Departments still missing a lead (0 when the caller leads them all). */
  withoutLead: number;
  canSubmit: boolean;
  submitting: boolean;
  /** The section list is being (re)built: submitting now would use an unfinished list. */
  building: boolean;
  /** Result of the last submit: one of them is shown under the button. */
  message: string;
  error: string;
  onSubmit: () => void;
  onJump: (target: SetupTarget) => void;
}

export default function CycleSetupPanel({
  outlineChosen,
  departmentCount,
  withoutLead,
  canSubmit,
  submitting,
  building,
  message,
  error,
  onSubmit,
  onJump,
}: CycleSetupPanelProps) {
  const steps = buildSetupSteps(outlineChosen, departmentCount, withoutLead);
  const doneCount = steps.filter((s) => s.done).length;
  const left = steps.length - doneCount;
  const nextIndex = steps.findIndex((s) => !s.done);

  let note = `${left} of ${steps.length} steps left`;
  if (left === 0) note = 'Assigns the departments. The cycle stays in draft.';
  if (building) note = "Building sections… Submit is available when it's done.";

  return (
    <aside className="card cycle-setup-panel" aria-label="Cycle setup" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Cycle setup</div>
      <div
        aria-hidden="true"
        style={{ height: 6, borderRadius: 999, background: '#FAFBFE', border: `1px solid ${LINE}`, overflow: 'hidden' }}
      >
        <div style={{ height: '100%', width: `${Math.round((100 * doneCount) / steps.length)}%`, background: ACCENT, transition: 'width .2s' }} />
      </div>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {steps.map((step, i) => (
          <li key={step.title}>
            <StepButton step={step} number={i + 1} isNext={i === nextIndex} onJump={onJump} />
          </li>
        ))}
      </ol>

      <button
        className="btn bp"
        type="button"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={onSubmit}
        disabled={!canSubmit || submitting || building}
      >
        {submitting ? 'Submitting…' : '✓ Submit cycle'}
      </button>

      {message || error ? (
        <div
          role={error ? 'alert' : 'status'}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            background: error ? 'rgba(229,72,77,.08)' : 'rgba(34,197,94,.1)',
            border: `1px solid ${error ? 'rgba(229,72,77,.25)' : 'rgba(34,197,94,.25)'}`,
            color: error ? '#B33A3E' : '#16A34A',
          }}
        >
          {error || message}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: FAINT, textAlign: 'center' }}>{note}</div>
      )}
    </aside>
  );
}

/** One step: its number (✓ when done), title and status line. Jumps to its card. */
function StepButton({
  step,
  number,
  isNext,
  onJump,
}: {
  step: SetupStep;
  number: number;
  isNext: boolean;
  onJump: (target: SetupTarget) => void;
}) {
  let circleColor = FAINT;
  let circleBorder = LINE;
  let circleFill = '#fff';
  if (step.done) {
    circleColor = '#fff';
    circleBorder = GREEN;
    circleFill = GREEN;
  } else if (isNext) {
    circleColor = ACCENT;
    circleBorder = ACCENT;
  }

  const button: CSSProperties = {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '22px minmax(0, 1fr)',
    gap: 10,
    alignItems: 'start',
    textAlign: 'left',
    border: 'none',
    background: isNext ? '#F5F5FF' : 'transparent',
    borderRadius: 10,
    padding: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
  return (
    <button type="button" style={button} onClick={() => onJump(step.target)}>
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 800,
          color: circleColor,
          border: `1.5px solid ${circleBorder}`,
          background: circleFill,
        }}
      >
        {step.done ? '✓' : number}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: INK }}>{step.title}</span>
        <span style={{ display: 'block', fontSize: 11, marginTop: 2, color: step.done ? GREEN : FAINT }}>
          {step.done ? `Done · ${step.detail}` : step.detail}
        </span>
      </span>
    </button>
  );
}
