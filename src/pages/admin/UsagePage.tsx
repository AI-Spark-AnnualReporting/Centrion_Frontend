// Admin Console → Usage (cloud, company admin). Four parts, top to bottom:
//   1. Plan: the subscription card that used to sit on the Admin Console
//      overview (plan, limits, modules, Change plan).
//   2. AI credits: what's left (below zero in red), where they came from, what
//      used them, and Buy credits (opens the Buy credits screen).
//   3. Payment: card buttons shown greyed out — card payments are coming
//      later; payments are test mode today.
//   4. Invoices: every paid plan and paid credit pack, newest first, in pages.
//
// Route: /admin-console/usage · Plan: Centriton/.claude/plans/admin-usage-page.md

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { LicenseCard } from '@/components/license/LicenseCard';
import { formatLicenseDate } from '@/components/license/LicenseBanner';
import {
  actionName, formatCredits, formatCreditsDetail, formatDollars, formatPaidDate,
} from '@/components/ai-credits/creditFormat';
import { aiCredits } from '@/lib/api';
import type { AiCreditsSummary, InvoicePage } from '@/types/ai-credits';

export const BUY_CREDITS_PAGE = '/admin-console/usage/buy-credits';
const INVOICES_PER_PAGE = 20;

/** The sentence under the balance. */
export function balanceText(balance: number, total: number): string {
  if (balance < 0) return `${formatCredits(-balance)} credits below zero — AI is paused until you buy more.`;
  if (balance === 0) return 'No credits left — AI is paused until you buy more.';
  return `${formatCredits(balance)} of ${formatCredits(total)} credits left this period.`;
}

/** How full the credits bar is, 0–100 (0 when below zero). */
export function creditsLeftPercent(balance: number, total: number): number {
  if (total <= 0 || balance <= 0) return 0;
  return Math.min(100, Math.round((balance / total) * 100));
}

export default function UsagePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1040 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Usage</div>
        <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
          Your plan, your AI credits, payment and invoices.
        </div>
      </div>
      <LicenseCard />
      <CreditsSection />
      <PaymentSection />
      <InvoicesSection />
    </div>
  );
}

// ── 2. AI credits ───────────────────────────────────────────────────

function CreditsSection() {
  const [summary, setSummary] = useState<AiCreditsSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    aiCredits.summary()
      .then((next) => { setSummary(next); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load AI credits.'));
  }, []);

  if (error) return <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>;
  if (!summary) return <Spinner pad={30} />;

  const period = summary.subscription;
  if (!period) {
    return (
      <Section title="AI credits">
        <div style={{ fontSize: 12, color: '#9BA3C4' }}>
          No active plan, so there are no AI credits. Choose a plan on the Subscription page.
        </div>
      </Section>
    );
  }

  const { balance } = period;
  const percent = creditsLeftPercent(balance.balance, balance.total);
  const canBuy = period.credit_packs.length > 0;
  return (
    <Section title="AI credits"
      line={`This period: ${formatLicenseDate(period.period.starts_at)} – ${formatLicenseDate(period.period.ends_at)}. Unused credits don't carry over.`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, color: balance.balance <= 0 ? '#DC2626' : '#1A1D2E' }}>
            {formatCredits(balance.balance)}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#9BA3C4' }}> credits left of {formatCredits(balance.total)}</span>
          </div>
          <div style={{ fontSize: 12, color: balance.low || balance.balance <= 0 ? '#B45309' : '#9BA3C4' }}>
            {balanceText(balance.balance, balance.total)}
          </div>
        </div>
        {canBuy ? (
          <Link to={BUY_CREDITS_PAGE} className="btn bp" style={{ textDecoration: 'none' }}>Buy credits</Link>
        ) : (
          <span style={{ fontSize: 12, color: '#9BA3C4' }}>Extra credits aren&apos;t on sale yet. Contact Centriyon.</span>
        )}
      </div>
      <div role="progressbar" aria-label="AI credits left" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}
        style={{ height: 8, borderRadius: 8, background: '#ECEEF8', marginTop: 12, overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: balance.low ? '#D97706' : '#4040C8' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 14 }}>
        <Figure title="Included in your plan" value={formatCredits(balance.included)} />
        <Figure title="Bought this period" value={formatCredits(balance.packs)} />
        {balance.carried < 0 && <Figure title="Minus from last period" value={formatCredits(balance.carried)} />}
        <Figure title="Used this period" value={formatCreditsDetail(balance.used)} />
      </div>

      <div style={{ fontSize: 12, fontWeight: 800, margin: '18px 0 6px' }}>What used them</div>
      <table className="utable">
        <thead>
          <tr><th>Feature</th><th style={{ textAlign: 'right' }}>Times used</th><th style={{ textAlign: 'right' }}>Credits</th></tr>
        </thead>
        <tbody>
          {period.by_action.length === 0 && (
            <tr className="urow"><td colSpan={3} style={{ color: '#9BA3C4' }}>No AI used yet this period.</td></tr>
          )}
          {period.by_action.map((row) => (
            <tr key={row.action} className="urow">
              <td><b>{actionName(row.action)}</b></td>
              <td style={{ textAlign: 'right' }}>{row.jobs}</td>
              <td style={{ textAlign: 'right' }}>{formatCreditsDetail(row.credits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

// ── 3. Payment (coming soon) ────────────────────────────────────────

function PaymentSection() {
  return (
    <Section title="Payment" line="Add a backup card in case your default card is declined.">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#5A6080' }}>No card yet</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn bs" disabled>Update</button>
          <button type="button" className="btn bs" disabled>Add payment method</button>
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 10 }}>
        Card payments are coming soon. Test mode today: no card is charged.
      </div>
    </Section>
  );
}

// ── 4. Invoices ─────────────────────────────────────────────────────

function InvoicesSection() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<InvoicePage | null>(null);
  const [error, setError] = useState('');

  const load = useCallback((pageNumber: number) => {
    aiCredits.invoices(pageNumber, INVOICES_PER_PAGE)
      .then((next) => { setData(next); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invoices.'));
  }, []);

  useEffect(() => load(page), [load, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <Section title="Invoices">
      {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
      {!data && !error && <Spinner pad={20} />}
      {data && (
        <>
          <table className="utable">
            <thead>
              <tr><th>Date</th><th>What</th><th style={{ textAlign: 'right' }}>Total</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.items.length === 0 && (
                <tr className="urow"><td colSpan={4} style={{ color: '#9BA3C4' }}>No invoices yet.</td></tr>
              )}
              {data.items.map((invoice) => (
                <tr key={`${invoice.kind}-${invoice.id}`} className="urow">
                  <td>{formatPaidDate(invoice.paid_at)}</td>
                  <td>{invoice.description}</td>
                  <td style={{ textAlign: 'right' }}>{formatDollars(invoice.total)}</td>
                  <td><span className="badge b-gn">Paid</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12 }}>
              <button type="button" className="btn bs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {pages}</span>
              <button type="button" className="btn bs" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ── Small pieces ────────────────────────────────────────────────────

function Section({ title, line, children }: { title: string; line?: string; children: ReactNode }) {
  return (
    <section className="card" aria-label={title} style={{ padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
      {line && <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2, marginBottom: 10 }}>{line}</div>}
      {!line && <div style={{ marginBottom: 10 }} />}
      {children}
    </section>
  );
}

function Figure({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ background: '#FAFBFE', border: '1px solid #ECEEF8', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>{title}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
