// Spark admin → Subscriptions → Create / Edit a plan. One screen that never
// scrolls: a top card (name, duration, price, buttons) and side-by-side cards
// — Modules, Users, Departments, Preview. Enterprise swaps the middle cards for
// the contact details. Also opens a client's quote (a draft plan for that
// company) to check it, set the price and publish it.
//
// Editing the modules or limits of a plan companies are on asks first:
// "Apply to everyone" or "Only new subscriptions". A price change never asks.
//
// A client's quote opens here as an Enterprise offer: Spark picks the length,
// types a price per report (or a flat price) for each module and one price
// for the Users and the Departments cards; the Price box adds them up (Spark
// may type its own total). "Send offer" emails it (the client replies by
// email); "Approve" publishes it for that company. Only Spark approves.
// Plan: Centriton/.claude/plans/quote-offers.md
//
// Routes: /spark/subscriptions/new, /spark/subscriptions/:planId/edit
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ErrorPopup, isNameTaken } from '@/components/shared/ErrorPopup';
import { Spinner } from '@/components/shared/Spinner';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import { NO_PRICES, OfferBreakdown, dollars, offerAddedUp } from '@/components/subscriptions/OfferBreakdown';
import { OfferEmailDialog } from '@/components/subscriptions/OfferEmailDialog';
import { PlanCard } from '@/components/subscriptions/PlanCard';
import {
  ContactCard, DURATIONS, EMPTY_LIMITS, ModulesCard, UsersCard, countWord, durationPer,
} from '@/components/subscriptions/PlanFields';
import { useToast } from '@/hooks/use-toast';
import { sparkPlans } from '@/lib/api';
import type { LicensableModule } from '@/types/license';
import type {
  CurrentPlan, Duration, OfferPrices, PaidDuration, PlanForm, PlanLimits, PlanStatus, PlanSubscriber, SubscriptionPlan,
} from '@/types/subscription';

export const SUBSCRIPTIONS_PAGE = '/spark/subscriptions';
export const QUOTES_PAGE = '/spark/quotes';

// An offer always has a length; it's shown as Enterprise.
const OFFER_LENGTHS: { key: PaidDuration; label: string; per: string }[] = [
  { key: 'quarterly', label: 'Enterprise · 3 months', per: 'per quarter' },
  { key: 'half_year', label: 'Enterprise · 6 months', per: 'per 6 months' },
  { key: 'yearly', label: 'Enterprise · 1 year', per: 'per year' },
];

// A stable empty list, so the Send popup doesn't start again on every render.
const NO_EMAILS: string[] = [];

const LIMIT_KEYS: (keyof PlanLimits)[] = ['modules', 'report_limits', 'max_users'];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Report limits in one fixed order, so {a, b} and {b, a} compare equal. */
function sortedLimits(limits: Record<string, number>): [string, number][] {
  return Object.entries(limits).sort(([a], [b]) => a.localeCompare(b));
}

/** True if the form changes what subscriptions copy from the plan
 *  (modules, report limits, users) — not the name or price. */
export function limitsChanged(plan: SubscriptionPlan, form: PlanForm): boolean {
  for (const key of LIMIT_KEYS) {
    let before: unknown = plan[key];
    let after: unknown = form[key];
    if (key === 'modules') {
      before = [...plan.modules].sort();
      after = [...form.modules].sort();
    }
    if (key === 'report_limits') {
      before = sortedLimits(plan.report_limits);
      after = sortedLimits(form.report_limits);
    }
    if (!sameValue(before, after)) return true;
  }
  return false;
}

function formFromPlan(plan?: SubscriptionPlan): PlanForm {
  if (!plan) return { ...EMPTY_LIMITS, name: '', duration: 'yearly', price: null, contact: null };
  return {
    name: plan.name,
    duration: plan.duration,
    price: plan.price,
    contact: plan.contact,
    modules: plan.modules,
    report_limits: plan.report_limits,
    max_users: plan.max_users,
  };
}

/** A price from its input: a number, or null when blank. */
function readPrice(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Everything the offer email shows, as one string: two equal strings = the
 *  client already saw these numbers. Keys sorted so order doesn't count. */
function offerSnapshot(form: PlanForm, prices: OfferPrices, total: number): string {
  return JSON.stringify([
    form.name.trim(), form.duration, [...form.modules].sort(), sortedLimits(form.report_limits),
    form.max_users,
    sortedLimits(prices.modules), prices.users, total,
  ]);
}

/** "Current: 2 reports" / "Current: included" under each module of the
 *  client's current plan (quote offers), so Spark doesn't offer less by mistake. */
function currentPlanCaptions(current: CurrentPlan, catalogue: LicensableModule[]): Record<string, string> {
  const captions: Record<string, string> = {};
  for (const module of catalogue) {
    if (!current.modules.includes(module.key)) continue;
    const reports = module.report_type ? current.report_limits[module.report_type] : undefined;
    captions[module.key] = reports !== undefined
      ? `Current: ${reports} ${countWord(module.key, reports)}`
      : 'Current: included';
  }
  return captions;
}

/** What is sent to the server: modules sorted (as the server stores them). */
function bodyFrom(form: PlanForm, status: PlanStatus): PlanForm {
  const enterprise = form.duration === 'enterprise';
  return {
    ...form,
    name: form.name.trim(),
    modules: [...form.modules].sort(),
    price: enterprise ? null : form.price,
    contact: enterprise ? form.contact : null,
    status,
  };
}

/** The modules the page lists, from the server (one small call). */
async function loadModuleCatalogue(): Promise<LicensableModule[]> {
  const page = await sparkPlans.list({ limit: 1 });
  return page.modules_catalogue;
}

export default function SparkPlanEditorPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  // Where Cancel and saving go back to (the page that opened this one).
  const backState = (location.state as { back?: string } | null)?.back;

  const [plan, setPlan] = useState<SubscriptionPlan | undefined>(undefined);
  const [catalogue, setCatalogue] = useState<LicensableModule[]>([]);
  const [form, setForm] = useState<PlanForm>(() => formFromPlan());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');          // the plan didn't load
  // A save the server refused, shown in the error popup.
  const [saveError, setSaveError] = useState<{ title: string; message: string } | null>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  // Set = asking "Apply to everyone / Only new subscriptions" before saving.
  const [confirm, setConfirm] = useState<{ status: PlanStatus; subscribers: PlanSubscriber[] } | null>(null);
  const [applyTo, setApplyTo] = useState<'everyone' | 'new'>('new');
  // Quote offers: the typed prices, and the Send offer / Approve popups.
  const [prices, setPrices] = useState<OfferPrices>(NO_PRICES);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  // What the last emailed offer said, to spot edits made since (they need sending again).
  const [sentSnapshot, setSentSnapshot] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loads: [Promise<LicensableModule[]>, Promise<SubscriptionPlan | undefined>] = [
      loadModuleCatalogue(),
      planId ? sparkPlans.get(planId) : Promise.resolve(undefined),
    ];
    Promise.all(loads)
      .then(([modules, loaded]) => {
        if (cancelled) return;
        setCatalogue(modules);
        const loadedForm = formFromPlan(loaded);
        const loadedPrices = loaded?.quote?.prices ?? NO_PRICES;
        setPlan(loaded);
        setForm(loadedForm);
        setPrices(loadedPrices);
        setSentSnapshot(offerSnapshot(loadedForm, loadedPrices, loadedForm.price ?? offerAddedUp(loadedForm, loadedPrices, modules)));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the plan.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [planId]);

  const isQuote = !!plan?.quote && plan.status === 'draft';
  // Opened from a notification or an email: a quote goes back to Quotes.
  const backTo = backState ?? (plan?.quote ? QUOTES_PAGE : SUBSCRIPTIONS_PAGE);
  const companyName = plan?.company_name ?? 'this company';
  const enterprise = form.duration === 'enterprise';
  const published = plan?.status === 'published';

  const done = (status: PlanStatus) => {
    let message = 'Plan saved';
    if (status === 'published') message = isQuote ? `Published — ${companyName} can subscribe now` : plan ? 'Plan saved' : 'Plan published';
    if (status === 'draft') message = 'Saved as draft';
    toast({ title: message });
    navigate(backTo);
  };

  /** Asks "Apply to everyone / Only new" if companies are on the plan.
   *  Returns true when it asked (so the save waits for the answer). */
  const askWhoGetsIt = async (status: PlanStatus): Promise<boolean> => {
    const { items } = await sparkPlans.subscribers(plan!.id);
    if (items.length === 0) return false;
    setConfirm({ status, subscribers: items });
    return true;
  };

  /** Open the error popup. A name clash gets its own title. */
  const showSaveError = (message: string, title = "Couldn't save the plan") => {
    setSaveError({ title: isNameTaken(message) ? 'This name is already taken' : title, message });
  };

  /** Close the popup; after a name clash the cursor goes to the name box. */
  const closeSaveError = () => {
    const wasName = !!saveError && isNameTaken(saveError.message);
    setSaveError(null);
    if (wasName) setTimeout(() => nameBox.current?.focus(), 0);
  };

  const save = async (status: PlanStatus, apply?: 'everyone' | 'new') => {
    setSaving(true);
    const body = bodyFrom(form, status);
    try {
      if (!plan) {
        await sparkPlans.create(body);
      } else {
        if (!apply && limitsChanged(plan, form) && await askWhoGetsIt(status)) return;
        await sparkPlans.update(plan.id, { ...body, ...(apply ? { apply_to: apply } : {}) });
      }
      done(status);
    } catch (err) {
      // Someone subscribed since the page loaded: ask now.
      if (plan && !apply && err instanceof Error && err.message.includes('use this plan')) {
        const asked = await askWhoGetsIt(status).catch(() => false);
        if (!asked) showSaveError(err.message);
        return;
      }
      showSaveError(err instanceof Error ? err.message : 'Could not save the plan.');
    } finally {
      setSaving(false);
    }
  };

  // ── Quote offers ──
  const addedUp = offerAddedUp(form, prices, catalogue);
  // No total typed (price is null) = the prices added up.
  const offerTotal = form.price ?? addedUp;

  /** Save the offer as a draft (prices included). True when it saved. The
   *  error goes where it can be seen: the page, or the Send offer popup
   *  (it covers the page) when saving before sending. */
  const saveOffer = async (
    showError: (message: string) => void = (message) => showSaveError(message, "Couldn't save the offer"),
  ): Promise<boolean> => {
    try {
      await sparkPlans.update(plan!.id, { ...bodyFrom(form, 'draft'), offer_prices: prices });
      return true;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not save the offer.');
      return false;
    }
  };

  const saveOfferDraft = async () => {
    setSaving(true);
    if (await saveOffer()) {
      toast({ title: 'Saved as draft' });
      navigate(backTo);
    }
    setSaving(false);
  };

  /** Save, then email the offer to the chosen addresses. Stays on the page. */
  const sendOffer = async (recipients: string[], subject: string) => {
    setSaving(true);
    setEmailError('');
    try {
      if (await saveOffer(setEmailError)) {
        const saved = await sparkPlans.sendOffer(plan!.id, { recipients, subject });
        setPlan({ ...plan!, ...saved, company_name: plan!.company_name, company_admin_emails: plan!.company_admin_emails });
        setSentSnapshot(offerSnapshot(form, prices, offerTotal));
        setEmailOpen(false);
        toast({ title: `Offer emailed to ${recipients.join(', ')}` });
      }
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not send the offer.');
    } finally {
      setSaving(false);
    }
  };

  /** Save, then approve: published for the company, which can subscribe now. */
  const approveOffer = async () => {
    setApproveOpen(false);
    setSaving(true);
    try {
      if (await saveOffer()) {
        await sparkPlans.approveOffer(plan!.id);
        toast({ title: `Approved — ${companyName} can subscribe now` });
        navigate(backTo);
      }
    } catch (err) {
      showSaveError(err instanceof Error ? err.message : 'Could not approve the plan.', "Couldn't approve the offer");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner pad={80} />;

  const setLimits = (next: PlanLimits) => setForm({ ...form, ...next });
  const setModulePrice = (moduleKey: string, price: number) =>
    setPrices({ ...prices, modules: { ...prices.modules, [moduleKey]: price } });
  const sentOffer = isQuote ? plan?.quote?.offer : undefined;
  // The client's plan now, as small "Current" words in the cards (quote offers only).
  const current = isQuote ? plan?.current_plan ?? null : null;
  // Edited after it was emailed (saved before, or on this page now): the client
  // hasn't seen these numbers, so Approve waits until it's sent again (decided 2026-11-09).
  const changedSinceSent = !!sentOffer?.sent_at
    && (plan?.offer_state === 'changed' || offerSnapshot(form, prices, offerTotal) !== sentSnapshot);
  const canApprove = !!sentOffer?.sent_at && !changedSinceSent;
  const changeDuration = (duration: Duration) => {
    setForm({ ...form, duration });
  };
  const canSave = !saving && form.name.trim() !== '';

  return (
    <div className="sub-ed">
      <div className="card sub-ed-top">
        <label>
          Plan name
          <input ref={nameBox} className="inp" value={form.name} maxLength={120} placeholder="e.g. Standard"
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Duration
          <select className="inp" value={form.duration} onChange={(e) => changeDuration(e.target.value as Duration)}>
            {isQuote
              ? OFFER_LENGTHS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)
              : DURATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        {enterprise && <div />}
        {!enterprise && !isQuote && (
          <label>
            Price (USD) <span style={{ color: '#9BA3C4' }}>{durationPer(form.duration)}</span>
            <input className="inp" style={{ fontFamily: "'DM Mono', monospace" }} inputMode="decimal" placeholder="—"
              value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: readPrice(e.target.value) })} />
          </label>
        )}
        {isQuote && (
          <label>
            Price (USD) <span style={{ color: '#9BA3C4' }}>{durationPer(form.duration)}</span>
            <input className="inp" style={{ fontFamily: "'DM Mono', monospace" }} inputMode="decimal"
              value={offerTotal} onChange={(e) => setForm({ ...form, price: readPrice(e.target.value) })} />
          </label>
        )}
        {isQuote ? (
          <div className="sub-ed-btns">
            <button type="button" className="btn bs" onClick={() => navigate(backTo)}>Cancel</button>
            <button type="button" className="btn bs" disabled={!canSave} onClick={saveOfferDraft}>Save draft</button>
            <button type="button" className="btn bs" disabled={!canSave || form.modules.length === 0}
              onClick={() => { setEmailError(''); setEmailOpen(true); }}>✉ Send offer</button>
            {/* Approve only shows once this exact offer has been emailed to the client (decided 2026-11-09). */}
            {canApprove && (
              <button type="button" className="btn sub-approve" disabled={!canSave || form.modules.length === 0}
                onClick={() => setApproveOpen(true)}>
                {saving ? 'Saving…' : '✓ Approve for ' + companyName}
              </button>
            )}
          </div>
        ) : (
        <div className="sub-ed-btns">
          <button type="button" className="btn bs" onClick={() => navigate(backTo)}>Cancel</button>
          {!published && (
            <button type="button" className="btn bs" disabled={!canSave} onClick={() => save('draft')}>Save draft</button>
          )}
          <button type="button" className="btn bp" disabled={!canSave} onClick={() => save('published')}>
            {saving ? 'Saving…' : published ? 'Save' : 'Publish'}
          </button>
        </div>
        )}
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: -6 }}>{error}</div>}
      <ErrorPopup open={!!saveError} title={saveError?.title ?? ''} message={saveError?.message ?? ''} onClose={closeSaveError} />
      {isQuote && plan?.quote && (
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: -6 }}>
          Their request: <b>{plan.quote.name}</b> · {plan.quote.phone} — “{plan.quote.message}”
          {current && <> · <b>Current plan: {current.name}</b> (ends {current.ends_at})</>}
          {canApprove && (
            <span style={{ color: '#4040C8', fontWeight: 700, marginLeft: 8 }}>
              · Offer sent {sentOffer!.sent_at!.slice(0, 10)} to {(sentOffer!.sent_to ?? []).join(', ')}
            </span>
          )}
          {changedSinceSent && (
            <span style={{ color: '#D97706', fontWeight: 700, marginLeft: 8 }}>
              · Changed since you emailed it on {sentOffer!.sent_at!.slice(0, 10)} — send the offer again
            </span>
          )}
        </div>
      )}

      <div className="sub-ed-cards">
        {enterprise ? (
          <ContactCard value={form.contact} onChange={(contact) => setForm({ ...form, contact })} />
        ) : (
          <>
            <ModulesCard value={form} catalogue={catalogue} onChange={setLimits}
              subtitle={isQuote ? 'Reports start at 1 · type the price per report (or one flat price)' : undefined}
              captions={current ? currentPlanCaptions(current, catalogue) : undefined}
              openWith={current?.modules}
              pricing={isQuote ? { prices: prices.modules, onPriceChange: setModulePrice } : undefined} />
            <div className="sub-ed-col">
              <UsersCard value={form} onChange={setLimits} current={current ?? undefined}
                cardPrice={isQuote ? { price: prices.users, onPriceChange: (users) => setPrices({ ...prices, users }) } : undefined} />
            </div>
          </>
        )}
        {isQuote ? (
          <div className="card sub-ed-prev" style={{ overflowY: 'auto' }}>
            <div className="sub-ed-prev-t">Preview — what {companyName} sees once approved</div>
            <PlanCard plan={{ ...form, price: offerTotal }} position={0} catalogue={catalogue} enterpriseTab />
            <OfferBreakdown limits={form} prices={prices} price={offerTotal} duration={form.duration as PaidDuration} catalogue={catalogue} />
          </div>
        ) : (
          <div className="card sub-ed-prev">
            <div className="sub-ed-prev-t">Preview</div>
            <PlanCard plan={form} position={0} catalogue={catalogue} />
          </div>
        )}
      </div>

      {isQuote && (
        <OfferEmailDialog open={emailOpen} companyName={companyName} defaultRecipients={plan?.company_admin_emails ?? NO_EMAILS}
          sending={saving} error={emailError} onClose={() => setEmailOpen(false)} onSend={sendOffer}
          preview={(
            <>
              <div className="sub-mail-hero"><small>CENTRIYON</small><b>Your Enterprise offer from Centriyon</b></div>
              <div className="sub-mail-body">
                Hello,<br />Centriyon made a plan for <b>{companyName}</b>, based on your request: <b>{form.name}</b> · {OFFER_LENGTHS.find((d) => d.key === form.duration)?.label}.
                <OfferBreakdown limits={form} prices={prices} price={offerTotal} duration={form.duration as PaidDuration} catalogue={catalogue} />
                <div className="sub-mail-reply">↩ Reply to this email to accept the offer or to ask for changes. Once Centriyon approves it, it will be on your Subscription page, ready to subscribe.</div>
              </div>
            </>
          )} />
      )}

      <FormDialog open={approveOpen} title="Approve the plan" onClose={() => setApproveOpen(false)}>
        <div className="card" style={{ padding: '20px 24px', maxWidth: 460, margin: '0 auto' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Approve this plan for {companyName}?</div>
          <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 4, lineHeight: 1.6 }}>
            {OFFER_LENGTHS.find((d) => d.key === form.duration)?.label} · <b>{dollars(offerTotal)}</b>.<br />
            It&apos;s published for {companyName} only. Their admin gets &quot;Your plan is ready&quot; and can subscribe on the Subscription page.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" className="btn bs" onClick={() => setApproveOpen(false)}>Back</button>
            <button type="button" className="btn sub-approve" disabled={saving} onClick={approveOffer}>Approve</button>
          </div>
        </div>
      </FormDialog>

      <FormDialog open={confirm !== null} title="Companies use this plan" onClose={() => setConfirm(null)}>
        {confirm && plan && (
          <div className="card" style={{ padding: '20px 24px', maxWidth: 520, margin: '0 auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {confirm.subscribers.length} {confirm.subscribers.length === 1 ? 'company is' : 'companies are'} on {plan.name}
            </div>
            <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 3 }}>
              {confirm.subscribers.map((s) => s.company_name ?? s.company_id).join(', ')}
            </div>
            <ChoiceBox checked={applyTo === 'everyone'} onPick={() => setApplyTo('everyone')}
              title={`Apply to everyone on ${plan.name}`} text="They get the new modules and limits now." />
            <ChoiceBox checked={applyTo === 'new'} onPick={() => setApplyTo('new')}
              title="Only for new subscriptions" text={`They keep the old ${plan.name} until they subscribe again.`} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn bs" onClick={() => setConfirm(null)}>Back</button>
              <button type="button" className="btn bp" disabled={saving}
                onClick={() => { const status = confirm.status; setConfirm(null); save(status, applyTo); }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </FormDialog>
    </div>
  );
}

function ChoiceBox({ checked, onPick, title, text }: { checked: boolean; onPick: () => void; title: string; text: string }) {
  return (
    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12, marginTop: 10, cursor: 'pointer', padding: '10px 12px', border: `1.5px solid ${checked ? '#4040C8' : '#E2E4F0'}`, borderRadius: 10 }}>
      <input type="radio" checked={checked} onChange={onPick} style={{ accentColor: '#4040C8', marginTop: 2 }} />
      <span><b>{title}</b><br /><span style={{ color: '#9BA3C4' }}>{text}</span></span>
    </label>
  );
}
