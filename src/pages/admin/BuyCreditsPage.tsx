// Admin Console → Usage → Buy credits (cloud, company admin). Spark's packs as
// tiles (the same for every cloud client), a summary, and Pay. Paying starts a
// checkout for the picked pack by id (the server takes the price from Spark's
// list) and pays it in test mode, then goes back to Usage.
//
// Route: /admin-console/usage/buy-credits · Plan: Centriton/.claude/plans/admin-usage-page.md

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { formatLicenseDate } from '@/components/license/LicenseBanner';
import {
  formatCredits, formatDollars, packSavingPercent, pricePerCredit,
} from '@/components/ai-credits/creditFormat';
import { useToast } from '@/hooks/use-toast';
import { aiCredits } from '@/lib/api';
import type { AiCreditsSummary, CreditPack } from '@/types/ai-credits';

const USAGE_PAGE = '/admin-console/usage';

/** The small line under a tile: "$50.00 · $0.100 a credit" or "$90.00 · save 10%". */
export function packTileLine(pack: CreditPack, packs: CreditPack[]): string {
  const saving = packSavingPercent(pack, packs);
  const second = saving > 0 ? `save ${saving}%` : `${formatDollars(pricePerCredit(pack), 3)} a credit`;
  return `${formatDollars(pack.price)} · ${second}`;
}

export default function BuyCreditsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<AiCreditsSummary | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    aiCredits.summary()
      .then((next) => {
        setSummary(next);
        const packs = next.subscription?.credit_packs ?? [];
        setPickedId(packs.length > 0 ? packs[0].id : null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load the packs.'));
  }, []);

  /** Start the checkout for the picked pack and pay it (test mode). One key
   *  per click, so a repeated click or a retry never buys twice. */
  const pay = async (pack: CreditPack) => {
    setPaying(true);
    setError('');
    try {
      const checkout = await aiCredits.startPackCheckout(crypto.randomUUID(), pack.id);
      const paid = await aiCredits.payPack(checkout.id, crypto.randomUUID());
      toast({ title: `Added ${formatCredits(paid.credits)} AI credits` });
      navigate(USAGE_PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not buy the credits.');
    } finally {
      setPaying(false);
    }
  };

  if (!summary && !error) return <Spinner pad={80} />;

  const period = summary?.subscription ?? null;
  const packs = period?.credit_packs ?? [];
  const picked = packs.find((pack) => pack.id === pickedId) ?? null;
  return (
    <div className="card" style={{ padding: 24, maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Link to={USAGE_PAGE} style={{ fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>← Back to Usage</Link>
        <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>Buy AI credits</div>
        <div style={{ fontSize: 12, color: '#9BA3C4' }}>Pick a pack. Bigger packs can cost less per credit.</div>
      </div>

      {error && <div role="alert" style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
      {summary && !period && (
        <div style={{ fontSize: 13, color: '#5A6080' }}>You need an active plan to buy AI credits.</div>
      )}
      {period && packs.length === 0 && (
        <div style={{ fontSize: 13, color: '#5A6080' }}>Extra credits aren&apos;t on sale yet. Contact Centriyon.</div>
      )}

      {period && packs.length > 0 && (
        <>
          <div role="radiogroup" aria-label="Credit packs"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {packs.map((pack) => {
              const on = pack.id === pickedId;
              return (
                <button key={pack.id} type="button" role="radio" aria-checked={on} onClick={() => setPickedId(pack.id)}
                  style={{ textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer', minHeight: 76,
                    fontFamily: 'inherit', color: '#1A1D2E',
                    background: on ? '#EEF0FF' : '#FAFBFE', border: on ? '2px solid #4040C8' : '2px solid #ECEEF8' }}>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{formatCredits(pack.credits)} credits</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#5A6080', marginTop: 6 }}>{packTileLine(pack, packs)}</span>
                </button>
              );
            })}
          </div>

          <div style={{ fontSize: 12, lineHeight: 1.5, color: '#5A6080', border: '2px solid #ECEEF8', borderRadius: 12, padding: '10px 16px' }}>
            Credits count straight away and end with this period on {formatLicenseDate(period.period.ends_at)}.
            Unused credits don&apos;t carry over.
            {period.balance.balance < 0 && <> The {formatCredits(-period.balance.balance)} below zero comes off them.</>}
          </div>

          {picked && (
            <div style={{ background: '#FAFBFE', border: '2px solid #FAFBFE', borderRadius: 12, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <SummaryLine label="AI credits" value={formatCredits(picked.credits)} />
              <SummaryLine label="Price per credit" value={formatDollars(pricePerCredit(picked), 3)} />
              <SummaryLine label="Balance after buying"
                value={`${formatCredits(period.balance.balance + picked.credits)} credits`} />
              <div style={{ height: 1, background: '#ECEEF8' }} />
              <SummaryLine label="Total due" value={formatDollars(picked.price)} strong />
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#9BA3C4' }}>Test mode: no real payment is taken.</span>
            <span style={{ display: 'flex', gap: 8 }}>
              <Link to={USAGE_PAGE} className="btn bs" style={{ textDecoration: 'none' }}>Cancel</Link>
              <button type="button" className="btn bp" disabled={!picked || paying} onClick={() => picked && pay(picked)}>
                {paying ? 'Paying…' : `Pay ${picked ? formatDollars(picked.price) : ''} now`}
              </button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: strong ? 800 : 500,
      fontSize: strong ? 15 : 13, color: strong ? '#1A1D2E' : '#5A6080' }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}
