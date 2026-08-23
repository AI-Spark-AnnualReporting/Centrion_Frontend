import { useNavigate } from 'react-router-dom';
import { INK, ACCENT, ACCENT_TINT, BORDER, FAINT } from './tokens';

const STEPS: { label: string; path: (reportId: string) => string }[] = [
  { label: 'Setup', path: () => '/earnings/setup' },
  { label: 'Outline', path: (reportId) => `/earnings/${reportId}/outline` },
  // Step 3 is where the report is built: every section in a rail, figures chosen
  // per financial section, narrative prose read and edited in place. Step 4 is the
  // finished thing, in one scroll, with approve and export beside it.
  { label: 'Preview', path: (reportId) => `/earnings/${reportId}/preview` },
  { label: 'Report', path: (reportId) => `/earnings/${reportId}/report` },
];

type StepState = 'done' | 'active' | 'upcoming';

// The 4-step progress bar shown at the top of every earnings screen except
// Setup itself (step 1) — Setup is where the user lands, not somewhere they
// need to be told they've arrived. Done/active steps are clickable (jump back
// to something already reached); an upcoming step is disabled — it can only
// be reached by actually completing the current screen's Continue action, not
// by skipping ahead via the stepper. Once the report is approved & locked,
// EVERY step besides the current one is disabled — an approved report is
// final, so there's no going back to re-edit Setup/Outline/Preview either.
export function EarningsStepper({
  activeStep,
  reportId,
  locked = false,
}: {
  activeStep: number;
  reportId?: string | null;
  locked?: boolean;
}) {
  const navigate = useNavigate();
  const activeIndex = activeStep - 1; // 0-based

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {STEPS.map((step, i) => {
          const state: StepState = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming';
          const circleBg = state === 'active' ? ACCENT : state === 'done' ? ACCENT_TINT : '#F1F2F6';
          const circleColor = state === 'active' ? '#fff' : state === 'done' ? ACCENT : FAINT;
          const titleColor = state === 'upcoming' ? FAINT : INK;
          const disabled = locked ? i !== activeIndex : (i > 0 && !reportId) || state === 'upcoming';

          return (
            <div
              key={step.label}
              style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}
            >
              <button
                type="button"
                disabled={disabled}
                title={
                  locked && i !== activeIndex
                    ? 'This report is approved and locked — it can no longer be edited.'
                    : state === 'upcoming'
                      ? 'Complete the current step to continue'
                      : undefined
                }
                onClick={() => navigate(step.path(reportId ?? ''))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  background: 'none',
                  border: 'none',
                  padding: 4,
                  margin: -4,
                  borderRadius: 8,
                  cursor: disabled ? 'default' : 'pointer',
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11.5,
                    fontWeight: 700,
                    background: circleBg,
                    color: circleColor,
                    transition: 'background .15s, color .15s',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: titleColor, whiteSpace: 'nowrap' }}>
                  {step.label}
                </span>
              </button>

              {i < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1.5,
                    margin: '0 14px',
                    borderRadius: 1,
                    background: i < activeIndex ? ACCENT_TINT : BORDER,
                    transition: 'background .15s',
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
