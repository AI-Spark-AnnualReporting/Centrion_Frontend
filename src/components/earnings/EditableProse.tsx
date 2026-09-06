import { useEffect, useRef, useState } from 'react';
import { readNarrativeEnvelope, writeNarrativeEnvelope } from '@/lib/sectionEnvelope';
import type { EarningsProducedSection } from '@/types/earnings';
import { SectionRenderer } from './SectionRenderer';
import { SectionInputForm } from './SectionInputForm';
import { INK, MUTED, ACCENT, DANGER } from './tokens';

// Inline prose editor for a produced section. Display → SectionRenderer; edit →
// a textarea (save on ⌘/Ctrl-Enter or blur, cancel on Esc). Persistence (optimistic
// PATCH + rollback) is owned by the parent via `onSave`, which resolves on success.
// After a save, an unacknowledged grounding-violation flag is surfaced with an
// Acknowledge control (the backend flags, it doesn't block — but an unacknowledged
// flag blocks approve). Cover/table sections are display-only here.
//
// A section with nothing backing it yet (feeder_status 'needs_input' — never
// 'external', which is permanently unfixable) renders SectionInputForm instead
// of the normal view/edit split — there's no existing content to view or edit,
// only information to provide.
export function EditableProse({
  section,
  coverTemplateKey,
  locked,
  onSave,
  onSaveInput,
  onExtractInput,
  onAcknowledgeFlag,
  showAnalysis = false,
  deliverable = false,
}: {
  section: EarningsProducedSection;
  coverTemplateKey?: string | null;
  locked: boolean;
  /** Forwarded to SectionRenderer — see there. */
  showAnalysis?: boolean;
  deliverable?: boolean;
  onSave: (content: string) => Promise<void>;
  onSaveInput?: (text: string) => Promise<void>;
  onExtractInput?: (file: File) => Promise<string>;
  onAcknowledgeFlag?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // The sub-heading of a {heading, content} section, edited alongside its prose.
  // null for a plain-prose section, which has no heading to show.
  const [heading, setHeading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLInputElement>(null);

  // Only prose sections are inline-editable (table/kpi/cover are structured).
  // The table of contents is excluded too: it is mode 'auto', so it used to pass
  // every test here and open showing its raw {title, entries} JSON — and it is
  // rebuilt from the outline anyway, so a hand edit is only ever lost or damaging.
  const editable = !locked && section.mode !== 'table' && section.mode !== 'kpi' && !/cover/i.test(section.section_code) && section.mode !== 'cover' && section.section_code !== 's02_toc';

  // A narrative section stores {heading, content} as a JSON string. Edit the
  // prose, not the envelope — the textarea used to be seeded with the raw JSON,
  // and saving it back was one stray quote away from printing that JSON into the
  // delivered PDF. A section that is NOT an envelope (plain prose, or JSON a user
  // already broke) still opens on its raw string, so it stays fixable.
  const envelope = readNarrativeEnvelope(section.content);
  const editableText = envelope ? envelope.body : (section.content ?? '');

  const open = () => {
    cancelledRef.current = false;
    setError(null);
    setDraft(editableText);
    setHeading(envelope ? envelope.heading : null);
    setEditing(true);
  };

  useEffect(() => {
    if (editing && taRef.current) {
      const el = taRef.current;
      el.focus();
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [editing]);

  const commit = async () => {
    if (cancelledRef.current || saving) return;
    // Compared against the UNWRAPPED body (and the heading), not section.content —
    // against the raw JSON every save would look like a change and none would
    // look like a no-op.
    if (draft === editableText && (heading ?? null) === (envelope ? envelope.heading : null)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(writeNarrativeEnvelope(section.content, heading, draft));
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

  const showFlag = !!section.grounding_flag && !section.grounding_acknowledged;

  // Nothing backs this section yet (and it's genuinely fixable — 'external'
  // is excluded, that's a permanent limitation, not something a form can fix).
  // GET /sections doesn't carry the outline's `feeder` object yet (confirmed
  // live — only the flat `status` field does), so `status === 'needs_input'`
  // is today's real signal; `feeder_status` is read too so this upgrades for
  // free once the backend adds feeder here (see the backend spec).
  const externallyUnfixable = section.feeder_status === 'external';
  // Without a feeder object yet, `content` doubles as the needs_input
  // explanation (e.g. "No figures were found…") when there's no dedicated
  // `feeder_message`. But `status`/`feeder_status` can go stale — the backend
  // sometimes fills in real generated prose without flipping the flag off
  // needs_input. A genuine explanation is a short generic sentence; real
  // section prose runs to a full paragraph. Past that length it's implausible
  // as a "needs more input" message, so treat it as produced content instead
  // of clobbering it with the input form.
  const contentLooksLikeRealProse =
    !section.feeder_message && !!section.content && section.content.trim().length > 400;
  const needsUserInput =
    !externallyUnfixable &&
    !contentLooksLikeRealProse &&
    (section.feeder_status === 'needs_input' || section.status === 'needs_input') &&
    !locked &&
    !!onSaveInput &&
    !!onExtractInput;
  if (needsUserInput) {
    const message =
      section.feeder_message ??
      (section.content && section.content.trim() ? section.content : null) ??
      'This section needs more information.';
    return <SectionInputForm message={message} onSave={onSaveInput} onExtract={onExtractInput} />;
  }

  return (
    <div>
      {/* Section actions */}
      {!locked && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          {editable && !editing && (
            <button className="btn bs bsm" onClick={open}>
              Edit
            </button>
          )}
        </div>
      )}

      {editing ? (
        <div>
          {/* Only when the section actually carries one. A plain-prose section has
              no heading, and offering an empty box would invent a shape the
              producer never wrote. */}
          {envelope && (
            <input
              ref={headingRef}
              value={heading ?? ''}
              disabled={saving}
              placeholder="Section heading"
              onChange={(e) => setHeading(e.target.value)}
              onBlur={(e) => {
                if (e.relatedTarget && e.relatedTarget === taRef.current) return;
                void commit();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
                else if (e.key === 'Enter') { e.preventDefault(); taRef.current?.focus(); }
              }}
              style={{
                width: '100%',
                padding: '8px 14px',
                marginBottom: 8,
                borderRadius: 8,
                border: `1px solid ${ACCENT}`,
                fontSize: 13,
                fontWeight: 700,
                color: INK,
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          )}
          <textarea
            ref={taRef}
            value={draft}
            disabled={saving}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onBlur={(e) => {
              // Blur still saves — but moving to the heading field above is not
              // leaving the editor, and committing there would close it before
              // the heading could be typed.
              if (e.relatedTarget && e.relatedTarget === headingRef.current) return;
              void commit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            style={{
              width: '100%',
              minHeight: 120,
              padding: '12px 14px',
              borderRadius: 8,
              border: `1px solid ${error ? '#FECACA' : ACCENT}`,
              fontSize: 14,
              lineHeight: 1.7,
              color: INK,
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <button className="btn bp bsm" onClick={() => void commit()} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn bs bsm" onClick={cancel} disabled={saving}>
              Cancel
            </button>
            <span style={{ fontSize: 11, color: MUTED }}>⌘·Ctrl-Enter to save · Esc to cancel</span>
            {error && <span style={{ fontSize: 11.5, color: DANGER }}>{error}</span>}
          </div>
        </div>
      ) : (
        <SectionRenderer section={section} coverTemplateKey={coverTemplateKey} showAnalysis={showAnalysis} deliverable={deliverable} />
      )}

      {/* Grounding-violation flag → acknowledge (blocks approve until acknowledged). */}
      {showFlag && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(249,115,22,.10)',
            border: '1px solid rgba(249,115,22,.30)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12.5, color: '#B45309' }}>
            Grounding check: {section.grounding_flag}
          </span>
          {onAcknowledgeFlag && (
            <button className="btn bs bsm" onClick={onAcknowledgeFlag}>
              Acknowledge
            </button>
          )}
        </div>
      )}
    </div>
  );
}
