import { useState, useRef, useCallback } from 'react';
import { quarterlyReports } from '@/lib/api';
import type { ChatStreamEvent } from '@/types/quarterly';

const ACCENT = '#4040C8';
const DARK = '#1F2340';
const MUTED = '#6B7280';
const RED = '#EF4444';

const SUGGESTIONS = ['Make it concise', 'More formal tone', 'Expand detail'];

interface Props {
  companyId: string;
  reportId: string;
  onDone: () => void;
}

export function ReportChatPanel({
  companyId,
  reportId,
  onDone,
}: Props) {
  const [toolActive, setToolActive] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setToolActive(false);
    setError(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await quarterlyReports.streamChatMessage(
        companyId, reportId, text,
        (event: ChatStreamEvent) => {
          switch (event.type) {
            case 'tool_start':
              setToolActive(true);
              break;
            case 'tool_end':
              setToolActive(false);
              break;
            case 'error':
              setError(event.message ?? 'An error occurred.');
              break;
            case 'done':
              setToolActive(false);
              onDone();
              break;
          }
        },
        abort.signal,
      );
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setSending(false);
      setToolActive(false);
      abortRef.current = null;
    }
  }, [companyId, reportId, input, sending, onDone]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
  };

  const isBusy = sending || toolActive;

  return (
    <div
      style={{
        flexShrink: 0,
        background: '#FAFBFF',
        borderTop: '1px solid #E5E7EF',
        // Left padding aligns the panel with the document column: page padding
        // (28) + sections rail (220) + grid gap (18) = 266px.
        padding: '14px 28px 16px 266px',
      }}
    >
      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            marginBottom: 10,
            borderRadius: 8,
            background: '#FEF2F2',
            border: `1px solid #FECACA`,
            color: RED,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="8" cy="8" r="6.5" stroke={RED} strokeWidth="1.3" />
            <path d="M8 5v3.5M8 11h.01" stroke={RED} strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: RED, padding: 0, lineHeight: 0 }}
            aria-label="Dismiss"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

      {/* Suggestion chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, flexShrink: 0 }}>Try:</span>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => { setInput(s); inputRef.current?.focus(); }}
            disabled={isBusy}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 500,
              color: DARK,
              background: '#fff',
              border: '1px solid #D1D5DB',
              borderRadius: 6,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              opacity: isBusy ? 0.5 : 1,
              whiteSpace: 'nowrap',
              transition: 'border-color .12s, background .12s',
            }}
            onMouseEnter={(e) => { if (!isBusy) { e.currentTarget.style.borderColor = ACCENT; e.currentTarget.style.background = 'rgba(64,64,200,.04)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.background = '#fff'; }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input row — input + Send */}
      <div style={{ display: 'flex', gap: 10 }}>
        {isBusy ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1.5px solid ${ACCENT}`, background: '#fff' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 13, color: ACCENT, fontWeight: 600 }}>
              {toolActive ? 'Editing report…' : 'Processing…'}
            </span>
          </div>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Try: 'make this more concise' or 'add the cost-reduction figure'"
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1.5px solid #D1D5DB',
              fontSize: 13,
              color: DARK,
              background: '#fff',
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color .15s',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#D1D5DB')}
          />
        )}

        <button
          onClick={handleSend}
          disabled={!input.trim() || isBusy}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '10px 20px',
            fontSize: 13,
            fontWeight: 700,
            color: '#fff',
            background: !input.trim() || isBusy ? '#C5C8DB' : ACCENT,
            border: 'none',
            borderRadius: 8,
            cursor: !input.trim() || isBusy ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            transition: 'background .15s',
            flexShrink: 0,
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
