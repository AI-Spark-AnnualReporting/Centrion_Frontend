import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chat, type ChatHistoryMessage, type ChatToolCall } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// One row in the message list. v2 backend owns the persisted history; this
// shape mirrors what GET /chat/session returns plus a few UI-only flags
// (`streaming`, `error`, locally-assigned `id`, in-flight `tools`).
interface UiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  // Live tool activity (mid-stream) AND historical tool_calls hydrated from
  // the session — historical ones come back already `done`.
  tools?: Array<{ name: string; done: boolean }>;
  streaming?: boolean;
  error?: string;
}

const TOOL_LABELS: Record<string, string> = {
  list_reports: 'Looking up reports',
  get_report_overview: 'Reading report overview',
  get_report_coverage: 'Reading coverage data',
  get_indicator_evidence: 'Pulling indicator evidence',
  get_company_kpis: 'Pulling KPI history',
  get_esg_evidence: 'Pulling ESG evidence',
};
function toolLabel(name: string): string {
  return (
    TOOL_LABELS[name] ??
    name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}

// Convert a persisted assistant turn's tool_calls into the same UI shape
// `tool_start` / `tool_end` events build during a live stream — all done.
function hydrateTools(calls: ChatToolCall[] | null | undefined) {
  if (!calls || calls.length === 0) return undefined;
  return calls.map((c) => ({ name: c.name, done: true }));
}

export default function AIPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const initialSent = useRef(false);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  // Auto-scroll the chat to the bottom when new content arrives.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sessionLoading]);

  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Monotonic id source so each new message gets a stable React key.
  const idRef = useRef(1);
  const nextId = () => idRef.current++;

  // Hydrate the chat from the server on first mount and after a successful
  // /session/clear. The empty-deps effect runs once; clearChat() calls
  // hydrateSession() directly afterwards, so we don't need to watch a key.
  const hydrateSession = async () => {
    setSessionLoading(true);
    setSessionError(null);
    try {
      const data = await chat.getSession();
      const hydrated: UiMessage[] = (data.messages ?? []).map(
        (m: ChatHistoryMessage) => ({
          id: nextId(),
          role: m.role,
          content: m.content,
          tools: m.role === 'assistant' ? hydrateTools(m.tool_calls) : undefined,
        }),
      );
      setMessages(hydrated);
    } catch (err) {
      setSessionError(
        err instanceof Error ? err.message : 'Failed to load conversation.',
      );
      setMessages([]);
    } finally {
      setSessionLoading(false);
    }
  };

  useEffect(() => {
    void hydrateSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  // Edit a previous user turn: stop any in-flight stream, drop that message
  // and everything after it from the *local* UI, and load the original text
  // into the composer. The original turn stays in the server-owned history
  // (v2 persists user messages before the stream opens), so on reload both
  // the original and the edited message will be visible. For in-session
  // correction — "I forgot to mention X, let me add it" — this is fine.
  const editUserMessage = (id: number) => {
    const target = messages.find((m) => m.id === id);
    if (!target || target.role !== 'user') return;
    stopStreaming();
    setIsStreaming(false);
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      return idx === -1 ? prev : prev.slice(0, idx);
    });
    setInput(target.content);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(target.content.length, target.content.length);
      }
    });
  };

  const sendMessage = async (textOverride?: string) => {
    if (isStreaming) return;
    const text = (textOverride ?? input).trim();
    if (!text) return;
    setInput('');

    // Optimistic render — server will persist this user message before the
    // first SSE event arrives, so we don't need to re-fetch on completion.
    const userMsg: UiMessage = { id: nextId(), role: 'user', content: text };
    const assistantMsg: UiMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      tools: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const updateAssistant = (patch: (m: UiMessage) => UiMessage) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? patch(m) : m)),
      );
    };

    try {
      for await (const ev of chat.send({ message: text }, controller.signal)) {
        if (ev.type === 'token') {
          const piece = (ev as { content?: string }).content ?? '';
          if (!piece) continue;
          updateAssistant((m) => ({ ...m, content: m.content + piece }));
        } else if (ev.type === 'tool_start') {
          const name = (ev as { name?: string }).name ?? 'tool';
          updateAssistant((m) => ({
            ...m,
            tools: [...(m.tools ?? []), { name, done: false }],
          }));
        } else if (ev.type === 'tool_end') {
          const name = (ev as { name?: string }).name ?? '';
          updateAssistant((m) => ({
            ...m,
            tools: (m.tools ?? []).map((t) =>
              t.name === name && !t.done ? { ...t, done: true } : t,
            ),
          }));
        } else if (ev.type === 'error') {
          const message =
            (ev as { message?: string }).message ?? 'The assistant ran into an error.';
          updateAssistant((m) => ({ ...m, error: message }));
        } else if (ev.type === 'done') {
          break;
        }
      }
      updateAssistant((m) => ({ ...m, streaming: false }));
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      updateAssistant((m) => ({
        ...m,
        streaming: false,
        error: aborted
          ? undefined
          : err instanceof Error
            ? err.message
            : 'Streaming failed.',
      }));
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  // Auto-send a question handed in via route state (e.g. the Home "Ask Copilot"
  // card) once the session has hydrated. Ref-guarded + state cleared so a refresh
  // doesn't resend.
  useEffect(() => {
    if (initialSent.current || sessionLoading || isStreaming) return;
    const q = (location.state as { q?: string } | null)?.q;
    if (!q) return;
    initialSent.current = true;
    void sendMessage(q);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, location.state]);

  const handleSendClick = () => {
    if (isStreaming) stopStreaming();
    else void sendMessage();
  };

  const clearChat = async () => {
    if (isClearing || isStreaming) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Clear this conversation? This cannot be undone.')
    ) {
      return;
    }
    setIsClearing(true);
    try {
      await chat.clearSession();
      await hydrateSession();
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err) {
      setSessionError(
        err instanceof Error ? err.message : 'Failed to clear conversation.',
      );
    } finally {
      setIsClearing(false);
    }
  };

  // Static greeting shown only when the server-owned conversation is empty.
  // Not persisted — purely a UX placeholder so the chat doesn't open blank.
  const showGreeting = !sessionLoading && messages.length === 0 && !sessionError;
  const greetingText = `Hi ${user?.full_name?.split(' ')[0] ?? 'there'} 👋 I'm **AI Copilot** — ask me anything about your ESG reports, coverage, or indicators.`;

  const userInitials =
    user?.full_name
      ?.split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';

  return (
    <div>
      <div
        style={{
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>AI Copilot</h2>
          <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
            AI-powered ESG &amp; IR assistant
          </p>
        </div>
        <button
          type="button"
          onClick={() => void clearChat()}
          disabled={
            isClearing ||
            isStreaming ||
            sessionLoading ||
            messages.length === 0
          }
          title="Clear conversation"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: '#5A6080',
            background: '#fff',
            border: '1px solid #E2E4F0',
            borderRadius: 8,
            cursor:
              isClearing ||
              isStreaming ||
              sessionLoading ||
              messages.length === 0
                ? 'not-allowed'
                : 'pointer',
            opacity:
              isClearing ||
              isStreaming ||
              sessionLoading ||
              messages.length === 0
                ? 0.55
                : 1,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 3h8M4.5 3V2a1 1 0 011-1h1a1 1 0 011 1v1M3 3l.6 7a1 1 0 001 .9h2.8a1 1 0 001-.9L9 3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {isClearing ? 'Clearing…' : 'Clear chat'}
        </button>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="chat-area" style={{ height: 500 }}>
          <div className="chat-msgs" ref={scrollRef}>
            {sessionLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: '#9BA3C4',
                  fontSize: 11,
                }}
              >
                <div className="proc-ring" style={{ width: 22, height: 22, borderWidth: 2, marginRight: 10 }} />
                Loading conversation…
              </div>
            )}
            {sessionError && !sessionLoading && (
              <div
                role="alert"
                style={{
                  margin: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(229,72,77,.08)',
                  border: '1px solid rgba(229,72,77,.25)',
                  color: '#B33A3E',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {sessionError}
              </div>
            )}
            {showGreeting && (
              <div className="msg ai">
                <div
                  className="av"
                  style={{
                    background: 'linear-gradient(135deg,#4040C8,#7C3AED)',
                    width: 24,
                    height: 24,
                    fontSize: 8,
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                >
                  AI
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="msg-bub md-bub">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {greetingText}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`msg ${m.role === 'user' ? 'u' : 'ai'}`}>
                {m.role === 'assistant' && (
                  <div
                    className="av"
                    style={{
                      background: 'linear-gradient(135deg,#4040C8,#7C3AED)',
                      width: 24,
                      height: 24,
                      fontSize: 8,
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    AI
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      {m.tools.map((t, i) => (
                        <span
                          key={`${t.name}-${i}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 10,
                            fontWeight: 600,
                            color: t.done ? '#16A34A' : '#4040C8',
                            background: t.done
                              ? 'rgba(34,197,94,.10)'
                              : 'rgba(64,64,200,.08)',
                            border: `1px solid ${t.done ? 'rgba(34,197,94,.25)' : 'rgba(64,64,200,.20)'}`,
                            padding: '3px 9px',
                            borderRadius: 999,
                          }}
                        >
                          {t.done ? (
                            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                              <path
                                d="M2 4.5l1.8 1.8 3.2-3.2"
                                stroke="#16A34A"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                              />
                            </svg>
                          ) : (
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#4040C8',
                                animation: 'pdot .8s infinite',
                                display: 'inline-block',
                              }}
                            />
                          )}
                          {toolLabel(t.name)}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant' ? (
                    <div className="msg-bub md-bub">
                      {m.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content}
                        </ReactMarkdown>
                      ) : m.streaming ? (
                        <span
                          aria-label="Generating response"
                          style={{
                            display: 'inline-flex',
                            gap: 4,
                            padding: '2px 0',
                          }}
                        >
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                background: '#4040C8',
                                animation: `pdot .9s ${i * 0.15}s infinite`,
                                display: 'inline-block',
                              }}
                            />
                          ))}
                        </span>
                      ) : !m.error ? (
                        <span style={{ color: '#9BA3C4', fontStyle: 'italic' }}>
                          (no response)
                        </span>
                      ) : null}
                      {m.error && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#B33A3E',
                            marginTop: m.content ? 6 : 0,
                            fontWeight: 600,
                          }}
                        >
                          {m.error}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexDirection: 'row-reverse',
                      }}
                    >
                      <div className="msg-bub" style={{ whiteSpace: 'pre-wrap' }}>
                        {m.content}
                      </div>
                      <button
                        type="button"
                        onClick={() => editUserMessage(m.id)}
                        aria-label="Edit message"
                        title="Edit and resend"
                        style={{
                          width: 22,
                          height: 22,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: '#9BA3C4',
                          flexShrink: 0,
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M9.5 2.2l2.3 2.3-7 7H2.5V9.2l7-7z"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                {m.role === 'user' && (
                  <div
                    className="av"
                    style={{ background: '#3535B5', width: 24, height: 24, fontSize: 8 }}
                  >
                    {userInitials}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: 12,
              borderTop: '1px solid #E2E4F0',
              background: '#fff',
            }}
          >
            <input
              ref={inputRef}
              className="inp"
              style={{ flex: 1, borderRadius: 22, padding: '9px 13px' }}
              placeholder="Ask about ESG, reports, compliance..."
              value={input}
              disabled={isStreaming || sessionLoading}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <button
              type="button"
              onClick={handleSendClick}
              disabled={sessionLoading}
              aria-label={isStreaming ? 'Stop generating' : 'Send'}
              title={isStreaming ? 'Stop generating' : 'Send'}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 'none',
                background: isStreaming ? '#E5484D' : '#4040C8',
                cursor: sessionLoading ? 'not-allowed' : 'pointer',
                opacity: sessionLoading ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: isStreaming
                  ? '0 3px 10px rgba(229,72,77,.3)'
                  : '0 3px 10px rgba(64,64,200,.3)',
              }}
            >
              {isStreaming ? (
                <svg viewBox="0 0 12 12" fill="none" width="12" height="12">
                  <rect x="2.5" y="2.5" width="7" height="7" rx="1" fill="white" />
                </svg>
              ) : (
                <svg viewBox="0 0 13 13" fill="none" width="14" height="14">
                  <path
                    d="M11 6.5H2M8.5 4l2.5 2.5-2.5 2.5"
                    stroke="white"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
