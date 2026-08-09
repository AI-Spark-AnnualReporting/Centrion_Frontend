// The frame every Board Report step shares: the clickable stepper, the page
// header, and the one fetch each step needs regardless of its own data (is this
// report locked, and what period is it for).
//
// The steps are routes, matching the Earnings flow — Setup is a page of its own
// (/board-report) and the three build steps each have a URL, so a refresh or a
// bookmark lands where you were.

import { useNavigate } from 'react-router-dom';
import { BOARD_STEPS } from './useBoardReport';
import { ACCENT, ACCENT_TINT, BORDER, FAINT, INK, MONO, MUTED } from './board-ui';

type StepState = 'done' | 'active' | 'upcoming';

/**
 * The 3-step progress bar shown at the top of every build step. Done and active
 * steps are clickable; an upcoming step is disabled — the only way forward is
 * the step's own primary action, not a jump. Once the report is approved, every
 * step but the current one is disabled: an approved report is final.
 */
export function BoardStepper({
  activeStep,
  reportId,
  locked = false,
}: {
  activeStep: number; // 1-based
  reportId?: string | null;
  locked?: boolean;
}) {
  const navigate = useNavigate();
  const activeIndex = activeStep - 1;

  return (
    <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {BOARD_STEPS.map((step, i) => {
          const state: StepState = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'upcoming';
          const circleBg = state === 'active' ? ACCENT : state === 'done' ? ACCENT_TINT : '#F1F2F6';
          const circleColor = state === 'active' ? '#fff' : state === 'done' ? ACCENT : FAINT;
          const stepLabelColor = state === 'active' ? ACCENT : state === 'done' ? FAINT : '#B7BCD6';
          const titleColor = state === 'upcoming' ? FAINT : INK;
          const disabled = locked ? i !== activeIndex : !reportId || state === 'upcoming';

          return (
            <div
              key={step.label}
              style={{ display: 'flex', alignItems: 'center', flex: i < BOARD_STEPS.length - 1 ? 1 : 'none' }}
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
                onClick={() => reportId && navigate(step.path(reportId))}
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
                  fontFamily: 'inherit',
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

              {i < BOARD_STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 1.5,
                    margin: '0 12px',
                    borderRadius: 1,
                    background: i < activeIndex ? ACCENT_TINT : '#EDEEF4',
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

/** Stepper + page header, wrapped around a step's own content. */
export function BoardStepShell({
  step,
  reportId,
  locked,
  period,
  title,
  sub,
  children,
}: {
  step: number;
  reportId: string;
  locked: boolean;
  period: string;
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="print-hide">
        <BoardStepper activeStep={step} reportId={reportId} locked={locked} />
        <div
          style={{
            marginBottom: 14,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>{title}</h1>
            <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{sub}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {period && (
              <span className="badge b-gy" style={{ fontFamily: MONO }}>
                {period}
              </span>
            )}
            {locked && <span className="badge b-gn">● Approved &amp; Locked</span>}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

/** The row of actions that closes each step's card. */
export function StepActions({
  back,
  backLabel,
  hint,
  children,
}: {
  back: () => void;
  backLabel: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="print-hide"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginTop: 18,
        paddingTop: 16,
        borderTop: '1px solid #ECEEF8',
        flexWrap: 'wrap',
      }}
    >
      <button className="btn bs" onClick={back} style={{ padding: '10px 18px', fontSize: 13 }}>
        ← {backLabel}
      </button>
      {hint}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{children}</div>
    </div>
  );
}
