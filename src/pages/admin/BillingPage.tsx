// Admin Console → Settings → Billing (cloud, company admin). Two parts:
//   1. Payment: card buttons shown greyed out — card payments are coming
//      later; payments are test mode today.
//   2. Invoices: every paid plan and paid credit pack, newest first, in pages.
// Moved here from the Usage page unchanged.
//
// Route: /admin-console/billing · Plan: Centrion_Frontend/.claude/plans/admin-settings-tabs.md

import { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { SettingsTabs } from '@/components/admin/SettingsTabs';
import { formatDollars, formatPaidDate } from '@/components/ai-credits/creditFormat';
import { aiCredits } from '@/lib/api';
import { PAGE_SIZES, Pager } from '@/pages/spark/SparkLicensesPage';
import { Section } from '@/pages/admin/UsagePage';
import type { InvoicePage } from '@/types/ai-credits';

export default function BillingPage() {
  return (
    // One screen, full width, no page scrolling (AppLayout's fit pages): the
    // Invoices card fills the rest of the height and its rows scroll inside it.
    <div className="sub-fit" style={{ gap: 18 }}>
      <SettingsTabs />
      <PaymentSection />
      <InvoicesSection />
    </div>
  );
}

// ── 1. Payment (coming soon) ────────────────────────────────────────

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

// ── 2. Invoices ─────────────────────────────────────────────────────

function InvoicesSection() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);      // 10 rows at first
  const [data, setData] = useState<InvoicePage | null>(null);
  const [error, setError] = useState('');

  const load = useCallback((pageNumber: number, size: number) => {
    aiCredits.invoices(pageNumber, size)
      .then((next) => { setData(next); setError(''); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load invoices.'));
  }, []);

  useEffect(() => load(page, pageSize), [load, page, pageSize]);

  /** A new page size starts again from page 1. */
  const changePageSize = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  return (
    <Section title="Invoices" className="billing-invoices">
      {error && <div style={{ fontSize: 12, color: '#DC2626' }}>{error}</div>}
      {!data && !error && <Spinner pad={20} />}
      {data && (
        <>
          <div className="billing-invoices-rows">
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
          </div>
          {data.total > 0 && (
            <Pager total={data.total} page={page} pages={pages} size={pageSize}
              onPage={setPage} onSize={changePageSize} />
          )}
        </>
      )}
    </Section>
  );
}
