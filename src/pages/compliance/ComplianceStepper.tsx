// 3-step progress indicator for the Compliance Validation wizard.
// Display-only (not clickable) — mirrors components/quarterly/QuarterlyReportStepper.

const ACCENT = '#4040C8';
const GREEN = '#10B981';
const GREEN_LIGHT = '#D1FAE5';
const MUTED_BG = '#F1F2F6';
const MUTED_BORDER = '#E5E7EF';
const MUTED_TEXT = '#8A90A8';
const DARK_TEXT = '#1F2340';

const STEPS = [
  { label: 'Set up', hint: 'Source · Regulators · Validate' },
  { label: 'Review', hint: 'Results & gaps' },
  { label: 'Gate', hint: 'Publish & certify' },
];

type State = 'done' | 'active' | 'inactive';

function StepCircle({ state, index }: { state: State; index: number }) {
  const bg = state === 'done' ? GREEN_LIGHT : state === 'active' ? ACCENT : MUTED_BG;
  const border = state === 'done' ? GREEN : state === 'active' ? ACCENT : MUTED_BORDER;
  const color = state === 'done' ? GREEN : state === 'active' ? '#fff' : MUTED_TEXT;

  return (
    <div
      style={{
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: bg,
        border: `1.5px solid ${border}`,
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      {state === 'done' ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.2L5 8.7l4.5-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        String(index + 1)
      )}
    </div>
  );
}

export function ComplianceStepper({ activeStep }: { activeStep: 1 | 2 | 3 }) {
  const activeIndex = activeStep - 1;

  return (
    <div className="card" style={{ padding: '14px 20px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEPS.map((step, i) => {
          const state: State = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'inactive';
          const isLast = i === STEPS.length - 1;

          return (
            <div
              key={step.label}
              style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? '0 0 auto' : 1 }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  opacity: state === 'inactive' ? 0.5 : 1,
                  transition: 'opacity .15s',
                }}
              >
                <StepCircle state={state} index={i} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: state === 'active' ? 700 : 600,
                    color: state === 'active' ? DARK_TEXT : state === 'done' ? '#3D8B75' : MUTED_TEXT,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {state === 'done' ? '✓ ' : ''}
                  {step.label}
                </span>
                <span style={{ fontSize: 10, color: MUTED_TEXT, whiteSpace: 'nowrap' }}>
                  {step.hint}
                </span>
              </div>

              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: 1.5,
                    marginTop: 12,
                    marginLeft: 10,
                    marginRight: 10,
                    borderRadius: 1,
                    background: i < activeIndex ? GREEN : MUTED_BORDER,
                    transition: 'background .2s',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ComplianceStepper;
