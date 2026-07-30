import { useEffect, useRef, useState } from 'react';
import type { EarningsFigure } from '@/types/earnings';
import { formatFigureValue } from '@/pages/earnings/helpers';
import { INK, FAINT, ACCENT, DANGER } from './tokens';

const MONO = "'DM Mono', 'Courier New', monospace";

// A single editable value cell. Click the value (or pencil) → inline input;
// save on blur / Enter, cancel on Esc. The actual persistence (optimistic PATCH
// + rollback) is owned by the parent via `onSave`, which resolves on success and
// rejects on failure.
export function EditableValueCell({
  figure,
  onSave,
}: {
  figure: EarningsFigure;
  onSave: (value: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = () => {
    cancelledRef.current = false;
    setError(null);
    setDraft(figure.value == null ? '' : String(figure.value));
    setEditing(true);
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      el.select();
    }
  }, [editing]);

  const commit = async () => {
    if (cancelledRef.current || saving) return;
    const parsed = Number(draft.replace(/,/g, '').trim());
    if (draft.trim() === '' || Number.isNaN(parsed)) {
      setError('Enter a number');
      return;
    }
    if (parsed === figure.value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    cancelledRef.current = true;
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={open}
        title="Click to edit"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: 'pointer',
          fontFamily: MONO,
          fontWeight: 700,
          fontSize: 13,
          color: INK,
        }}
      >
        {formatFigureValue(figure.value, figure.unit)}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden style={{ color: FAINT }}>
          <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </button>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <input
          ref={inputRef}
          value={draft}
          disabled={saving}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          style={{
            width: 110,
            padding: '6px 8px',
            borderRadius: 6,
            border: `1px solid ${error ? '#FECACA' : ACCENT}`,
            fontSize: 12.5,
            fontFamily: MONO,
            color: INK,
            outline: 'none',
          }}
        />
        {figure.unit && <span style={{ fontSize: 11, color: FAINT }}>{figure.unit}</span>}
        {saving && (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
      </span>
      {error && <span style={{ fontSize: 10.5, color: DANGER }}>{error}</span>}
    </span>
  );
}
