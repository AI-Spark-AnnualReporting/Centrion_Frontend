// 5-step horizontal progress indicator for the onboarding wizard.
// done = green check, current = indigo number, future = grey number.

const ACCENT = '#4040C8';
const SUCCESS = '#22C55E';
const MUTED_BG = '#F1F2F6';
const MUTED_BORDER = '#E5E7EF';
const MUTED_TEXT = '#9BA3C4';

const STEPS = ['Company Intel', 'Review Details', 'Departments', 'Upload Reports', 'Dashboard'];

function Circle({ state, n }: { state: 'done' | 'active' | 'future'; n: number }) {
  const fill = state === 'done' ? SUCCESS : state === 'active' ? ACCENT : MUTED_BG;
  const border = state === 'future' ? `1.5px solid ${MUTED_BORDER}` : `1.5px solid ${fill}`;
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        background: fill,
        border,
        color: state === 'future' ? MUTED_TEXT : '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {state === 'done' ? (
        <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2L5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        n
      )}
    </div>
  );
}

export default function WizardStepper({ current }: { current: number }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state: 'done' | 'active' | 'future' =
            n < current ? 'done' : n === current ? 'active' : 'future';
          const isLast = i === STEPS.length - 1;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', flex: isLast ? '0 0 auto' : 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, width: 26 }}>
                <Circle state={state} n={n} />
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: state === 'active' ? 700 : 600,
                    color: state === 'active' ? ACCENT : MUTED_TEXT,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </span>
              </div>
              {!isLast && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    marginTop: 12,
                    borderRadius: 1,
                    background: n < current ? SUCCESS : MUTED_BORDER,
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
