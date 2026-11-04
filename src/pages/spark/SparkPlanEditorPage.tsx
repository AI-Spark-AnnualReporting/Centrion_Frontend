// Spark admin → Subscriptions → Create / Edit a plan. One screen that never
// scrolls: a top card (name, duration, price, buttons) and side-by-side cards
// — Modules, Users, Departments, Preview. Enterprise swaps the middle cards for
// the contact details. Also opens a client's quote (a draft plan for that
// company) to check it, set the price and publish it.
//
// Editing the modules or limits of a plan companies are on asks first:
// "Apply to everyone" or "Only new subscriptions". A price change never asks.
//
// Routes: /spark/subscriptions/new, /spark/subscriptions/:planId/edit
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import { PlanCard } from '@/components/subscriptions/PlanCard';
import {
  ContactCard, DepartmentsCard, DURATIONS, EMPTY_LIMITS, ModulesCard, UsersCard, durationPer,
} from '@/components/subscriptions/PlanFields';
import { useToast } from '@/hooks/use-toast';
import { sparkPlans } from '@/lib/api';
import type { LicensableModule } from '@/types/license';
import type { Duration, PlanForm, PlanLimits, PlanStatus, PlanSubscriber, SubscriptionPlan } from '@/types/subscription';

export const SUBSCRIPTIONS_PAGE = '/spark/subscriptions';

const LIMIT_KEYS: (keyof PlanLimits)[] = ['modules', 'report_limits', 'max_pms', 'max_ir_users', 'department_sizes'];

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Report limits in one fixed order, so {a, b} and {b, a} compare equal. */
function sortedLimits(limits: Record<string, number>): [string, number][] {
  return Object.entries(limits).sort(([a], [b]) => a.localeCompare(b));
}

/** True if the form changes what subscriptions copy from the plan
 *  (modules, report limits, people, departments) — not the name or price. */
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
    max_pms: plan.max_pms,
    max_ir_users: plan.max_ir_users,
    // A plan made before department cards may have none; give it one to edit.
    department_sizes: plan.duration === 'enterprise' ? [] : plan.department_sizes,
  };
}

/** A price from its input: a number, or null when blank. */
function readPrice(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
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
  // Opened from Quotes: go back there afterwards.
  const backTo = (location.state as { back?: string } | null)?.back ?? SUBSCRIPTIONS_PAGE;

  const [plan, setPlan] = useState<SubscriptionPlan | undefined>(undefined);
  const [catalogue, setCatalogue] = useState<LicensableModule[]>([]);
  const [form, setForm] = useState<PlanForm>(() => formFromPlan());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Set = asking "Apply to everyone / Only new subscriptions" before saving.
  const [confirm, setConfirm] = useState<{ status: PlanStatus; subscribers: PlanSubscriber[] } | null>(null);
  const [applyTo, setApplyTo] = useState<'everyone' | 'new'>('new');

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
        setPlan(loaded);
        setForm(formFromPlan(loaded));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the plan.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [planId]);

  const isQuote = !!plan?.quote && plan.status === 'draft';
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

  const save = async (status: PlanStatus, apply?: 'everyone' | 'new') => {
    setSaving(true);
    setError('');
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
        if (!asked) setError(err.message);
        return;
      }
      setError(err instanceof Error ? err.message : 'Could not save the plan.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner pad={80} />;

  const setLimits = (next: PlanLimits) => setForm({ ...form, ...next });
  const changeDuration = (duration: Duration) => {
    // Coming back from Enterprise: start with one department card again.
    const department_sizes = duration !== 'enterprise' && form.department_sizes.length === 0 ? [1] : form.department_sizes;
    setForm({ ...form, duration, department_sizes });
  };
  const canSave = !saving && form.name.trim() !== '';

  return (
    <div className="sub-ed">
      <div className="card sub-ed-top">
        <label>
          Plan name
          <input className="inp" value={form.name} maxLength={120} placeholder="e.g. Standard"
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Duration
          <select className="inp" value={form.duration} onChange={(e) => changeDuration(e.target.value as Duration)}>
            {DURATIONS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        {enterprise ? <div /> : (
          <label>
            Price (USD) <span style={{ color: '#9BA3C4' }}>{durationPer(form.duration)}</span>
            <input className="inp" style={{ fontFamily: "'DM Mono', monospace" }} inputMode="decimal" placeholder="—"
              value={form.price ?? ''} onChange={(e) => setForm({ ...form, price: readPrice(e.target.value) })} />
          </label>
        )}
        <div className="sub-ed-btns">
          <button type="button" className="btn bs" onClick={() => navigate(backTo)}>Cancel</button>
          {!published && (
            <button type="button" className="btn bs" disabled={!canSave} onClick={() => save('draft')}>Save draft</button>
          )}
          <button type="button" className="btn bp" disabled={!canSave} onClick={() => save('published')}>
            {saving ? 'Saving…' : published ? 'Save' : isQuote ? `Publish for ${companyName}` : 'Publish'}
          </button>
        </div>
      </div>
      {error && <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: -6 }}>{error}</div>}
      {isQuote && plan?.quote?.note && (
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: -6 }}>Their note: “{plan.quote.note}”</div>
      )}

      <div className="sub-ed-cards">
        {enterprise ? (
          <ContactCard value={form.contact} onChange={(contact) => setForm({ ...form, contact })} />
        ) : (
          <>
            <ModulesCard value={form} catalogue={catalogue} onChange={setLimits} />
            <div className="sub-ed-col">
              <UsersCard value={form} onChange={setLimits} />
              <DepartmentsCard value={form} onChange={setLimits} />
            </div>
          </>
        )}
        <div className="card sub-ed-prev">
          <div className="sub-ed-prev-t">Preview</div>
          <PlanCard plan={form} position={0} catalogue={catalogue} />
        </div>
      </div>

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
