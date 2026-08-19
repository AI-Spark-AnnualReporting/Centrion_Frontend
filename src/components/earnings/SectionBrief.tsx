// What the user wants in a section, in their own words.
//
// This used to be a tall empty textarea that owned the card — the loudest element
// on screen was the one with nothing in it. Once a section has figures, the brief
// steps back to a quoted line and the figures take the weight, because they are
// the content. Editing brings the field back.

import { useEffect, useRef } from 'react';
import { INK, MUTED, FAINT, ACCENT, BORDER } from './tokens';

// A worked example teaches the shape of a good brief better than instructions do:
// a kind of figure, not a list of exact labels.
const PLACEHOLDER = 'revenue, margins, anything broken out by segment…';

export function SectionBrief({
  value,
  onChange,
  onSearch,
  searching,
  collapsed,
  onExpand,
  sectionTitle,
}: {
  value: string;
  onChange: (v: string) => void;
  onSearch: () => void;
  searching: boolean;
  /** Sits quiet once the section has figures; the field returns on Edit. */
  collapsed: boolean;
  onExpand: () => void;
  sectionTitle: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grows with the text instead of scrolling inside a fixed box.
  useEffect(() => {
    const el = ref.current;
    if (!el || collapsed) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [value, collapsed]);

  if (collapsed) {
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 2 }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            color: value.trim() ? MUTED : FAINT,
            fontStyle: value.trim() ? 'italic' : 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {value.trim() ? `“${value.trim()}”` : 'No brief — these were picked for you'}
        </span>
        <button
          type="button"
          onClick={onExpand}
          style={{
            flexShrink: 0,
            border: 'none',
            background: 'none',
            padding: 0,
            font: 'inherit',
            fontSize: 11,
            fontWeight: 700,
            color: ACCENT,
            cursor: 'pointer',
          }}
        >
          Edit brief
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 2 }}>
      <textarea
        ref={ref}
        className="inp"
        aria-label={`What figures belong in ${sectionTitle}`}
        placeholder={PLACEHOLDER}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter searches; Shift+Enter is a new line. The button is right there,
          // but the hands are already on the keyboard.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!searching) onSearch();
          }
        }}
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          overflow: 'hidden',
          fontSize: 12.5,
          lineHeight: 1.5,
          color: INK,
          borderColor: BORDER,
          padding: '9px 12px',
        }}
      />
      <button
        type="button"
        className="btn bp"
        disabled={searching}
        onClick={onSearch}
        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
      >
        {searching ? 'Searching…' : 'Search figures'}
      </button>
    </div>
  );
}
