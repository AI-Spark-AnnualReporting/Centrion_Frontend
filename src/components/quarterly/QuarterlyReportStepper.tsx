interface QuarterlyReportStepperProps {
  activeStep: number; // 1-based
  reportId: string;
}

const STEPS = [
  { label: 'Period' },
  { label: 'Documents' },
  { label: 'Extraction' },
  { label: 'Coverage' },
  { label: 'Gaps' },
  { label: 'Preview' },
];

const ACCENT = '#4040C8';
const ACCENT_LIGHT = '#E8E8F8';
const GREEN = '#10B981';
const GREEN_LIGHT = '#D1FAE5';
const MUTED_BG = '#F1F2F6';
const MUTED_BORDER = '#E5E7EF';
const MUTED_TEXT = '#8A90A8';
const DARK_TEXT = '#1F2340';

function StepCircle({
  state,
  index,
}: {
  state: 'done' | 'active' | 'inactive';
  index: number;
}) {
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

export function QuarterlyReportStepper({ activeStep }: QuarterlyReportStepperProps) {
  const activeIndex = activeStep - 1; // convert to 0-based

  return (
    <div
      style={{
        borderBottom: '1px solid #E5E7EF',
        padding: '14px 28px',
        marginBottom: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((step, i) => {
          const state: 'done' | 'active' | 'inactive' =
            i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'inactive';

          return (
            <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
              {/* Step node — display only, not interactive */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'default',
                  opacity: state === 'inactive' ? 0.45 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <StepCircle state={state} index={i} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: state === 'active' ? 700 : 500,
                    color: state === 'active' ? DARK_TEXT : state === 'done' ? '#3D8B75' : MUTED_TEXT,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.01em',
                  }}
                >
                  {state === 'done' ? '✓ ' : ''}{step.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1.5,
                    marginBottom: 14,
                    marginLeft: 6,
                    marginRight: 6,
                    background: i < activeIndex ? GREEN : MUTED_BORDER,
                    borderRadius: 1,
                    transition: 'background 0.2s',
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
