import { useEffect, useRef, useState } from 'react';
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Only prose sections are inline-editable (table/kpi/cover are structured).
  const editable = !locked && section.mode !== 'table' && section.mode !== 'kpi' && !/cover/i.test(section.section_code) && section.mode !== 'cover';

  const open = () => {
    cancelledRef.current = false;
    setError(null);
    setDraft(section.content ?? '');
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
    if (draft === (section.content ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
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
          <textarea
            ref={taRef}
            value={draft}
            disabled={saving}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onBlur={commit}
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
