// Admin Console → Subscription → Payment (cloud only). Opened from a plan's
// Buy now with the checkout it started. Layout from the approved mockup
// (checkout-mockup.html): steps on top; left, what's being bought (plan,
// period timeline, what you get, and — when switching — the old plan and the
// modules the admin confirmed giving up); right, the total, a test card and
// Pay. After paying, a branded "plan is active" popup.
//
// Test mode: there's no payment gateway yet and Pay always succeeds. One
// Idempotency-Key per visit: pressing Pay twice, or again after a lost
// answer, can never pay or activate twice.
//
// Plans: Centriton/.claude/plans/cloud-subscriptions.md, cloud-subscriptions-v2-redesign.md

import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SUBSCRIPTION_PAGE, formatLicenseDate } from '@/components/license/LicenseBanner';
import { ErrorPopup } from '@/components/shared/ErrorPopup';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import { durationLabel, durationPer, formatMoney } from '@/components/subscriptions/PlanFields';
import { useAuth } from '@/context/AuthContext';
import { subscriptions } from '@/lib/api';
import type { LicensableModule } from '@/types/license';
import type { CompanySubscription, PaidDuration } from '@/types/subscription';
import '@/components/subscriptions/subscriptions.css';

const PERIOD_LENGTH: Record<PaidDuration, string> = { quarterly: '3 months', half_year: '6 months', yearly: '1 year' };
const CONFETTI_COLOURS = ['#4040C8', '#14B8A6', '#F59E0B', '#4F7BE8', '#16A34A'];

type CheckoutState = {
  checkout?: CompanySubscription;
  replaces?: string;
  switchedOff?: string[];          // modules the admin confirmed giving up (labels)
  catalogue?: LicensableModule[];  // for the module names
} | null;

/** "ESG Validator · 3 reports" for each module in the plan, in catalogue order. */
export function moduleChips(checkout: CompanySubscription, catalogue: LicensableModule[]): string[] {
  const chips: string[] = [];
  for (const module of catalogue) {
    if (!checkout.modules.includes(module.key)) continue;
    const reports = module.report_type ? checkout.report_limits[module.report_type] : undefined;
    chips.push(reports != null ? `${module.label} · ${reports} report${reports === 1 ? '' : 's'}` : module.label);
  }
  // A module the catalogue doesn't list (shouldn't happen) still shows by key.
  for (const key of checkout.modules) {
    if (!catalogue.some((m) => m.key === key)) chips.push(key);
  }
  return chips;
}

const LOGO = (
  <svg width="34" height="34" viewBox="0 0 14 14" aria-hidden="true">
    <rect x=".5" y=".5" width="5.5" height="5.5" rx="1" fill="white" />
    <rect x="8" y=".5" width="5.5" height="5.5" rx="1" fill="white" opacity=".45" />
    <rect x=".5" y="8" width="5.5" height="5.5" rx="1" fill="white" opacity=".45" />
    <rect x="8" y="8" width="5.5" height="5.5" rx="1" fill="white" />
  </svg>
);

function Steps() {
  return (
    <div className="sub-co-steps" aria-label="Steps">
      <div className="sub-co-step done"><span className="n">✓</span>Choose plan</div>
      <div className="sub-co-bar done" />
      <div className="sub-co-step now" aria-current="step"><span className="n">2</span>Payment</div>
      <div className="sub-co-bar" />
      <div className="sub-co-step"><span className="n">3</span>Active</div>
    </div>
  );
}

function Success({ checkout, onDone }: { checkout: CompanySubscription; onDone: () => void }) {
  const confetti = [];
  for (let i = 0; i < 26; i++) {
    confetti.push(
      <i key={i} style={{ left: `${(i * 37) % 100}%`, background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length], animationDelay: `${(i % 7) * 0.07}s` }} />,
    );
  }
  return (
    <div className="card sub-co-success">
      <div className="sub-co-confetti" aria-hidden="true">{confetti}</div>
      <div className="sub-co-logo">{LOGO}</div>
      <div className="sub-co-tick" aria-hidden="true">✓</div>
      <h2>{checkout.plan_name} is active</h2>
      <p>
        Your plan runs from <b>{formatLicenseDate(checkout.starts_at)}</b> to <b>{formatLicenseDate(checkout.ends_at)}</b>.
        <br />Your modules are switched on now.
      </p>
      <button type="button" className="btn bp" style={{ marginTop: 18, padding: '10px 22px' }} onClick={onDone}>
        Go to my subscription
      </button>
    </div>
  );
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user, refreshPermissions } = useAuth();
  const state = useLocation().state as CheckoutState;
  const paymentKey = useRef(crypto.randomUUID());
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState<CompanySubscription | null>(null);

  // Opened without a checkout (e.g. a refresh): start again from the plans.
  const checkout = state?.checkout;
  if (!checkout) return <Navigate to={SUBSCRIPTION_PAGE} replace />;

  const pay = async () => {
    setPaying(true);
    setError('');
    try {
      const result = await subscriptions.pay(checkout.id, paymentKey.current);
      // The new plan's modules show without logging out.
      await refreshPermissions().catch(() => undefined);
      setPaid(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The payment did not go through.');
    } finally {
      setPaying(false);
    }
  };

  const chips = moduleChips(checkout, state?.catalogue ?? []);
  const switchedOff = state?.switchedOff ?? [];
  const price = formatMoney(checkout.price);
  const priceCents = `$${Number(checkout.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      <Steps />
      <div className="sub-co-wrap">
        {/* What you're buying */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="sub-co-hero">
            <div className="sub-co-hero-k">You&apos;re buying</div>
            <div className="sub-co-hero-n">{checkout.plan_name} <span className="sub-co-pill">{durationLabel(checkout.billing_period)}</span></div>
            <div className="sub-co-hero-p"><b>{price}</b><span>{durationPer(checkout.billing_period)}</span></div>
          </div>

          <div className="sub-co-sec" style={{ borderTop: 'none' }}>
            <div className="sub-co-sec-t">Period</div>
            <div className="sub-co-tl">
              <div className="sub-co-tl-d"><b>{formatLicenseDate(checkout.starts_at)}</b><span>starts today</span></div>
              <div className="sub-co-tl-line"><span>{PERIOD_LENGTH[checkout.billing_period]}</span></div>
              <div className="sub-co-tl-d"><b>{formatLicenseDate(checkout.ends_at)}</b><span>ends</span></div>
            </div>
          </div>

          <div className="sub-co-sec">
            <div className="sub-co-sec-t">What you get</div>
            <div className="sub-co-chips">
              {chips.map((chip) => <span key={chip} className="sub-co-chip">✓ {chip}</span>)}
            </div>
            <div className="sub-co-people">
              <div className="sub-co-pbox"><b>{checkout.max_users}</b><span>users (admin included)</span></div>
            </div>
          </div>

          {state?.replaces && (
            <div className="sub-co-sec">
              <div className="sub-co-sec-t">Changing plan</div>
              <div className="sub-co-swap">
                <span className="old">{state.replaces}</span><span className="arrow">→</span>
                <span className="new">{checkout.plan_name}</span>
                <span style={{ color: '#9BA3C4' }}>· {state.replaces} ends today</span>
              </div>
              {switchedOff.length > 0 && (
                <>
                  <div className="sub-co-confirmed">
                    <span aria-hidden="true">⚠</span>
                    <span>
                      <b>Switched off (you confirmed):</b> {switchedOff.join(', ')}. Your existing reports stay open and downloadable.
                    </span>
                  </div>
                  <div className="sub-co-chips" style={{ marginTop: 8 }}>
                    {switchedOff.map((module) => <span key={module} className="sub-co-chip off">✗ {module}</span>)}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Pay */}
        <div className="card sub-co-pay">
          <div className="sub-co-pay-h">
            <div className="k">Total to pay</div>
            <div className="sub-co-total"><b>{price}</b><span>USD · one payment</span></div>
          </div>
          <div className="sub-co-lines">
            <div className="sub-co-ln"><span>{checkout.plan_name} · {durationLabel(checkout.billing_period).toLowerCase()}</span><b>{priceCents}</b></div>
            <div className="sub-co-ln"><span>Tax</span><b>$0.00</b></div>
            <div className="sub-co-ln sum"><span>Total</span><span>{priceCents}</span></div>
          </div>
          <div className="sub-co-card" aria-label="Test card">
            <span className="tag">TEST MODE</span>
            <div className="t">CENTRIYON · TEST CARD</div>
            <div className="num">4242 4242 4242 4242</div>
            <div className="row"><span>{user?.full_name ?? 'Card holder'}</span><span>12 / 30</span></div>
          </div>
          <div className="sub-co-tm">
            <span aria-hidden="true">ⓘ</span>
            <span>No payment gateway yet — &quot;Pay&quot; always succeeds. Report counts start again from 0; your people stay.</span>
          </div>
          <ErrorPopup open={error !== ''} title="The payment didn't go through" message={error} onClose={() => setError('')} />
          <div className="sub-co-pay-f">
            <button type="button" className="btn bp sub-co-pay-btn" disabled={paying || paid !== null} onClick={pay}>
              {paying ? 'Paying…' : `🔒 Pay ${price}`}
            </button>
            <button type="button" className="btn bs" disabled={paying} onClick={() => navigate(SUBSCRIPTION_PAGE)}>Back to plans</button>
            <div className="sub-co-secure">The new plan applies the moment you pay.</div>
          </div>
        </div>
      </div>

      <FormDialog open={paid !== null} title={`${checkout.plan_name} is active`} onClose={() => navigate(SUBSCRIPTION_PAGE)}>
        {paid && <Success checkout={paid} onDone={() => navigate(SUBSCRIPTION_PAGE)} />}
      </FormDialog>
    </div>
  );
}
