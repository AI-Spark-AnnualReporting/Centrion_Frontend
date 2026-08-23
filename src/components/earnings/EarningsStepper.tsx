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
// to something already reached); a step the report has not reached is disabled —
// it can only be reached by actually completing the current screen's Continue
// action, not by skipping ahead. Once the report is approved & locked, EVERY
// step besides the current one is disabled — an approved report is final, so
// there's no going back to re-edit Setup/Outline/Preview either.
//
// `reachedStep` is how far the REPORT has got, which is not the same as which
// screen you happen to be looking at. Without it "reached" was inferred from the
// current URL alone, so opening a finished report at Preview greyed out Report —
// the user could not click through to the thing they had already built, and the
// only way forward was to re-run the whole build. Omitted, it falls back to the
// old URL-derived behaviour.
export function EarningsStepper({
  activeStep,
  reportId,
  locked = false,
  reachedStep,
}: {
  activeStep: number;
  reportId?: string | null;
  locked?: boolean;
  reachedStep?: number;
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
          const stepLabelColor = state === 'active' ? ACCENT : state === 'done' ? FAINT : '#B7BCD6';
          const titleColor = state === 'upcoming' ? FAINT : INK;
          const reachedIndex = Math.max(activeIndex, (reachedStep ?? activeStep) - 1);
          const beyondReport = i > reachedIndex;
          const disabled = locked ? i !== activeIndex : (i > 0 && !reportId) || beyondReport;

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
                    : beyondReport
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
                <span style={{ whiteSpace: 'nowrap' }}>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      color: stepLabelColor,
                      marginRight: 5,
                    }}
                  >
                    STEP {i + 1}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: titleColor }}>{step.label}</span>
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
