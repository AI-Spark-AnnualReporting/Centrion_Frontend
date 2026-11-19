// Spark admin → AI credits. Three parts on one page:
//   1. Two settings: the AI cost one credit covers ($0.02) and when to warn
//      a company's admin that credits are low (20%).
//   2. Model prices: what OpenAI charges per 1 million tokens, per model.
//   3. Minimum balance to start each action, next to what each action usually
//      cost and the most it cost in the last 30 days (all companies).
// The rules: a job starts while the balance is above zero and at least the
// action's minimum; the real cost is taken after (no hold).
//
// Route: /spark/ai-credits · Plan: Centriton/.claude/plans/ai-credits.md

import { useCallback, useEffect, useState } from 'react';
import { ErrorPopup } from '@/components/shared/ErrorPopup';
import { Spinner } from '@/components/shared/Spinner';
import { formatCredits } from '@/components/ai-credits/creditFormat';
import { useToast } from '@/hooks/use-toast';
import { sparkAiCredits } from '@/lib/api';
import type { ActionArea, ActionRow, CreditSettings, ModelPrice } from '@/types/ai-credits';

const AREAS: { key: ActionArea | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'design', label: 'Annual report · Design' },
  { key: 'writing', label: 'Writing' },
  { key: 'documents', label: 'Documents' },
  { key: 'chat', label: 'Chat' },
];

const PER_WORDS: Record<ActionRow['per'], string> = {
  section: 'per section', job: 'per job', document: 'per document', message: 'per message',
};

const OPENAI_PRICES_URL = 'https://openai.com/api/pricing/';

/** A number ≥ 0 from an input, or null when it isn't one. */
export function readAmount(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** The minimums that differ from the saved ones (0 = remove), to send in one PATCH. */
export function changedMinimums(saved: Record<string, number>, edited: Record<string, number>): Record<string, number> {
  const changes: Record<string, number> = {};
  for (const [action, minimum] of Object.entries(edited)) {
    if ((saved[action] ?? 0) !== minimum) changes[action] = minimum;
  }
  return changes;
}

export default function SparkAiCreditsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [settings, setSettings] = useState<CreditSettings | null>(null);
  const [prices, setPrices] = useState<ModelPrice[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [days, setDays] = useState(30);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([sparkAiCredits.modelPrices(), sparkAiCredits.actions()])
      .then(([priceList, actionList]) => {
        setPrices(priceList.items);
        setSettings(priceList.settings);
        setActions(actionList.items);
        setDays(actionList.days);
        setLoadError('');
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load AI credits.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  /** Run a save; on success toast and reload, on failure open the error popup. */
  const saveThen = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast({ title: done });
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  if (loading && !settings) return <Spinner pad={80} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>AI credits</div>
        <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
          Companies pay for AI by what it really used. A job starts while the balance is above zero and at
          least the action&apos;s minimum; the real cost is taken when it finishes.
        </div>
      </div>
      {loadError && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{loadError}</div>}
      <ErrorPopup open={!!saveError} title="Couldn't save" message={saveError} onClose={() => setSaveError('')} />

      {settings && (
        <CreditValueCard settings={settings}
          onSave={(changes) => saveThen(() => sparkAiCredits.changeSettings(changes), 'Settings saved')} />
      )}
      <ModelPricesTable prices={prices}
        onSave={(model, body) => saveThen(() => sparkAiCredits.saveModelPrice(model, body), `${model} price saved`)} />
      {settings && (
        <MinimumsTable actions={actions} days={days} saved={settings.action_minimums}
          onSave={(changes) => saveThen(() => sparkAiCredits.changeSettings({ action_minimums: changes }), 'Minimums saved')} />
      )}
    </div>
  );
}

// ── 1. Settings ─────────────────────────────────────────────────────

// The low-balance warning percent isn't edited here: it's set in the backend's
// .env (AI_CREDITS_LOW_BALANCE_PERCENT), so only a developer can change it.
function CreditValueCard({ settings, onSave }: {
  settings: CreditSettings;
  onSave: (changes: { credit_value_usd: number }) => void;
}) {
  const [creditValue, setCreditValue] = useState(String(settings.credit_value_usd));
  useEffect(() => {
    setCreditValue(String(settings.credit_value_usd));
  }, [settings]);

  const value = readAmount(creditValue);
  const valueChanged = value !== settings.credit_value_usd;
  const valid = value !== null && value > 0;

  const save = () => {
    if (value !== null) onSave({ credit_value_usd: value });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr)) auto', gap: 12, alignItems: 'stretch' }}>
      <label className="card" style={{ padding: 16, fontSize: 12, fontWeight: 700, color: '#5A6080' }}>
        1 credit covers this much AI cost
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          $ <input className="inp" inputMode="decimal" aria-label="Credit value in dollars" value={creditValue}
            onChange={(e) => setCreditValue(e.target.value)} />
        </span>
        <span style={{ display: 'block', fontWeight: 500, fontSize: 11, marginTop: 6, color: valueChanged ? '#D97706' : '#9BA3C4' }}>
          {valueChanged
            ? 'Changing it changes every price clients see from now on. Past charges stay as they were.'
            : 'Every charge = real AI cost ÷ this amount.'}
        </span>
      </label>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <button type="button" className="btn bp" disabled={!valid || !valueChanged} onClick={save}>
          Save settings
        </button>
      </div>
    </div>
  );
}

// ── 2. Model prices ─────────────────────────────────────────────────

function ModelPricesTable({ prices, onSave }: {
  prices: ModelPrice[];
  onSave: (model: string, body: { input_price_per_million: number; output_price_per_million: number }) => void;
}) {
  const [newModel, setNewModel] = useState('');
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Model prices</div>
          <div style={{ fontSize: 11, color: '#9BA3C4' }}>
            What OpenAI charges per 1 million tokens. Copy them from{' '}
            <a href={OPENAI_PRICES_URL} target="_blank" rel="noreferrer">OpenAI&apos;s price page</a>. Thinking tokens count as writing.
          </div>
        </div>
        <span style={{ display: 'flex', gap: 6 }}>
          <input className="inp" aria-label="New model name" placeholder="New model, e.g. gpt-5" value={newModel}
            onChange={(e) => setNewModel(e.target.value.trim())} style={{ width: 180 }} />
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="utable" style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr><th>Model</th><th>Reading (input) · $ per 1M</th><th>Writing (output) · $ per 1M</th><th>Last updated</th><th /></tr>
          </thead>
          <tbody>
            {prices.map((price) => <ModelPriceRow key={price.model} price={price} onSave={onSave} />)}
            {newModel && !prices.some((price) => price.model === newModel) && (
              <ModelPriceRow key={`new-${newModel}`} isNew onSave={(model, body) => { onSave(model, body); setNewModel(''); }}
                price={{ model: newModel, input_price_per_million: 0, output_price_per_million: 0, updated_at: '', updated_by: null }} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelPriceRow({ price, onSave, isNew = false }: {
  price: ModelPrice;
  onSave: (model: string, body: { input_price_per_million: number; output_price_per_million: number }) => void;
  isNew?: boolean;
}) {
  const [input, setInput] = useState(String(price.input_price_per_million));
  const [output, setOutput] = useState(String(price.output_price_per_million));
  const inputNumber = readAmount(input);
  const outputNumber = readAmount(output);
  const changed = isNew || inputNumber !== Number(price.input_price_per_million) || outputNumber !== Number(price.output_price_per_million);
  return (
    <tr>
      <td style={{ fontFamily: "'DM Mono', monospace" }}>{price.model}{isNew && <span className="badge b-am" style={{ marginLeft: 6 }}>new</span>}</td>
      <td><input className="inp" inputMode="decimal" aria-label={`Reading price for ${price.model}`} value={input} onChange={(e) => setInput(e.target.value)} style={{ width: 100 }} /></td>
      <td><input className="inp" inputMode="decimal" aria-label={`Writing price for ${price.model}`} value={output} onChange={(e) => setOutput(e.target.value)} style={{ width: 100 }} /></td>
      <td style={{ color: '#9BA3C4' }}>{price.updated_at ? price.updated_at.slice(0, 10) : '—'}</td>
      <td style={{ textAlign: 'right' }}>
        <button type="button" className="btn bs" disabled={!changed || inputNumber === null || outputNumber === null}
          onClick={() => onSave(price.model, { input_price_per_million: inputNumber!, output_price_per_million: outputNumber! })}>
          {isNew ? 'Add' : 'Save'}
        </button>
      </td>
    </tr>
  );
}

// ── 3. Minimum balance to start each action ─────────────────────────

function MinimumsTable({ actions, days, saved, onSave }: {
  actions: ActionRow[];
  days: number;
  saved: Record<string, number>;
  onSave: (changes: Record<string, number>) => void;
}) {
  const [area, setArea] = useState<ActionArea | 'all'>('all');
  const [edited, setEdited] = useState<Record<string, number>>({});
  useEffect(() => setEdited({}), [saved]);

  const changes = changedMinimums(saved, edited);
  const shown = actions.filter((action) => area === 'all' || action.area === area);
  const minimumOf = (action: ActionRow) => edited[action.key] ?? action.minimum;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Minimum balance to start each action</div>
          <div style={{ fontSize: 11, color: '#9BA3C4' }}>
            0 = above zero is enough. A higher minimum stops a big job starting on a nearly empty balance.
          </div>
        </div>
        <div role="group" aria-label="Filter by area" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {AREAS.map((option) => (
            <button key={option.key} type="button" aria-pressed={area === option.key}
              className={`btn ${area === option.key ? 'bp' : 'bs'}`} onClick={() => setArea(option.key)}>
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="utable" style={{ width: "100%", fontSize: 12 }}>
          <thead>
            <tr>
              <th>Action</th><th>Charged</th><th>Minimum to start</th>
              <th>Usually costs<br /><small>last {days} days</small></th>
              <th>Most it has cost<br /><small>last {days} days</small></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((action) => (
              <tr key={action.key}>
                <td><b>{action.label}</b><br /><span style={{ color: '#9BA3C4' }}>{action.line}</span></td>
                <td style={{ color: '#5A6080' }}>{PER_WORDS[action.per]}</td>
                <td>
                  <input className="inp" inputMode="numeric" aria-label={`Minimum to start ${action.label}`}
                    value={minimumOf(action)} style={{ width: 80 }}
                    onChange={(e) => {
                      const value = Math.floor(Number(e.target.value));
                      setEdited({ ...edited, [action.key]: Number.isFinite(value) && value >= 0 ? value : 0 });
                    }} /> credits
                </td>
                <td>{action.usual_credits == null ? '—' : `${formatCredits(action.usual_credits)} credits`}</td>
                <td>{action.most_credits == null ? '—' : `${formatCredits(action.most_credits)} credits`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #ECEEF8', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#9BA3C4' }}>
          &quot;Usually costs&quot; is the average job and &quot;Most it has cost&quot; the biggest one, across all companies.
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn bs" disabled={Object.keys(changes).length === 0} onClick={() => setEdited({})}>Undo</button>
          <button type="button" className="btn bp" disabled={Object.keys(changes).length === 0} onClick={() => onSave(changes)}>
            Save minimums
          </button>
        </span>
      </div>
    </div>
  );
}
