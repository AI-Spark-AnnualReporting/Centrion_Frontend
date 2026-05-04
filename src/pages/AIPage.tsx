import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chat, type ChatMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// One row in the message list. Mirrors the backend's `role` so the array can
// be sent straight back as the next request's `messages` payload.
interface UiMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  // Only populated on assistant messages — `tool_start` events push a name
  // here with done=false, and the matching `tool_end` flips it.
  tools?: Array<{ name: string; done: boolean }>;
  // True while the assistant message is still receiving tokens.
  streaming?: boolean;
  error?: string;
}

// Backend tool names → friendlier display labels. Falls back to a humanised
// version of the snake_case name when we don't have a hand-tuned label.
const TOOL_LABELS: Record<string, string> = {
  list_reports: 'Looking up reports',
  get_report_overview: 'Reading report overview',
  get_report_coverage: 'Reading coverage data',
  get_indicator_evidence: 'Pulling indicator evidence',
  get_company_kpis: 'Pulling KPI history',
};
function toolLabel(name: string): string {
  return (
    TOOL_LABELS[name] ??
    name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
  );
}

export default function AIPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 0,
      role: 'assistant',
      content:
        `Hi ${user?.full_name?.split(' ')[0] ?? 'there'} 👋 I'm **IR Copilot** — ask me anything about your ESG reports, coverage, or indicators.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Auto-scroll the chat to the bottom when new content arrives.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Allow the user to cancel an in-flight stream. Stored in a ref so a
  // re-render mid-stream doesn't drop the controller.
  const abortRef = useRef<AbortController | null>(null);

  // Used by the per-message Edit button to refocus the composer after it
  // pops the message text back into the input.
  const inputRef = useRef<HTMLInputElement>(null);

  // Monotonic id source so each new message gets a stable React key even if
  // the user sends faster than `Date.now()` resolution.
  const idRef = useRef(1);
  const nextId = () => idRef.current++;

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
  };

  // Edit a previous user turn: stop any in-flight stream, drop that message
  // and everything after it, and load the original text back into the
  // composer so the user can tweak and resend. Wiring this up means a user
  // who pressed Enter too early can hit Stop, click the pencil on their
  // message, add the missing detail, and continue without retyping.
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
    // Defer focus until React has flushed the DOM update so caret lands at
    // the end of the restored text.
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

    // Snapshot the conversation that will be sent to the backend (everything
    // visible plus this turn). Drop any in-flight `streaming` flags / tool
    // metadata — backend only wants role + content.
    const userMsg: UiMessage = { id: nextId(), role: 'user', content: text };
    const assistantMsg: UiMessage = {
      id: nextId(),
      role: 'assistant',
      content: '',
      tools: [],
      streaming: true,
    };
    const wireMessages: ChatMessage[] = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    // Helper: mutate just this assistant turn in place. Closing over the
    // assistantMsg id avoids index-juggling if more messages get appended
    // (e.g. errors) before this stream closes.
    const updateAssistant = (
      patch: (m: UiMessage) => UiMessage,
    ) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? patch(m) : m)),
      );
    };

    try {
      for await (const ev of chat.stream(
        { messages: wireMessages },
        controller.signal,
      )) {
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
        } else if (ev.type === 'done') {
          break;
        }
      }
      updateAssistant((m) => ({ ...m, streaming: false }));
    } catch (err) {
      const aborted =
        err instanceof DOMException && err.name === 'AbortError';
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

  const handleSendClick = () => {
    if (isStreaming) stopStreaming();
    else void sendMessage();
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>IR Copilot</h2>
        <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>AI-powered ESG &amp; IR assistant</p>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="chat-area" style={{ height: 500 }}>
          <div className="chat-msgs" ref={scrollRef}>
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
                              <path d="M2 4.5l1.8 1.8 3.2-3.2" stroke="#16A34A" strokeWidth="1.4" strokeLinecap="round" />
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
                          style={{ display: 'inline-flex', gap: 4, padding: '2px 0' }}
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
                      ) : null}
                      {m.error && (
                        <div
                          style={{
                            fontSize: 11,
                            color: '#B33A3E',
                            marginTop: 6,
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
                    {user?.full_name
                      ?.split(' ')
                      .map((p) => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase() || 'U'}
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
              disabled={isStreaming}
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
              aria-label={isStreaming ? 'Stop generating' : 'Send'}
              title={isStreaming ? 'Stop generating' : 'Send'}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 'none',
                background: isStreaming ? '#E5484D' : '#4040C8',
                cursor: 'pointer',
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
