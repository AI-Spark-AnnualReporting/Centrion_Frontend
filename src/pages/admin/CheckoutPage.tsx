// Admin Console → Subscription → Payment (cloud only). Opened from a plan's
// Subscribe button with the checkout it started. Test mode: there's no payment
// gateway yet and Pay always succeeds; the plan is active straight away.
//
// One Idempotency-Key per visit: pressing Pay twice, or again after a lost
// answer, can never pay or activate twice.
//
// Plan: Centriton/.claude/plans/cloud-subscriptions.md

import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SUBSCRIPTION_PAGE, formatLicenseDate } from '@/components/license/LicenseBanner';
import { durationLabel, formatMoney } from '@/components/subscriptions/PlanFields';
import { useAuth } from '@/context/AuthContext';
import { subscriptions } from '@/lib/api';
import type { CompanySubscription } from '@/types/subscription';

const ROW = { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '8px 0', borderBottom: '1px solid #F2F3FA' } as const;
const MONO = { fontFamily: "'DM Mono', monospace" } as const;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { refreshPermissions } = useAuth();
  const state = useLocation().state as { checkout?: CompanySubscription; replaces?: string } | null;
  const paymentKey = useRef(crypto.randomUUID());
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  // Opened without a checkout (e.g. a refresh): start again from the plans.
  const checkout = state?.checkout;
  if (!checkout) return <Navigate to={SUBSCRIPTION_PAGE} replace />;

  const pay = async () => {
    setPaying(true);
    setError('');
    try {
      const paid = await subscriptions.pay(checkout.id, paymentKey.current);
      // The new plan's modules show without logging out.
      await refreshPermissions().catch(() => undefined);
      navigate(SUBSCRIPTION_PAGE, { state: { paid: paid.plan_name } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The payment did not go through.');
      setPaying(false);
    }
  };

  const periodName = durationLabel(checkout.billing_period);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ maxWidth: 480, width: '100%', margin: '0 auto' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Pay for {checkout.plan_name}</span>
          <span className="badge b-gy">{periodName}</span>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={ROW}><span>{checkout.plan_name} ({periodName.toLowerCase()})</span><b style={MONO}>{formatMoney(checkout.price)}</b></div>
          <div style={ROW}>
            <span>Period</span>
            <b style={MONO}>{formatLicenseDate(checkout.starts_at)} → {formatLicenseDate(checkout.ends_at)}</b>
          </div>
          {state?.replaces && <div style={ROW}><span>Replaces</span><b>{state.replaces} (ends today)</b></div>}
          <div style={{ ...ROW, borderBottom: 'none', fontSize: 14, fontWeight: 800 }}><span>Total</span><b style={MONO}>{formatMoney(checkout.price)}</b></div>
          <div style={{ fontSize: 11, color: '#B45309', background: 'rgba(245,158,11,.12)', borderRadius: 10, padding: '8px 11px', marginTop: 12 }}>
            Test mode — no payment gateway yet. &quot;Pay&quot; always succeeds. Report counts start again from 0; your people stay.
          </div>
          {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 10 }}>{error}</div>}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn bs" disabled={paying} onClick={() => navigate(SUBSCRIPTION_PAGE)}>Back</button>
            <button type="button" className="btn bp" disabled={paying} onClick={pay}>
              {paying ? 'Paying…' : `Pay ${formatMoney(checkout.price)}`}
            </button>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: '#5A6080', textAlign: 'center' }}>After paying, the new plan applies at once.</div>
    </div>
  );
}
