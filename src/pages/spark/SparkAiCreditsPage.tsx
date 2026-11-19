// Spark admin → AI credits. Three parts on one page:
//   1. The AI cost one credit covers ($0.02). The low-balance warning % is
//      set in the backend's .env, not here.
//   1b. Credit packs: up to 5, the same for every cloud client; never below
//      the AI cost (credits x the current credit value).
//   2. Model prices: what OpenAI charges per 1 million tokens, for each model
//      the apps use (the list comes from their .env files; Spark types prices).
//   3. Minimum balance to start each action, next to what each action usually
//      cost and the most it cost in the last 30 days (all companies).
// The rules: a job starts while the balance is above zero and at least the
// action's minimum; the real cost is taken after (no hold).
//
// Route: /spark/ai-credits · Plan: Centriton/.claude/plans/ai-credits.md

import { useCallback, useEffect, useState } from 'react';
import { ErrorPopup } from '@/components/shared/ErrorPopup';
import { Spinner } from '@/components/shared/Spinner';
import {
  formatCredits, formatDollars, packMinimumPrice, pricePerCredit,
} from '@/components/ai-credits/creditFormat';
import { useToast } from '@/hooks/use-toast';
import { sparkAiCredits } from '@/lib/api';
import type {
  ActionGroup, ActionGroupInfo, ActionRow, CreditPack, CreditPackDraft, CreditSettings, ModelPrice, ModelUsedBy,
} from '@/types/ai-credits';

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
  const [annualReportingReachable, setAnnualReportingReachable] = useState(true);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [groups, setGroups] = useState<ActionGroupInfo[]>([]);
  const [days, setDays] = useState(30);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([sparkAiCredits.modelPrices(), sparkAiCredits.actions()])
      .then(([priceList, actionList]) => {
        setPrices(priceList.items);
        setAnnualReportingReachable(priceList.annual_reporting_reachable);
        setSettings(priceList.settings);
        setActions(actionList.items);
        setGroups(actionList.groups);
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
      {settings && (
        <CreditPacksCard packs={settings.credit_packs ?? []} creditValue={settings.credit_value_usd}
          onSave={(packs) => saveThen(() => sparkAiCredits.saveCreditPacks(packs), 'Credit packs saved')} />
      )}
      <ModelPricesTable prices={prices} annualReportingReachable={annualReportingReachable}
        onSave={(model, body) => saveThen(() => sparkAiCredits.saveModelPrice(model, body), `${model} price saved`)} />
      {settings && (
        <MinimumsTable actions={actions} groups={groups} days={days} saved={settings.action_minimums}
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

// ── 1b. Credit packs (one list for every cloud client) ──────────────
// Spark sets up to 5 packs once; every cloud client's Buy credits screen
// shows them. A pack can't be priced below its AI cost (credits x the
// CURRENT credit value): the row says so and Save packs stays off. Prices
// never change by themselves. Plan: Centriton/.claude/plans/admin-usage-page.md

const MAX_PACKS = 5;

/** One row of the packs editor: the typed text, and the pack's id if it's
 *  already on sale. rowKey only keeps React's rows apart. */
export type PackRow = { rowKey: number; id?: string; creditsText: string; priceText: string };

/** What's wrong with one row and which box it's about (so the message goes
 *  under that box), or null when it's fine. Same rules as the backend. */
export function packRowIssue(row: PackRow, rows: PackRow[], creditValue: number):
  { field: 'credits' | 'price'; message: string } | null {
  const credits = Number(row.creditsText);
  const price = Number(row.priceText);
  if (row.creditsText.trim() === '' || !Number.isInteger(credits) || credits < 1 || credits > 1_000_000) {
    return { field: 'credits', message: 'Credits must be a whole number from 1 to 1,000,000.' };
  }
  const sameSize = rows.filter((other) => Number(other.creditsText) === credits);
  if (sameSize.length > 1) {
    return { field: 'credits', message: `Another pack also has ${formatCredits(credits)} credits.` };
  }
  if (row.priceText.trim() === '' || !Number.isFinite(price) || price < 0.01 || price > 1_000_000) {
    return { field: 'price', message: 'Enter a price of at least $0.01.' };
  }
  const minimum = packMinimumPrice(credits, creditValue);
  if (price < minimum) {
    return {
      field: 'price',
      message: `At least ${formatDollars(minimum)} for ${formatCredits(credits)} credits (the AI cost). Raise the price.`,
    };
  }
  return null;
}

/** Just the message of packRowIssue, or null when the row is fine. */
export function packRowProblem(row: PackRow, rows: PackRow[], creditValue: number): string | null {
  return packRowIssue(row, rows, creditValue)?.message ?? null;
}

// Every cell starts at the top of the row, so a message under one box never
// pushes the other boxes down out of line.
const PACK_CELL = { verticalAlign: 'top' as const };

/** A pack box: red border when the row's message is about this box. */
function packBoxStyle(hasIssue: boolean) {
  return { width: 110, padding: '6px 10px', borderColor: hasIssue ? '#DC2626' : undefined };
}

function PackMessage({ text }: { text: string }) {
  return <div role="alert" style={{ fontSize: 11, color: '#DC2626', marginTop: 4, maxWidth: 240 }}>{text}</div>;
}

function rowsFromPacks(packs: CreditPack[]): PackRow[] {
  return packs.map((pack, index) => ({
    rowKey: index, id: pack.id, creditsText: String(pack.credits), priceText: String(pack.price),
  }));
}

/** The rows as plain values, to tell whether anything changed. */
function rowValues(rows: PackRow[]): string {
  return JSON.stringify(rows.map((row) => [row.id ?? '', row.creditsText, row.priceText]));
}

function CreditPacksCard({ packs, creditValue, onSave }: {
  packs: CreditPack[];
  creditValue: number;
  onSave: (packs: CreditPackDraft[]) => void;
}) {
  const [rows, setRows] = useState<PackRow[]>(rowsFromPacks(packs));
  const [nextKey, setNextKey] = useState(packs.length);
  // After a save the page reloads: show what was saved.
  useEffect(() => {
    setRows(rowsFromPacks(packs));
    setNextKey(packs.length);
  }, [packs]);

  const issues = rows.map((row) => packRowIssue(row, rows, creditValue));
  const changed = rowValues(rows) !== rowValues(rowsFromPacks(packs));
  const canSave = changed && issues.every((issue) => issue === null);

  const setRow = (rowKey: number, field: 'creditsText' | 'priceText', text: string) =>
    setRows(rows.map((row) => (row.rowKey === rowKey ? { ...row, [field]: text } : row)));
  const addPack = () => {
    setRows([...rows, { rowKey: nextKey, creditsText: '', priceText: '' }]);
    setNextKey(nextKey + 1);
  };
  const removePack = (rowKey: number) => setRows(rows.filter((row) => row.rowKey !== rowKey));
  const save = () => onSave(rows.map((row) => ({
    ...(row.id ? { id: row.id } : {}), credits: Number(row.creditsText), price: Number(row.priceText),
  })));

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '14px 18px' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Credit packs</div>
          <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
            Every cloud client sees these packs on Buy credits. Up to {MAX_PACKS}. Packs already bought keep the price they were bought at.
          </div>
        </div>
        <button type="button" className="btn bs" disabled={rows.length >= MAX_PACKS} onClick={addPack}>+ Add pack</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="utable">
          <thead>
            <tr><th>Credits</th><th>Price ($)</th><th>Per credit</th><th style={{ width: 90 }} /></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="urow">
                <td colSpan={4} style={{ color: '#B45309' }}>
                  No packs. After you save, clients see &quot;Extra credits aren&apos;t on sale yet. Contact Centriyon.&quot;
                </td>
              </tr>
            )}
            {rows.map((row, index) => {
              const issue = issues[index];
              const credits = Number(row.creditsText);
              const price = Number(row.priceText);
              return (
                <tr key={row.rowKey} className="urow">
                  <td style={PACK_CELL}>
                    <input className="inp" inputMode="numeric" aria-label={`Credits in pack ${index + 1}`} value={row.creditsText}
                      onChange={(e) => setRow(row.rowKey, 'creditsText', e.target.value)}
                      style={packBoxStyle(issue?.field === 'credits')} />
                    {issue?.field === 'credits' && <PackMessage text={issue.message} />}
                  </td>
                  <td style={PACK_CELL}>
                    <input className="inp" inputMode="decimal" aria-label={`Price of pack ${index + 1}`} value={row.priceText}
                      onChange={(e) => setRow(row.rowKey, 'priceText', e.target.value)}
                      style={packBoxStyle(issue?.field === 'price')} />
                    {issue?.field === 'price' && <PackMessage text={issue.message} />}
                  </td>
                  <td style={{ ...PACK_CELL, color: '#5A6080', lineHeight: '34px' }}>
                    {credits > 0 && price > 0 ? formatDollars(pricePerCredit({ credits, price }), 3) : '—'}
                  </td>
                  <td style={{ ...PACK_CELL, textAlign: 'right' }}>
                    <button type="button" className="btn bs" onClick={() => removePack(row.rowKey)}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 18px', borderTop: '1px solid #ECEEF8', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: '#9BA3C4', flex: '1 1 320px' }}>
          A pack can&apos;t sell below the AI cost: credits × {formatDollars(creditValue, 3)}. If the credit value goes up, raise any pack that falls below it first.
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {changed && (
            <span role="status" style={{ fontSize: 11, fontWeight: 700, color: '#B45309' }}>
              Unsaved changes — press Save packs to update what clients see.
            </span>
          )}
          <button type="button" className="btn bp" disabled={!canSave} onClick={save}>Save packs</button>
        </span>
      </div>
    </div>
  );
}

// ── 2. Model prices ─────────────────────────────────────────────────
// The models come from the apps' .env files (and models used in the last 30
// days), not from Spark: Spark only types prices. Plan:
// Centriton/.claude/plans/model-prices-from-code.md

type PriceBody = { input_price_per_million: number; output_price_per_million: number };

const USED_BY_BADGE: Record<ModelUsedBy, string> = {
  'Centriyon': 'b-or',
  'Annual Reporting': 'b-pp',
  'Recent usage': 'b-gy',
};

/** Whether a row's two price boxes hold valid prices, and whether they differ
 *  from what's saved (a model with no price yet always counts as changed). */
export function priceBoxState(price: ModelPrice, inputText: string, outputText: string) {
  const input = readAmount(inputText);
  const output = readAmount(outputText);
  const valid = input !== null && output !== null;
  const changed = !price.has_price
    || input !== price.input_price_per_million
    || output !== price.output_price_per_million;
  return { input, output, valid, changed };
}

/** The price box text for a saved price ('' when there's none yet). */
function priceText(value: number | null): string {
  return value === null ? '' : String(value);
}

function ModelPricesTable({ prices, annualReportingReachable, onSave }: {
  prices: ModelPrice[];
  annualReportingReachable: boolean;
  onSave: (model: string, body: PriceBody) => void;
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Model prices</div>
        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
          What OpenAI charges per 1 million tokens, for each model the apps use. Copy them from{' '}
          <a href={OPENAI_PRICES_URL} target="_blank" rel="noreferrer">OpenAI&apos;s price page</a>.
          Thinking tokens count as writing. Change a price, then press Save.
        </div>
        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 4 }}>
          The list comes from the apps&apos; settings: a developer adds or changes a model there.
        </div>
        {!annualReportingReachable && (
          <div style={{ fontSize: 11, color: '#D97706', marginTop: 4 }}>
            Couldn&apos;t reach Annual Reporting, so its models are shown from recent usage.
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="utable">
          <thead>
            <tr>
              <th>Model</th><th>Used by</th>
              <th style={{ textAlign: 'right' }}>Reading (input) · $ per 1M</th>
              <th style={{ textAlign: 'right' }}>Writing (output) · $ per 1M</th>
              <th>Last updated</th><th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody>
            {prices.map((price) => <ModelPriceRow key={price.model} price={price} onSave={onSave} />)}
            {prices.length === 0 && (
              <tr className="urow"><td colSpan={6} style={{ color: '#9BA3C4' }}>No models found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceBox({ label, value, onChange }: { label: string; value: string; onChange: (text: string) => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ color: '#9BA3C4' }}>$</span>
      <input className="inp" inputMode="decimal" aria-label={label} value={value} placeholder="0.00"
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 110, textAlign: 'right', padding: '6px 10px' }} />
    </span>
  );
}

function ModelPriceRow({ price, onSave }: { price: ModelPrice; onSave: (model: string, body: PriceBody) => void }) {
  const [inputText, setInputText] = useState(priceText(price.input_price_per_million));
  const [outputText, setOutputText] = useState(priceText(price.output_price_per_million));
  // After a save the page reloads; show the saved prices again.
  useEffect(() => {
    setInputText(priceText(price.input_price_per_million));
    setOutputText(priceText(price.output_price_per_million));
  }, [price]);

  const state = priceBoxState(price, inputText, outputText);
  const typedSomething = inputText.trim() !== '' || outputText.trim() !== '';
  const showError = !state.valid && (price.has_price || typedSomething);

  const save = () => {
    if (state.input === null || state.output === null) return;
    onSave(price.model, { input_price_per_million: state.input, output_price_per_million: state.output });
  };

  return (
    <tr className="urow" style={price.has_price ? undefined : { ['--row-accent' as string]: '#DC2626', background: '#FEF6F6' }}>
      <td>
        <div style={{ fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>{price.model}</div>
        {!price.has_price && (
          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>
            No price yet: jobs on this model are free until you add one.
          </div>
        )}
      </td>
      <td>
        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {price.used_by.map((source) => <span key={source} className={`badge ${USED_BY_BADGE[source]}`}>{source}</span>)}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        <PriceBox label={`Reading price for ${price.model}`} value={inputText} onChange={setInputText} />
      </td>
      <td style={{ textAlign: 'right' }}>
        <PriceBox label={`Writing price for ${price.model}`} value={outputText} onChange={setOutputText} />
        {showError && (
          <div role="alert" style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>Enter a price of 0 or more in both boxes.</div>
        )}
      </td>
      <td style={{ color: '#9BA3C4' }}>{price.updated_at ? price.updated_at.slice(0, 10) : '—'}</td>
      <td style={{ textAlign: 'right' }}>
        {state.changed && state.valid && (
          <button type="button" className="btn bp" onClick={save}>Save</button>
        )}
      </td>
    </tr>
  );
}

// ── 3. Minimum balance to start each action ─────────────────────────
// The actions are shown under 8 groups (Generate, Refine, Assemble, Translate,
// Validate, Design, Documents, Chat). Groups only organise the page: each
// action keeps its own minimum. Plan: Centriton/.claude/plans/ai-action-groups.md

/** The actions of each group, in the groups' order; empty groups are left out. */
export function actionsByGroup(groups: ActionGroupInfo[], actions: ActionRow[]) {
  const sections = [];
  for (const group of groups) {
    const groupActions = actions.filter((action) => action.group === group.key);
    if (groupActions.length > 0) sections.push({ group, actions: groupActions });
  }
  return sections;
}

function MinimumsTable({ actions, groups, days, saved, onSave }: {
  actions: ActionRow[];
  groups: ActionGroupInfo[];
  days: number;
  saved: Record<string, number>;
  onSave: (changes: Record<string, number>) => void;
}) {
  // Every group starts collapsed: Spark sees the 8 headings first and opens one to edit.
  const [opened, setOpened] = useState<ActionGroup[]>([]);
  const [edited, setEdited] = useState<Record<string, number>>({});
  useEffect(() => setEdited({}), [saved]);

  const changes = changedMinimums(saved, edited);
  const minimumOf = (action: ActionRow) => edited[action.key] ?? action.minimum;
  const toggle = (key: ActionGroup) =>
    setOpened(opened.includes(key) ? opened.filter((item) => item !== key) : [...opened, key]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Minimum balance to start each action</div>
        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
          0 = above zero is enough. A higher minimum stops a big job starting on a nearly empty balance.
          Every action is still charged its real cost.
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="utable">
          <thead>
            <tr>
              <th>Action</th><th>Charged</th><th>Minimum to start</th>
              <th>Usually costs<br /><small>last {days} days</small></th>
              <th>Most it has cost<br /><small>last {days} days</small></th>
            </tr>
          </thead>
          {actionsByGroup(groups, actions).map(({ group, actions: groupActions }) => {
            const open = opened.includes(group.key);
            return (
              <tbody key={group.key}>
                <tr>
                  <td colSpan={5} style={{ padding: 0, background: '#F6F7FC', borderTop: '1px solid #ECEEF8' }}>
                    <button type="button" aria-expanded={open} onClick={() => toggle(group.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 18px',
                        background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 11, color: '#5A6080', width: 10 }}>{open ? '▾' : '▸'}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#1A1D2E' }}>{group.label}</span>
                      <span className="uhead-count" style={{ marginLeft: 0 }}>{groupActions.length}</span>
                      <span style={{ fontSize: 11, color: '#9BA3C4' }}>{group.line}</span>
                    </button>
                  </td>
                </tr>
                {open && groupActions.map((action) => (
                  <tr key={action.key} className="urow">
                    <td style={{ paddingLeft: 38 }}>
                      <b>{action.label}</b><br /><span style={{ color: '#9BA3C4' }}>{action.line}</span>
                    </td>
                    <td style={{ color: '#5A6080' }}>{PER_WORDS[action.per]}</td>
                    <td>
                      <input className="inp" inputMode="numeric" aria-label={`Minimum to start ${action.label}`}
                        value={minimumOf(action)} style={{ width: 80, padding: '6px 10px' }}
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
            );
          })}
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
