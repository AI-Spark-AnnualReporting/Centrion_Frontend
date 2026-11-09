// Admin Console → Subscription (cloud only). The plans this company can buy,
// as pricing cards: "Your plan" (green outline), "Made for you" (a plan
// Centriyon made from this company's request). Buy now → the payment page,
// unless the plan doesn't fit: a popup says it's too small for the team (can't
// buy) or lists the modules they'd lose (tick "I understand" to continue).
// Enterprise → Contact us → name, phone and message.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import { CardStrip, DurationTabs, PlanCard, matchesDuration, type DurationFilter } from '@/components/subscriptions/PlanCard';
import { durationLabel } from '@/components/subscriptions/PlanFields';
import { QuoteForm } from '@/components/subscriptions/QuoteForm';
import { formatLicenseDate } from '@/components/license/LicenseBanner';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { subscriptions } from '@/lib/api';
import type { LicensableModule } from '@/types/license';
import type { CurrentSubscription, PlanContact, PlanForClient } from '@/types/subscription';

export const CHECKOUT_PAGE = '/admin-console/subscription/checkout';

/** The sentence under the title: the plan now, or why there isn't one. */
export function currentPlanText(current: CurrentSubscription | null): string {
  const sub = current?.subscription;
  if (!current || !sub || current.status === 'none') return 'No subscription yet. Choose a plan below.';
  if (current.status === 'expired') return `Your ${sub.plan_name} subscription ended on ${formatLicenseDate(sub.ends_at)}. Choose a plan to continue.`;
  return `You're on ${sub.plan_name} (${durationLabel(sub.billing_period).toLowerCase()}) until ${formatLicenseDate(sub.ends_at)}.`;
}

/** Where a card goes: 0 = the plan they're on now, 1 = made for them,
 *  2 = everything else, 3 = Enterprise (always last). */
function planRank(plan: PlanForClient, activePlanId?: string): number {
  if (plan.duration === 'enterprise') return 3;
  if (plan.id === activePlanId) return 0;
  if (plan.made_for_you) return 1;
  return 2;
}

/** The cards in order: Your plan, Made for you, the rest (cheapest first), Enterprise. */
export function orderPlans(plans: PlanForClient[], activePlanId?: string): PlanForClient[] {
  return [...plans].sort((a, b) => {
    const byRank = planRank(a, activePlanId) - planRank(b, activePlanId);
    if (byRank !== 0) return byRank;
    return (a.price ?? 0) - (b.price ?? 0);
  });
}

function newKey(): string {
  return crypto.randomUUID();
}

// The popup Buy now opens when a plan doesn't fit as it is.
type PlanCheck = { kind: 'too_small' | 'lost_modules'; plan: PlanForClient } | null;


export default function SubscriptionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanForClient[]>([]);
  const [catalogue, setCatalogue] = useState<LicensableModule[]>([]);
  const [current, setCurrent] = useState<CurrentSubscription | null>(null);
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Set = the Contact us popup is open, with that Enterprise card's details.
  const [contactFor, setContactFor] = useState<{ planId: string; contact: PlanContact | null } | null>(null);
  const [startingPlanId, setStartingPlanId] = useState<string | null>(null);
  const [check, setCheck] = useState<PlanCheck>(null);
  const [understood, setUnderstood] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([subscriptions.plans(), subscriptions.current()])
      .then(([planList, now]) => {
        setPlans(planList.items);
        setCatalogue(planList.modules_catalogue);
        setCurrent(now);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load plans.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Back from the payment page: say it worked (once).
  const paidPlan = (location.state as { paid?: string } | null)?.paid;
  useEffect(() => {
    if (!paidPlan) return;
    toast({ title: `Paid — ${paidPlan} is active now` });
    navigate(location.pathname, { replace: true, state: null });
  }, [paidPlan, toast, navigate, location.pathname]);

  /** Buy now: a popup first if the plan doesn't fit, else straight to payment. */
  const buyNow = (plan: PlanForClient) => {
    if (plan.too_small.length > 0) {
      setCheck({ kind: 'too_small', plan });
      return;
    }
    if (plan.lost_modules.length > 0) {
      setUnderstood(false);
      setCheck({ kind: 'lost_modules', plan });
      return;
    }
    startPayment(plan, false);
  };

  const startPayment = async (plan: PlanForClient, acceptLostModules: boolean) => {
    setStartingPlanId(plan.id);
    try {
      const body = acceptLostModules ? { plan_id: plan.id, accept_lost_modules: true } : { plan_id: plan.id };
      const checkout = await subscriptions.startCheckout(body, newKey());
      const replaces = current?.status === 'active' ? current.subscription?.plan_name : undefined;
      navigate(CHECKOUT_PAGE, { state: { checkout, replaces, switchedOff: plan.lost_modules, catalogue } });
    } catch (e) {
      toast({ title: 'Could not start the payment', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setStartingPlanId(null);
    }
  };

  if (loading && !current) return <Spinner pad={80} />;

  const activePlanId = current?.status === 'active' ? current.subscription?.plan_id : undefined;
  const ordered = orderPlans(plans.filter((plan) => matchesDuration(plan, duration)), activePlanId);

  const buttonFor = (plan: PlanForClient) => {
    if (plan.duration === 'enterprise') {
      return <button type="button" className="sub-pc-buy" onClick={() => setContactFor({ planId: plan.id, contact: plan.contact })}>Contact us</button>;
    }
    if (plan.id === activePlanId) {
      return <button type="button" className="sub-pc-buy" disabled>Current · ends {formatLicenseDate(current?.subscription?.ends_at ?? null)}</button>;
    }
    return (
      <button type="button" className="sub-pc-buy" disabled={startingPlanId === plan.id || plan.price == null} onClick={() => buyNow(plan)}>
        {startingPlanId === plan.id ? 'Starting…' : 'Buy now'}
      </button>
    );
  };

  return (
    <div className="sub-fit">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Subscription</div>
          <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>{currentPlanText(current)}</div>

        </div>
        <DurationTabs value={duration} onChange={setDuration} />
      </div>

      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      <FormDialog open={contactFor !== null} title="Contact us — Enterprise" onClose={() => setContactFor(null)}>
        {contactFor && (
          <QuoteForm
            enterprisePlanId={contactFor.planId}
            contact={contactFor.contact}
            defaultName={user?.full_name ?? ''}
            onClose={() => setContactFor(null)}
            onSent={() => undefined}
          />
        )}
      </FormDialog>

      <FormDialog open={check !== null} title="Changing plan" onClose={() => setCheck(null)}>
        {check?.kind === 'too_small' && (
          <div className="card" style={{ padding: '22px 24px', maxWidth: 460, margin: '0 auto' }}>
            <div className="sub-m-ic block">!</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{check.plan.name} is too small for your team</div>
            <div style={{ fontSize: 12, color: '#5A6080', marginTop: 4, lineHeight: 1.6 }}>
              You can&apos;t switch to {check.plan.name} while you have more people than it allows. Remove users or departments first, or choose a bigger plan.
            </div>
            <ul className="sub-reasons block">{check.plan.too_small.map((reason) => <li key={reason}>• {reason}</li>)}</ul>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 14, borderTop: '1px solid #ECEEF8' }}>
              <button type="button" className="btn bp" onClick={() => setCheck(null)}>Close</button>
            </div>
          </div>
        )}
        {check?.kind === 'lost_modules' && (
          <div className="card" style={{ padding: '22px 24px', maxWidth: 460, margin: '0 auto' }}>
            <div className="sub-m-ic warn">⚠</div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {check.plan.name} doesn&apos;t include {check.plan.lost_modules.length === 1 ? 'a module' : `${check.plan.lost_modules.length} modules`} you have now
            </div>
            <div style={{ fontSize: 12, color: '#5A6080', marginTop: 4, lineHeight: 1.6 }}>
              Your existing reports stay open and downloadable, but you can&apos;t create new ones in {check.plan.lost_modules.length === 1 ? 'it' : 'them'} on {check.plan.name}.
            </div>
            <ul className="sub-reasons warn">{check.plan.lost_modules.map((module) => <li key={module}>• {module}</li>)}</ul>
            <label className={`sub-agree ${understood ? 'on' : ''}`}>
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
              <span>I understand that <b>{check.plan.lost_modules.join(', ')}</b> will be switched off when {check.plan.name} starts.</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid #ECEEF8' }}>
              <button type="button" className="btn bs" onClick={() => setCheck(null)}>Cancel</button>
              <button type="button" className="btn bp" disabled={!understood || startingPlanId === check.plan.id}
                onClick={() => { const plan = check.plan; setCheck(null); startPayment(plan, true); }}>
                Continue to payment
              </button>
            </div>
          </div>
        )}
      </FormDialog>

      <div className="sub-stage">
        <div className="sub-stage-title">Choose the plan that fits your company</div>
        {ordered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#fff', fontSize: 12, padding: '30px 0 90px' }}>
            No plans are available yet. Please check back soon.
          </div>
        ) : (
          <CardStrip>
            {ordered.map((plan, index) => {
              const isCurrent = plan.id === activePlanId;
              const flag = isCurrent ? <span className="badge b-gn">Your plan</span>
                : plan.made_for_you ? <span className="badge b-am">Made for you</span> : undefined;
              return (
                <PlanCard key={plan.id} plan={plan} position={index} catalogue={catalogue}
                  flag={flag} current={isCurrent} button={buttonFor(plan)} />
              );
            })}
          </CardStrip>
        )}
      </div>
    </div>
  );
}
