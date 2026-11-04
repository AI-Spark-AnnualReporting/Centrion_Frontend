// Admin Console → Subscription (cloud only). The plans this company can buy,
// as pricing cards: "Your plan" (green outline), "Made for you" (a plan
// Centriyon made from this company's quote). Buy now → the payment page.
// Enterprise → Contact us → the Get a quote popup.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import { DurationTabs, PlanCard, matchesDuration, type DurationFilter } from '@/components/subscriptions/PlanCard';
import { durationLabel } from '@/components/subscriptions/PlanFields';
import { QuoteForm } from '@/components/subscriptions/QuoteForm';
import { formatLicenseDate } from '@/components/license/LicenseBanner';
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

function newKey(): string {
  return crypto.randomUUID();
}

export default function SubscriptionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanForClient[]>([]);
  const [catalogue, setCatalogue] = useState<LicensableModule[]>([]);
  const [current, setCurrent] = useState<CurrentSubscription | null>(null);
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Set = the Contact us popup is open, with that Enterprise card's details.
  const [contactFor, setContactFor] = useState<{ contact: PlanContact | null } | null>(null);
  const [startingPlanId, setStartingPlanId] = useState<string | null>(null);

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

  const buy = async (plan: PlanForClient) => {
    setStartingPlanId(plan.id);
    try {
      const checkout = await subscriptions.startCheckout({ plan_id: plan.id }, newKey());
      const replaces = current?.status === 'active' ? current.subscription?.plan_name : undefined;
      navigate(CHECKOUT_PAGE, { state: { checkout, replaces } });
    } catch (e) {
      toast({ title: 'Could not start the payment', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setStartingPlanId(null);
    }
  };

  if (loading && !current) return <Spinner pad={80} />;

  const activePlanId = current?.status === 'active' ? current.subscription?.plan_id : undefined;
  // Their own plans first ("Made for you"), then the public ones; Enterprise last.
  const ordered = [...plans.filter((p) => p.made_for_you), ...plans.filter((p) => !p.made_for_you)]
    .filter((plan) => matchesDuration(plan, duration))
    .sort((a, b) => Number(a.duration === 'enterprise') - Number(b.duration === 'enterprise'));

  const buttonFor = (plan: PlanForClient) => {
    if (plan.duration === 'enterprise') {
      return <button type="button" className="sub-pc-buy" onClick={() => setContactFor({ contact: plan.contact })}>Contact us</button>;
    }
    if (plan.id === activePlanId) {
      return <button type="button" className="sub-pc-buy" disabled>Current · ends {formatLicenseDate(current?.subscription?.ends_at ?? null)}</button>;
    }
    return (
      <button type="button" className="sub-pc-buy" disabled={startingPlanId === plan.id || plan.price == null} onClick={() => buy(plan)}>
        {startingPlanId === plan.id ? 'Starting…' : 'Buy now'}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
            catalogue={catalogue}
            contact={contactFor.contact}
            startFrom={current?.subscription ?? undefined}
            onCancel={() => setContactFor(null)}
            onSent={() => {
              setContactFor(null);
              toast({ title: 'Request sent — Centriyon will send you a price' });
            }}
          />
        )}
      </FormDialog>

      <div className="sub-stage">
        <div className="sub-stage-title">Choose the plan that fits your company</div>
        {ordered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#fff', fontSize: 12, padding: '30px 0 90px' }}>
            No plans are available yet. Please check back soon.
          </div>
        ) : (
          <div className="sub-cards">
            {ordered.map((plan, index) => {
              const isCurrent = plan.id === activePlanId;
              const flag = isCurrent ? <span className="badge b-gn">Your plan</span>
                : plan.made_for_you ? <span className="badge b-am">Made for you</span> : undefined;
              return (
                <PlanCard key={plan.id} plan={plan} position={index} catalogue={catalogue}
                  flag={flag} current={isCurrent} button={buttonFor(plan)} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
