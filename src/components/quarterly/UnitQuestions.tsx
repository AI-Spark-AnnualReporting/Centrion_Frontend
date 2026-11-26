import { useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type {
  CustomExtractionSection,
  UnitAnswer,
  UnitKind,
} from '@/types/quarterly';
import { FINANCIAL_SCALES, REPORTING_CURRENCIES } from '@/constants/currency';

/**
 * "Units to confirm" — the user lane's one question (plan:
 * Centriton/.claude/plans/quarterly-unit-confirmation.md).
 *
 * The backend marks a figure whose unit it had to GUESS (read from the line's name,
 * a small decimal among large amounts, the file's scale disagreeing with the
 * upload's). Each is asked here, pre-filled with the guess; nothing is saved until
 * the user presses Confirm units, and the outline cannot be locked before that.
 *
 * Network-free on purpose, like the screen it sits on: the page passes onConfirm.
 */

const DARK = '#1F2340';
const MUTED = '#6B7280';
const AMBER = '#B45309';
const RED = '#B42318';
const LINE = '#ECEEF8';
const MAX_UNIT_TEXT = 30;

const KIND_OPTIONS: { value: UnitKind; label: string }[] = [
  { value: 'money', label: 'An amount of money' },
  { value: 'per_share', label: 'Money per share' },
  { value: 'percent', label: 'A percentage' },
  { value: 'ratio', label: 'A ratio' },
  { value: 'count', label: 'A count (shares, people…)' },
  { value: 'other', label: 'Something else (type it)' },
];

// The backend stores "million"; the scale picker's values are "millions".
const PLURAL_SCALE: Record<string, string> = {
  actual: 'actual', thousand: 'thousands', million: 'millions', billion: 'billions',
};

export interface QuestionItem {
  key: string;
  ids: string[];
  label: string;
  where: string;
  valueDisplay: string | null;
  reason: string;
  guess: Omit<UnitAnswer, 'ids'>;
}

/** One question per row, except a scale disagreement, which is asked once per table. */
export function buildQuestionItems(sections: CustomExtractionSection[]): QuestionItem[] {
  const items: QuestionItem[] = [];
  const byTable: Record<string, QuestionItem> = {};
  for (const sec of sections) {
    for (const row of sec.rows) {
      const q = row.question;
      if (!q) continue;
      const tableName = row.table || row.sheet || sec.title;
      if (q.reason_code === 'scale_conflict') {
        const key = `table:${sec.section_code}:${tableName}`;
        if (!byTable[key]) {
          byTable[key] = {
            key, ids: [], label: `Every amount in “${tableName}”`, where: sec.title,
            valueDisplay: null, reason: q.reason, guess: q.guess,
          };
          items.push(byTable[key]);
        }
        byTable[key].ids.push(row.id);
        continue;
      }
      items.push({
        key: `row:${row.id}`, ids: [row.id], label: row.label || '(no name)', where: sec.title,
        valueDisplay: row.value_display, reason: q.reason, guess: q.guess,
      });
    }
  }
  return items;
}

/**
 * Splits answers into requests of at most `maxIds` figures each. The endpoint takes
 * up to 2,000 ids per call, and one "every amount in this table" answer on a big
 * file can carry more. Saving is safe to repeat, so a batch that fails can simply
 * be sent again.
 */
export function batchUnitAnswers(answers: UnitAnswer[], maxIds = 1000): UnitAnswer[][] {
  const batches: UnitAnswer[][] = [];
  let current: UnitAnswer[] = [];
  let size = 0;
  for (const answer of answers) {
    for (let start = 0; start < answer.ids.length; start += maxIds) {
      const ids = answer.ids.slice(start, start + maxIds);
      if (size + ids.length > maxIds && current.length > 0) {
        batches.push(current);
        current = [];
        size = 0;
      }
      current.push({ ...answer, ids });
      size += ids.length;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

type Choice = { kind: UnitKind; currency: string; scale: string; text: string };

function choiceFromGuess(guess: Omit<UnitAnswer, 'ids'>, fallbackCurrency: string): Choice {
  return {
    kind: guess.kind,
    currency: guess.currency || fallbackCurrency,
    scale: PLURAL_SCALE[guess.scale || ''] || guess.scale || 'millions',
    text: guess.text || '',
  };
}

/** What is wrong with a choice, in plain words, or null when it can be saved. */
export function choiceProblem(choice: Choice): string | null {
  if (choice.kind === 'other') {
    const text = choice.text.trim();
    if (!text) return 'Type the unit, e.g. “tonnes per day”.';
    if (text.length > MAX_UNIT_TEXT) return `Keep the unit to ${MAX_UNIT_TEXT} characters or fewer.`;
  }
  if ((choice.kind === 'money' || choice.kind === 'per_share') && !choice.currency) {
    return 'Pick a currency.';
  }
  return null;
}

function toAnswer(ids: string[], choice: Choice): UnitAnswer {
  const answer: UnitAnswer = { ids, kind: choice.kind };
  if (choice.kind === 'money' || choice.kind === 'per_share') answer.currency = choice.currency;
  if (choice.kind === 'money' || choice.kind === 'count') answer.scale = choice.scale;
  if (choice.kind === 'other') answer.text = choice.text.trim();
  return answer;
}

interface Props {
  sections: CustomExtractionSection[];
  defaultCurrency: string;
  editable: boolean;
  onConfirm: (answers: UnitAnswer[]) => Promise<void>;
}

export default function UnitQuestions({ sections, defaultCurrency, editable, onConfirm }: Props) {
  const items = useMemo(() => buildQuestionItems(sections), [sections]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  // A second click while the first request is in flight must not send twice.
  const inFlight = useRef(false);

  if (items.length === 0) return null;

  const choiceFor = (item: QuestionItem): Choice =>
    choices[item.key] ?? choiceFromGuess(item.guess, defaultCurrency);
  const update = (item: QuestionItem, patch: Partial<Choice>) =>
    setChoices((prev) => ({ ...prev, [item.key]: { ...choiceFor(item), ...patch } }));

  const problems = items.map((item) => choiceProblem(choiceFor(item)));
  const problemCount = problems.filter(Boolean).length;

  const confirm = async () => {
    if (inFlight.current) return;
    if (problemCount > 0) {
      setShowProblems(true);
      setError(`Fix ${problemCount} unit${problemCount === 1 ? '' : 's'} first.`);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(items.map((item) => toAnswer(item.ids, choiceFor(item))));
    } catch (err) {
      // The choices stay as they are, so nothing the user picked is lost.
      setError(err instanceof Error && err.message ? err.message : 'Could not save the units. Try again.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <div
      className="card"
      role="region"
      aria-label="Units to confirm"
      style={{ padding: 18, borderColor: '#F3D9A4', background: '#FFFBF2', marginBottom: 18 }}
    >
      <div style={{ display: 'flex', gap: 9, color: AMBER, fontSize: 13, fontWeight: 600 }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        {items.length} unit{items.length === 1 ? '' : 's'} to confirm
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
        We weren&apos;t sure of the unit of these figures, so each one is filled in with our best
        guess. Check them and press Confirm units — the report can&apos;t be built until you do.
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
        {items.map((item, index) => {
          const choice = choiceFor(item);
          const problem = showProblems ? problems[index] : null;
          const idBase = `unit-${index}`;
          return (
            <div
              key={item.key}
              style={{ padding: '12px 0', borderTop: index ? `1px solid ${LINE}` : 'none' }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: DARK }}>{item.label}</span>
                {item.valueDisplay && (
                  <span style={{ fontSize: 12, color: MUTED }}>now shows {item.valueDisplay}</span>
                )}
                <span style={{ fontSize: 11, color: MUTED, marginLeft: 'auto' }}>{item.where}</span>
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{item.reason}</div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label className="fl-label" style={{ fontSize: 10 }} htmlFor={`${idBase}-kind`}>
                    This figure is
                  </label>
                  <select
                    id={`${idBase}-kind`}
                    className="inp sel"
                    style={{ fontSize: 11.5 }}
                    value={choice.kind}
                    disabled={!editable || saving}
                    onChange={(e) => update(item, { kind: e.target.value as UnitKind })}
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {(choice.kind === 'money' || choice.kind === 'per_share') && (
                  <div style={{ flex: '1 1 150px' }}>
                    <label className="fl-label" style={{ fontSize: 10 }} htmlFor={`${idBase}-currency`}>
                      Currency
                    </label>
                    <select
                      id={`${idBase}-currency`}
                      className="inp sel"
                      style={{ fontSize: 11.5 }}
                      value={choice.currency}
                      disabled={!editable || saving}
                      onChange={(e) => update(item, { currency: e.target.value })}
                    >
                      {REPORTING_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {(choice.kind === 'money' || choice.kind === 'count') && (
                  <div style={{ flex: '1 1 150px' }}>
                    <label className="fl-label" style={{ fontSize: 10 }} htmlFor={`${idBase}-scale`}>
                      Numbers are in
                    </label>
                    <select
                      id={`${idBase}-scale`}
                      className="inp sel"
                      style={{ fontSize: 11.5 }}
                      value={choice.scale}
                      disabled={!editable || saving}
                      onChange={(e) => update(item, { scale: e.target.value })}
                    >
                      {FINANCIAL_SCALES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {choice.kind === 'other' && (
                  <div style={{ flex: '1 1 200px' }}>
                    <label className="fl-label" style={{ fontSize: 10 }} htmlFor={`${idBase}-text`}>
                      Unit
                    </label>
                    <input
                      id={`${idBase}-text`}
                      className="inp"
                      style={{ fontSize: 11.5, borderColor: problem ? RED : undefined }}
                      value={choice.text}
                      placeholder="e.g. tonnes per day"
                      disabled={!editable || saving}
                      aria-invalid={problem ? true : undefined}
                      aria-describedby={problem ? `${idBase}-problem` : undefined}
                      onChange={(e) => update(item, { text: e.target.value })}
                    />
                  </div>
                )}
              </div>
              {problem && (
                <div id={`${idBase}-problem`} style={{ fontSize: 11.5, color: RED, marginTop: 5 }}>
                  {problem}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <span aria-live="polite" style={{ fontSize: 12, color: error ? RED : MUTED }}>
          {error ?? (editable ? '' : 'The outline is locked — units can no longer be changed.')}
        </span>
        <button
          type="button"
          className="btn bp"
          style={{ marginLeft: 'auto', padding: '9px 18px', fontSize: 12.5 }}
          disabled={!editable || saving}
          onClick={confirm}
        >
          {saving ? 'Saving…' : 'Confirm units'}
        </button>
      </div>
    </div>
  );
}
