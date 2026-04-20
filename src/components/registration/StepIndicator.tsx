interface StepIndicatorProps {
  currentStep: 1 | 2;
}

const ACCENT = '#4040C8';
const MUTED_BG = '#F1F2F6';
const MUTED_BORDER = '#E5E7EF';
const MUTED_TEXT = '#8A90A8';
const LABEL_ACTIVE = '#1F2340';

function Circle({ state, label }: { state: 'active' | 'done' | 'inactive'; label: string }) {
  const filled = state !== 'inactive';
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: filled ? ACCENT : MUTED_BG,
        border: filled ? `1px solid ${ACCENT}` : `1px solid ${MUTED_BORDER}`,
        color: filled ? '#fff' : MUTED_TEXT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 600,
        flexShrink: 0,
      }}
      aria-label={label}
    >
      {state === 'done' ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2L5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        label
      )}
    </div>
  );
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const step1State: 'active' | 'done' = currentStep === 1 ? 'active' : 'done';
  const step2State: 'active' | 'inactive' = currentStep === 2 ? 'active' : 'inactive';
  const connectorColor = currentStep === 2 ? ACCENT : MUTED_BORDER;

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Circle state={step1State} label="1" />
        <div style={{ flex: 1, height: 2, background: connectorColor, borderRadius: 1 }} />
        <Circle state={step2State} label="2" />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: currentStep === 1 ? LABEL_ACTIVE : MUTED_TEXT, fontWeight: 600 }}>
          Your Details
        </span>
        <span style={{ fontSize: 10, color: currentStep === 2 ? LABEL_ACTIVE : MUTED_TEXT, fontWeight: 600 }}>
          Company Setup
        </span>
      </div>
    </div>
  );
}

export default StepIndicator;
