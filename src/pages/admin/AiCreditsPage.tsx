// Admin Console → AI credits (cloud, company admin). This period's AI
// credits: what's left (below zero in red), where they came from, what used
// them, the packs bought, and Buy more (test-mode payment, like plans).
//
// The rules: a job starts while the balance is above zero (and at least the
// action's minimum); the real cost is taken after. Below zero, AI stops until
// more credits are bought; the minus comes off them.
//
// Route: /admin-console/ai-credits · Plan: Centriton/.claude/plans/ai-credits.md

import { useCallback, useEffect, useState } from 'react';
import { ErrorPopup } from '@/components/shared/ErrorPopup';
import { Spinner } from '@/components/shared/Spinner';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import { formatLicenseDate } from '@/components/license/LicenseBanner';
import { actionName, formatCredits, formatDollars } from '@/components/ai-credits/creditFormat';
import { useToast } from '@/hooks/use-toast';
import { aiCredits } from '@/lib/api';
import type { AiCreditsSummary, CreditPack } from '@/types/ai-credits';

/** The sentence under the balance. */
export function balanceText(balance: number, total: number): string {
  if (balance < 0) return `${formatCredits(-balance)} credits below zero — AI is paused until you buy more.`;
  if (balance === 0) return 'No credits left — AI is paused until you buy more.';
  return `${formatCredits(balance)} of ${formatCredits(total)} credits left this period.`;
}

export default function AiCreditsPage() {
  const { toast } = useToast();
  const [summary, setSummary] = useState<AiCreditsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buyError, setBuyError] = useState('');
  const [confirmPack, setConfirmPack] = useState<CreditPack | null>(null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    aiCredits.summary()
      .then((next) => { setSummary(next); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load AI credits.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  /** Start the pack checkout and pay it (test mode). One key per click, so a
   *  repeated click or a retry never buys twice. */
  const buy = async () => {
    setBuying(true);
    try {
      const checkout = await aiCredits.startPackCheckout(crypto.randomUUID());
      const paid = await aiCredits.payPack(checkout.id, crypto.randomUUID());
      setConfirmPack(null);
      toast({ title: `Added ${formatCredits(paid.credits)} AI credits` });
      load();
    } catch (e) {
      setConfirmPack(null);
      setBuyError(e instanceof Error ? e.message : 'Could not buy the credits.');
    } finally {
      setBuying(false);
    }
  };

  if (loading && !summary) return <Spinner pad={80} />;

  const period = summary?.subscription;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>AI credits</div>
        <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
          {period
            ? `This period: ${formatLicenseDate(period.period.starts_at)} – ${formatLicenseDate(period.period.ends_at)}. Unused credits don't carry over.`
            : 'No active plan, so there are no AI credits. Choose a plan on the Subscription page.'}
        </div>
      </div>
      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}
      <ErrorPopup open={!!buyError} title="Couldn't buy credits" message={buyError} onClose={() => setBuyError('')} />

      {period && (
        <>
          <div className="card" style={{ padding: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#5A6080' }}>Credits left</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: period.balance.balance <= 0 ? '#DC2626' : '#1A1D2E' }}>
                {formatCredits(period.balance.balance)}
              </div>
              <div style={{ fontSize: 12, color: period.balance.low || period.balance.balance <= 0 ? '#B45309' : '#9BA3C4' }}>
                {balanceText(period.balance.balance, period.balance.total)}
              </div>
            </div>
            {period.credit_pack ? (
              <button type="button" className="btn bp" onClick={() => setConfirmPack(period.credit_pack)}>
                Buy {formatCredits(period.credit_pack.size)} credits · {formatDollars(period.credit_pack.price)}
              </button>
            ) : (
              <span style={{ fontSize: 12, color: '#9BA3C4' }}>Your plan doesn&apos;t sell extra credits. Contact Centriyon for more.</span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <Figure title="Included in your plan" value={formatCredits(period.balance.included)} />
            <Figure title="Bought this period" value={formatCredits(period.balance.packs)} />
            {period.balance.carried < 0 && <Figure title="Minus from last period" value={formatCredits(period.balance.carried)} />}
            <Figure title="Used this period" value={formatCredits(period.balance.used)} />
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 800 }}>What used them</div>
            <table className="utable" style={{ width: '100%', fontSize: 12 }}>
              <thead><tr><th>Feature</th><th>Times used</th><th>Credits</th></tr></thead>
              <tbody>
                {period.by_action.length === 0 && (
                  <tr><td colSpan={3} style={{ color: '#9BA3C4' }}>No AI used yet this period.</td></tr>
                )}
                {period.by_action.map((row) => (
                  <tr key={row.action}>
                    <td><b>{actionName(row.action)}</b></td>
                    <td>{row.jobs}</td>
                    <td>{formatCredits(row.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {period.packs.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 800 }}>Packs bought</div>
              <table className="utable" style={{ width: '100%', fontSize: 12 }}>
                <thead><tr><th>Date</th><th>Credits</th><th>Price</th></tr></thead>
                <tbody>
                  {period.packs.map((pack) => (
                    <tr key={pack.id}>
                      <td>{formatLicenseDate(pack.paid_at)}</td>
                      <td>{formatCredits(pack.credits)}</td>
                      <td>{formatDollars(pack.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <FormDialog open={confirmPack !== null} title="Buy AI credits" onClose={() => setConfirmPack(null)}>
        {confirmPack && (
          <div className="card" style={{ padding: '20px 24px', maxWidth: 440, margin: '0 auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              Buy {formatCredits(confirmPack.size)} AI credits for {formatDollars(confirmPack.price)}?
            </div>
            <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6, lineHeight: 1.6 }}>
              They count straight away and end with this period.
              {period && period.balance.balance < 0 && <> The {formatCredits(-period.balance.balance)} below zero comes off them.</>}
              <br /><span style={{ color: '#9BA3C4' }}>Test mode: no real payment is taken.</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" className="btn bs" onClick={() => setConfirmPack(null)}>Cancel</button>
              <button type="button" className="btn bp" disabled={buying} onClick={buy}>{buying ? 'Paying…' : 'Pay'}</button>
            </div>
          </div>
        )}
      </FormDialog>
    </div>
  );
}

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
