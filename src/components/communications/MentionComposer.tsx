import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CommunicationMember } from '@/lib/api';
import { initials, roleLabel } from './helpers';

/* ── Shared @mention composer ──────────────────────────────────────────────
   Controlled: the parent owns `message` + `mentions`. Typing "@" opens a
   client-side-filtered picker; selecting a member adds a removable chip and
   strips the "@query" from the text (the mention lives in the chip). The
   parent sends `mentions.map(m => m.id)` — the UUID, not `user_id`.
─────────────────────────────────────────────────────────────────────────── */
/* The @mention chips on their own, so a caller can show "who's in this thread"
   as its own field instead of stacked on top of the textarea. */
export function MentionChips({
  mentions,
  onMentionsChange,
}: {
  mentions: CommunicationMember[];
  onMentionsChange: (next: CommunicationMember[]) => void;
}) {
  const remove = (id: string) => onMentionsChange(mentions.filter((m) => m.id !== id));
  if (mentions.length === 0) return null;
  return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {mentions.map((m) => (
          <span
            key={m.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 6px 4px 10px',
              borderRadius: 20,
              background: '#F1ECFF',
              color: '#6D28D9',
              fontSize: 11.5,
              fontWeight: 700,
            }}
          >
            @{m.full_name}
            <button
              type="button"
              onClick={() => remove(m.id)}
              aria-label={`Remove ${m.full_name}`}
              style={{
                display: 'inline-flex',
                border: 'none',
                background: 'transparent',
                color: '#8B5CF6',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        ))}
      </div>
  );
}

export function MentionComposer({
  members,
  currentUserId,
  message,
  onMessageChange,
  mentions,
  onMentionsChange,
  placeholder,
  minHeight = 92,
}: {
  members: CommunicationMember[];
  currentUserId?: string | null;
  message: string;
  onMessageChange: (value: string) => void;
  mentions: CommunicationMember[];
  onMentionsChange: (next: CommunicationMember[]) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  // Non-null while an "@token" is being typed → the picker is open.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Screen-space anchor for the portal dropdown (position: fixed).
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);

  const matches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.user_id !== currentUserId) // hide self
      .filter((m) => !mentions.some((x) => x.id === m.id))
      .filter((m) => m.full_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionQuery, members, currentUserId, mentions]);

  const open = mentionQuery != null && matches.length > 0;

  // Anchor the dropdown just below the textarea, matched to its width. Rendered
  // in a portal so it opens downward and is never clipped by the modal's
  // overflow. Reposition on scroll/resize while open.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = taRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, message, mentions.length]);

  const handleChange = (value: string) => {
    onMessageChange(value);
    const m = value.match(/@([\p{L}\p{N}]*)$/u);
    setMentionQuery(m ? m[1] : null);
  };

  const add = (member: CommunicationMember) => {
    if (!mentions.some((x) => x.id === member.id)) onMentionsChange([...mentions, member]);
    onMessageChange(message.replace(/@([\p{L}\p{N}]*)$/u, ''));
    setMentionQuery(null);
    // Keep focus in the box so the user can keep typing.
    taRef.current?.focus();
  };

  const remove = (id: string) => onMentionsChange(mentions.filter((m) => m.id !== id));

  return (
    <>
      <MentionChips mentions={mentions} onMentionsChange={onMentionsChange} />

      <textarea
        ref={taRef}
        className="inp"
        value={message}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{ minHeight, resize: 'vertical', lineHeight: 1.5 }}
      />

      {open &&
        anchor &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: anchor.left,
              top: anchor.top,
              width: anchor.width,
              background: '#fff',
              border: '1px solid #E2E4F0',
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(26,29,46,.14)',
              zIndex: 10002, // above the modal overlay (10001)
              overflow: 'hidden',
              maxHeight: 232,
              overflowY: 'auto',
            }}
            // Keep clicks off the textarea so it doesn't blur before onClick.
            onMouseDown={(e) => e.preventDefault()}
          >
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => add(m)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 13px',
                  border: 'none',
                  borderBottom: '1px solid #F4F5FB',
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: '#EEEEFF',
                    color: '#4040C8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {initials(m.full_name)}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1A1D2E' }}>
                  {m.full_name}
                </span>
                {/* Fixed-width column so every role badge starts at the same x. */}
                <span style={{ flexShrink: 0, width: 128, display: 'flex', justifyContent: 'flex-start' }}>
                  <span className="badge b-gy">{roleLabel(m.role)}</span>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── Participants picker ───────────────────────────────────────────────────
   A native <select> renders its popup outside the modal and can't be clamped
   to it, so this is a button + the same portal list the @mention picker uses:
   width sized for the content, height capped at the modal's bottom edge, and
   scrolling inside once the member list outgrows it.
─────────────────────────────────────────────────────────────────────────── */
/* Bottom edge the dropdown must not cross: the nearest scroll/clip ancestor —
   in practice the modal — falling back to the viewport when there isn't one. */
function clipBottom(el: HTMLElement): number {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') {
      return node.getBoundingClientRect().bottom
    }
  }
  return window.innerHeight
}

export function MemberPicker({
  options,
  onPick,
  label,
  compact = false,
}: {
  options: CommunicationMember[];
  onPick: (member: CommunicationMember) => void;
  label: string;
  // Small pill trigger for sitting inside a row, instead of a full-width field.
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The list lives in a portal, so it isn't inside btnRef — without its own ref
  // the outside-click handler unmounts a row on mousedown and its click never
  // lands, which reads as "picking someone does nothing".
  const listRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const disabled = options.length === 0;

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const top = r.bottom + 4;
      // A compact trigger is a pill a few characters wide — matching it would
      // squash every name. Size the list for its content and right-align it to
      // the pill instead, clamped to stay on screen.
      const width = compact ? Math.min(300, Math.max(240, window.innerWidth - 32)) : r.width;
      const left = compact ? Math.max(16, Math.min(r.right - width, window.innerWidth - width - 16)) : r.left;
      const bottom = Math.min(window.innerHeight, clipBottom(el));
      setAnchor({ left, top, width, maxHeight: Math.max(120, bottom - top - 12) });
    };
    measure();
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, compact]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={compact ? undefined : 'inp'}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        style={
          compact
            ? {
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                padding: '5px 11px',
                borderRadius: 20,
                border: '1px solid #D8DBEC',
                background: '#fff',
                color: disabled ? '#9BA3C4' : '#4040C8',
                fontSize: 11.5,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }
            : {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                textAlign: 'left',
                fontFamily: 'inherit',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: disabled ? '#9BA3C4' : '#1A1D2E',
              }
        }
      >
        {label}
        {!compact && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: '#9BA3C4' }}>
            <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={listRef}
            style={{
              position: 'fixed',
              left: anchor.left,
              top: anchor.top,
              width: anchor.width,
              background: '#fff',
              border: '1px solid #E2E4F0',
              borderRadius: 12,
              boxShadow: '0 12px 32px rgba(26,29,46,.14)',
              zIndex: 10002, // above the modal overlay (10001)
              maxHeight: anchor.maxHeight,
              overflowX: 'hidden',
              overflowY: 'auto',
            }}
          >
            {options.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 13px',
                  border: 'none',
                  borderBottom: '1px solid #F4F5FB',
                  background: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: '#EEEEFF',
                    color: '#4040C8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {initials(m.full_name)}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#1A1D2E',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.full_name}
                </span>
                <span style={{ flexShrink: 0, fontSize: 11.5, color: '#8890AE', whiteSpace: 'nowrap' }}>
                  {roleLabel(m.role)}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
