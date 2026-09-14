import { useState } from 'react';
import type { BrandVoice } from '@/types/company';

// The writing rules pulled out of the uploaded brand guideline — the ONLY part of
// the brand document the report writers actually read. Shown here so the user can
// check what we understood before a report is written in it, and correct it when
// we got it wrong. Saving goes through the page's normal PATCH /companies/me.
//
// Extraction runs in the background after a guideline is saved, so this card has
// three real states beyond "editing": processing, failed, and never-run.

const TEXT_FIELDS: { key: 'register' | 'person' | 'sentence_style'; label: string; hint: string }[] = [
  { key: 'register',       label: 'Register',       hint: 'e.g. confident and plainspoken, never stiff' },
  { key: 'person',         label: 'Person',         hint: 'e.g. first-person “we”, reader as “you”' },
  { key: 'sentence_style', label: 'Sentence style', hint: 'e.g. short, active, no long clauses' },
];

const WORD_FIELDS: { key: 'tone_adjectives' | 'preferred_words' | 'banned_words'; label: string; hint: string }[] = [
  { key: 'tone_adjectives', label: 'Tone',           hint: 'Adjectives that describe your voice' },
  { key: 'preferred_words', label: 'Words to use',   hint: 'Wording the guideline prescribes' },
  { key: 'banned_words',    label: 'Words to avoid', hint: 'Wording the guideline forbids' },
];

const RULE_FIELDS: { key: 'do' | 'dont'; label: string; hint: string }[] = [
  { key: 'do',   label: 'Do',    hint: 'One rule per line' },
  { key: 'dont', label: 'Don’t', hint: 'One rule per line' },
];

const label = { fontSize: 10, fontWeight: 700, color: '#5A6080', letterSpacing: 0.3 } as const;
const hintStyle = { fontSize: 10, color: '#9BA3C4', marginTop: 2 } as const;

// One rule per line. The raw text is held locally while the field has focus:
// splitting and filtering on every keystroke would delete the newline the moment
// it is typed, so the user could never start a second line.
function LinesEditor({
  items, onChange,
}: { items: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) =>
    onChange(raw.split('\n').map((l) => l.trim()).filter(Boolean));

  return (
    <textarea
      className="inp"
      rows={4}
      value={draft ?? items.join('\n')}
      onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
      onBlur={() => setDraft(null)}
      style={{ resize: 'vertical', lineHeight: 1.6, marginTop: 4 }}
    />
  );
}

function Chips({
  items, disabled, onChange,
}: { items: string[]; disabled: boolean; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    // Case-insensitive, matching the backend normalizer — otherwise a user could
    // add "Synergy" next to an existing "synergy" and only one would survive the
    // round-trip, which reads as the edit being ignored.
    if (!v || items.some((i) => i.toLowerCase() === v.toLowerCase())) { setDraft(''); return; }
    onChange([...items, v]);
    setDraft('');
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
            background: '#F1F2F8', color: '#1A1D2E', borderRadius: 999, padding: '3px 6px 3px 10px',
          }}
        >
          {item}
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i !== item))}
              aria-label={`Remove ${item}`}
              style={{
                border: 0, background: 'transparent', cursor: 'pointer', color: '#5A6080',
                fontSize: 12, lineHeight: 1, padding: '0 2px',
              }}
            >
              ✕
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          className="inp"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
          }}
          onBlur={add}
          placeholder="Add…"
          style={{ width: 110, height: 26, fontSize: 11, padding: '0 8px' }}
        />
      )}
    </div>
  );
}

export default function BrandVoiceCard({
  voice, status, hasGuideline, canEdit, onChange,
}: {
  voice: BrandVoice | null;
  status: string | null;
  hasGuideline: boolean;
  canEdit: boolean;
  onChange: (next: BrandVoice) => void;
}) {
  // Nothing uploaded — the card would only ever say "upload something", which the
  // card directly above already does.
  if (!hasGuideline) return null;

  const set = <K extends keyof BrandVoice>(key: K, value: BrandVoice[K]) =>
    onChange({ ...(voice ?? {}), [key]: value });

  const list = (key: 'tone_adjectives' | 'preferred_words' | 'banned_words' | 'do' | 'dont') =>
    voice?.[key] ?? [];

  const isEmpty =
    !voice ||
    (!voice.register && !voice.person && !voice.sentence_style &&
      !list('tone_adjectives').length && !list('preferred_words').length &&
      !list('banned_words').length && !list('do').length && !list('dont').length);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="ch">
        <div>
          <div className="ct">Voice rules we extracted</div>
          <div style={hintStyle}>
            These are what your reports are written in — the rest of the guideline is not used
          </div>
        </div>
      </div>
      <div className="cb">
        {status === 'processing' ? (
          <div style={{ fontSize: 11, color: '#5A6080', padding: '8px 0' }}>
            Reading your guideline… this usually takes a few seconds.
          </div>
        ) : isEmpty ? (
          <div style={{ fontSize: 11, color: '#5A6080', padding: '8px 0' }}>
            We couldn’t pull any writing rules out of that document. Reports will use the default
            house voice. Try a document that describes tone of voice rather than logo and colour
            usage — or write the rules in below.
          </div>
        ) : null}

        <fieldset disabled={!canEdit} style={{ border: 0, margin: 0, padding: 0 }}>
          {status !== 'processing' && (
            <>
              <div
                style={{
                  display: 'grid', gap: 12, marginTop: isEmpty ? 12 : 0,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                {TEXT_FIELDS.map((f) => (
                  <div key={f.key}>
                    <div style={label}>{f.label.toUpperCase()}</div>
                    <input
                      className="inp"
                      value={voice?.[f.key] ?? ''}
                      placeholder={f.hint}
                      onChange={(e) => set(f.key, e.target.value || null)}
                      style={{ marginTop: 4 }}
                    />
                  </div>
                ))}
              </div>

              {WORD_FIELDS.map((f) => (
                <div key={f.key} style={{ marginTop: 14 }}>
                  <div style={label}>{f.label.toUpperCase()}</div>
                  <div style={hintStyle}>{f.hint}</div>
                  <Chips
                    items={list(f.key)}
                    disabled={!canEdit}
                    onChange={(next) => set(f.key, next)}
                  />
                </div>
              ))}

              <div
                style={{
                  display: 'grid', gap: 12, marginTop: 14,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                }}
              >
                {RULE_FIELDS.map((f) => (
                  <div key={f.key}>
                    <div style={label}>{f.label.toUpperCase()}</div>
                    <div style={hintStyle}>{f.hint}</div>
                    <LinesEditor items={list(f.key)} onChange={(next) => set(f.key, next)} />
                  </div>
                ))}
              </div>
            </>
          )}
        </fieldset>
      </div>
    </div>
  );
}
