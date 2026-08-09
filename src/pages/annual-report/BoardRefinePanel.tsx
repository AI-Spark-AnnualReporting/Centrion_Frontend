// "Refine with AI" for one section — the pattern from the AnnualReporting
// workspace's SectionChat, in this app's design language.
//
// The chips are one-click actions: clicking one sends it. They stay on screen
// afterwards, because a button that does something in one click is worth
// keeping — you may well want a second pass. Sent instructions stay listed,
// because the backend is stateless per call and the only record of what was
// asked is the one on screen.

import { useState } from 'react';
import { BOARD_REFINE_MAX } from '@/types/board';
import { ACCENT, BORDER_SOFT, FAINT, INK, MUTED, RED } from './board-ui';

const SUGGESTIONS = [
  'Make it concise',
  'More formal tone',
  'Expand detail',
  'Plain English',
] as const;

const TINT = 'rgba(64,64,200,.05)';
const TINT_BORDER = 'rgba(64,64,200,.18)';

export function BoardRefinePanel({
  refining,
  history,
  onRefine,
}: {
  refining: boolean;
  /** Instructions already sent for this section, oldest first. */
  history: string[];
  onRefine: (instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const trimmed = instruction.trim();
  const over = instruction.length > BOARD_REFINE_MAX;

  const send = (text: string) => {
    const value = text.trim();
    if (!value || value.length > BOARD_REFINE_MAX || refining) return;
    onRefine(value);
    setInstruction('');
  };

  return (
    <div
      className="print-hide"
      style={{
        marginTop: 14,
        padding: '13px 15px',
        borderRadius: 12,
        background: TINT,
        border: `1px solid ${TINT_BORDER}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: ACCENT,
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
            <path d="M6 1l1.1 3.3H11L8.5 6.4l1.1 3.3L6 7.8l-3.6 2 1.1-3.3L1 4.3h3.9z" fill="currentColor" />
          </svg>
        </span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: INK }}>Refine with AI</div>
          <div style={{ fontSize: 11, color: MUTED }}>
            Describe a change and it rewrites the text above.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, color: FAINT }}>Try:</span>
        {SUGGESTIONS.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={refining}
            // One click sends it — no second step.
            onClick={() => send(chip)}
            style={{
              padding: '6px 13px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              color: ACCENT,
              background: '#fff',
              border: `1px solid ${TINT_BORDER}`,
              cursor: refining ? 'not-allowed' : 'pointer',
              opacity: refining ? 0.55 : 1,
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <textarea
          className="inp"
          rows={2}
          disabled={refining}
          value={instruction}
          maxLength={BOARD_REFINE_MAX}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter is a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(instruction);
            }
          }}
          placeholder="e.g. tighten this into three paragraphs, keeping every figure"
          style={{ resize: 'none', flex: 1, minWidth: 0 }}
          aria-label="Refinement instruction"
        />
        <button
          type="button"
          className="btn bp"
          disabled={refining || !trimmed || over}
          onClick={() => send(instruction)}
          aria-label="Send instruction"
          style={{
            width: 38,
            height: 38,
            padding: 0,
            justifyContent: 'center',
            flexShrink: 0,
            opacity: refining || !trimmed || over ? 0.55 : 1,
          }}
        >
          {refining ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M14.5 1.5L7 9M14.5 1.5l-4.8 13-2.7-5.5L1.5 6.3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {over && (
        <div style={{ marginTop: 6, fontSize: 11, color: RED }}>
          {instruction.length}/{BOARD_REFINE_MAX} — too long.
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${BORDER_SOFT}` }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: '.6px',
              textTransform: 'uppercase',
              color: FAINT,
              marginBottom: 5,
            }}
          >
            Previous instructions
          </div>
          {history.map((h, i) => (
            <div key={`${i}-${h}`} style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.6 }}>
              · {h}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
