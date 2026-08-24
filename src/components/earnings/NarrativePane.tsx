// A narrative section on the Preview screen: its prose when it has some, and an
// honest way forward when it does not.
//
// Three of these sections — Executive Summary, Financial Review, Capital
// Allocation — are written FROM the report's figures, and the backend rejects any
// prose carrying a number that is not among them. So they cannot run until the
// user has filled something in, and the interesting design question is what the
// screen says in the meantime.
//
// It says which sections are still empty, and each one is a link that takes you
// there. Not "you can't do that yet" — a list of the work that would make it
// possible, one click from each. And Run stays live regardless: the check is
// there to inform, never to trap. A user who knows something we do not gets to
// press the button.

import { useState } from 'react';
import type { EarningsProducedSection } from '@/types/earnings';
import { MUTED, FAINT, ACCENT, BORDER_SOFT, DANGER } from './tokens';

export interface EmptySection {
  section_code: string;
  title: string;
}

export function NarrativePane({
  section,
  emptySections,
  running,
  runError,
  onRun,
  onJumpTo,
  children,
}: {
  section: EarningsProducedSection;
  /** Financial sections with no figures yet — what this one is waiting on. */
  emptySections: EmptySection[];
  running: boolean;
  runError: string | null;
  onRun: (regenerate: boolean) => void;
  onJumpTo: (code: string) => void;
  /** The produced prose, rendered by the caller so editing stays in one place. */
  children?: React.ReactNode;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const hasContent = !!(section.content || '').trim();

  if (hasContent) {
    return (
      <div>
        {children}
        <div
          style={{
            marginTop: 16,
            paddingTop: 13,
            borderTop: `1px solid ${BORDER_SOFT}`,
          }}
        >
          <span style={{ fontSize: 11.5, color: FAINT }}>Written from your figures.</span>
        </div>
        {runError && (
          <div role="alert" style={{ fontSize: 12, color: DANGER, fontWeight: 700, marginTop: 9 }}>
            {runError}
          </div>
        )}
      </div>
    );
  }

  // Never run, or run and rejected. Deliberately the same screen: a section that
  // came back with an ungrounded number is not a broken state to apologise for,
  // it is a section that still needs running once the figures are in.
  return (
    <div>
      <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 560 }}>
        This section is written from the figures in your report. Run it whenever you
        like — it reads whatever is there at the time, and you can run it again after
        you add more.
      </p>

      {emptySections.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(245,158,11,.08)',
            border: '1px solid rgba(245,158,11,.22)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>
            {emptySections.length} section{emptySections.length === 1 ? '' : 's'} still
            {emptySections.length === 1 ? ' has' : ' have'} no figures
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {emptySections.map((s) => (
              <button
                key={s.section_code}
                type="button"
                onClick={() => onJumpTo(s.section_code)}
                style={{
                  border: '1px solid rgba(245,158,11,.35)',
                  background: '#fff',
                  borderRadius: 20,
                  padding: '3px 11px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: '#B45309',
                }}
              >
                {s.title} →
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#B45309', marginTop: 9, opacity: 0.85 }}>
            Running now still works — it will just be written from less.
          </div>
        </div>
      )}

      {runError && (
        <div
          role="alert"
          style={{
            marginTop: 14,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'rgba(229,72,77,.07)',
            border: '1px solid rgba(229,72,77,.2)',
          }}
        >
          <div style={{ fontSize: 12.5, color: DANGER, fontWeight: 700 }}>
            That run didn't produce anything usable
          </div>
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              marginTop: 5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 11.5,
              fontWeight: 700,
              color: ACCENT,
            }}
          >
            {showWhy ? 'Hide the detail' : 'Why?'}
          </button>
          {showWhy && (
            <p style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.55, margin: '7px 0 0' }}>
              {runError}
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button
          type="button"
          className="btn bp"
          disabled={running}
          onClick={() => onRun(false)}
        >
          {running ? 'Writing…' : runError ? 'Try again' : 'Run this section'}
        </button>
        <span style={{ fontSize: 11.5, color: FAINT }}>
          {running ? 'This takes a few seconds.' : 'You can run it as often as you want.'}
        </span>
      </div>
    </div>
  );
}
