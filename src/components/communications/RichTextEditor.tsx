import { useEffect, useRef } from 'react';

// contentEditable and the preview swallow anchor navigation, so intercept a
// click on a link and open it in a new tab. Used by both the editor + preview
// in ExternalEmailModal and SendExternalModal.
export function openAnchorFromEvent(e: React.MouseEvent) {
  const anchor = (e.target as HTMLElement).closest('a');
  const href = anchor?.getAttribute('href');
  if (href) {
    e.preventDefault();
    window.open(href, '_blank', 'noopener,noreferrer');
  }
}

// A tiny WYSIWYG editor: toolbar (B/I/U/link/list) + a contentEditable box.
// Seeds its HTML once from `initialHtml` (uncontrolled inner HTML so the caret
// never jumps), and reports every edit via onChange so a live preview stays
// in sync. Pass a new `key` to force a remount and re-seed (e.g. once an
// async prefill — a draft, a thread's latest message — finishes loading).
export function RichTextEditor({ initialHtml, onChange }: { initialHtml: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    // Seed once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => onChange(ref.current?.innerHTML ?? '');
  const exec = (command: string, value?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, value);
    emit();
  };

  const TB_BTN: React.CSSProperties = {
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    color: '#5A6080',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    fontFamily: 'inherit',
  };
  // Keep the selection when a toolbar button is pressed.
  const hold = (e: React.MouseEvent) => e.preventDefault();

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 0', borderTop: '1px solid #F0F1F8', borderBottom: '1px solid #F0F1F8' }}>
        <button type="button" onMouseDown={hold} onClick={() => exec('bold')} style={{ ...TB_BTN, fontWeight: 800, fontSize: 14 }}>B</button>
        <button type="button" onMouseDown={hold} onClick={() => exec('italic')} style={{ ...TB_BTN, fontStyle: 'italic', fontSize: 14, fontFamily: 'Georgia, serif' }}>I</button>
        <button type="button" onMouseDown={hold} onClick={() => exec('underline')} style={{ ...TB_BTN, textDecoration: 'underline', fontSize: 14 }}>U</button>
        <button
          type="button"
          onMouseDown={hold}
          onClick={() => {
            const url = window.prompt('Link URL');
            if (url) {
              const trimmed = url.trim();
              // Bare hosts ("example.com") need a scheme or the browser treats
              // them as relative and the link won't open.
              const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
              exec('createLink', href);
            }
          }}
          style={TB_BTN}
          aria-label="Insert link"
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onMouseDown={hold} onClick={() => exec('insertUnorderedList')} style={TB_BTN} aria-label="Bulleted list">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M6 4.5h7M6 8h7M6 11.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="3" cy="4.5" r="1" fill="currentColor" />
            <circle cx="3" cy="8" r="1" fill="currentColor" />
            <circle cx="3" cy="11.5" r="1" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Editable body */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onClick={openAnchorFromEvent}
        className="ext-body"
        style={{
          fontSize: 13.5,
          color: '#3A4066',
          lineHeight: 1.7,
          padding: '16px 2px 4px',
          minHeight: 120,
          outline: 'none',
        }}
      />
    </>
  );
}
