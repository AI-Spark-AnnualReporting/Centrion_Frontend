import { useState, useRef, useCallback, useEffect } from 'react';

const ACCENT = '#4040C8';
const DARK = '#1F2340';
const MUTED = '#6B7280';
const RED = '#EF4444';

// Same chips as the old whole-report refine chat.
const SUGGESTIONS = ['Make it concise', 'More formal tone', 'Expand detail'];

// Per-section refine bar — chips + free text + Send. Purely presentational: the
// caller owns the request and the state update, which is what lets quarterly and
// earnings share one bar over two different endpoints and two different section
// shapes. A rejected `onSend` shows in the banner below and the input is kept, so
// the user can fix the wording rather than retype it.
export function SectionRefineChat({
  onSend,
}: {
  onSend: (instruction: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text);
      if (!mountedRef.current) return;
      setInput('');
    } catch (err: unknown) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Refine failed. Please try again.');
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }, [input, sending, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid #ECEEF8' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: MUTED, textTransform: 'uppercase', marginBottom: 10 }}>
        Refine this section
      </div>

      {error && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 10,
            borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA',
            color: RED, fontSize: 12, fontWeight: 600,
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: RED, padding: 0, lineHeight: 0 }}
            aria-label="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Suggestion chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, flexShrink: 0 }}>Try:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => { setInput(s); inputRef.current?.focus(); }}
            disabled={sending}
            style={{
              padding: '5px 12px', fontSize: 12, fontWeight: 500, color: DARK,
              background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6,
              cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.5 : 1,
              whiteSpace: 'nowrap', transition: 'border-color .12s, background .12s',
            }}
            onMouseEnter={(e) => { if (!sending) { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = 'rgba(64,64,200,.04)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.background = '#fff'; }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 10 }}>
        {sending ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${ACCENT}`, background: '#fff' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 13, color: ACCENT, fontWeight: 600 }}>Refining…</span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell the agent how to adjust this section…"
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #D1D5DB',
              fontSize: 13, color: DARK, background: '#fff', outline: 'none', fontFamily: 'inherit',
              transition: 'border-color .15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#D1D5DB')}
          />
        )}

        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="bp"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 20px',
            fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
            opacity: !input.trim() || sending ? 0.55 : 1,
            cursor: !input.trim() || sending ? 'not-allowed' : 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8l12-6-6 12V9H2z" fill="currentColor" />
          </svg>
          Send
        </button>
      </div>
    </div>
  );
}
