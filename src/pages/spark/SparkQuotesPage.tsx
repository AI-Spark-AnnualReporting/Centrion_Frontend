// Spark admin → Quotes. The Enterprise requests cloud clients sent with
// Contact us (name, phone, message). Each is already a draft plan for that
// company; "Make offer" opens it on the plan editor page as an Enterprise
// offer. Spark prices it and can email it; the client replies by email.
// Only Spark decides: Approve publishes it for that company ("Made for
// you"), Delete removes it. Plan: Centriton/.claude/plans/quote-offers.md
//
// Plans: Centriton/.claude/plans/cloud-subscriptions.md and
// cloud-subscriptions-v2-redesign.md

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { FormDialog } from '@/components/subscriptions/FormDialog';
import { useToast } from '@/hooks/use-toast';
import { sparkPlans } from '@/lib/api';
import { PAGE_SIZES, Pager } from '@/pages/spark/SparkLicensesPage';
import { SUBSCRIPTIONS_PAGE } from '@/pages/spark/SparkPlanEditorPage';
import type { OfferState, PlanStatus, SubscriptionPlan } from '@/types/subscription';

const CELL = { padding: '10px 14px', verticalAlign: 'top' } as const;

const STATUS_TABS: { key: PlanStatus; label: string }[] = [
  { key: 'draft', label: 'Open' },
  { key: 'published', label: 'Approved' },
  { key: 'archived', label: 'Deleted' },          // deleted on Subscriptions (kept hidden for its history)
];

const OFFER_BADGE: Record<OfferState, { label: string; cls: string }> = {
  received: { label: 'Quote received', cls: 'b-am' },
  sent: { label: 'Offer sent', cls: 'b-or' },
  changed: { label: 'Changed — send again', cls: 'b-am' },
  approved: { label: 'Approved', cls: 'b-gn' },
  deleted: { label: 'Deleted', cls: 'b-gy' },
};

/** Where the quote is; quotes from before offers were added have no offer_state. */
function offerStateOf(quote: SubscriptionPlan): OfferState {
  if (quote.offer_state) return quote.offer_state;
  if (quote.status === 'published') return 'approved';
  if (quote.status === 'archived') return 'deleted';
  return 'received';
}

// The confirm popup for Approve or Delete on one quote.
type QuoteAction = { kind: 'approve' | 'delete'; quote: SubscriptionPlan } | null;

export default function SparkQuotesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [action, setAction] = useState<QuoteAction>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [quotes, setQuotes] = useState<SubscriptionPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<PlanStatus>('draft');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    sparkPlans
      .list({ quotes_only: true, status, page, limit: pageSize, sort_by: 'created_at', order: 'desc' })
      .then((res) => {
        setQuotes(res.items);
        setTotal(res.total);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quotes.'))
      .finally(() => setLoading(false));
  }, [status, page, pageSize]);

  useEffect(load, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  const openAction = (kind: 'approve' | 'delete', quote: SubscriptionPlan) => {
    setActionError('');
    setAction({ kind, quote });
  };

  /** Approve (publish for the company) or delete the quote, then reload. */
  const confirmAction = async () => {
    if (!action) return;
    setActing(true);
    setActionError('');
    const company = action.quote.company_name ?? 'the company';
    try {
      if (action.kind === 'approve') {
        await sparkPlans.approveOffer(action.quote.id);
        toast({ title: `Approved — ${company} can subscribe now` });
      } else {
        await sparkPlans.remove(action.quote.id);
        toast({ title: 'Quote deleted' });
      }
      setAction(null);
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not do that.');
    } finally {
      setActing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Quote requests</div>
        <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
          A plan is made from each quote. Price it, email the offer, and approve it once the client agrees — only that company sees it.
        </div>
      </div>

      <div className="tabs" role="tablist">
        {STATUS_TABS.map((tab) => (
          <button key={tab.key} type="button" role="tab" aria-selected={status === tab.key}
            className={`tab ${status === tab.key ? 'act' : ''}`}
            onClick={() => { setStatus(tab.key); setPage(1); }}>
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        {loading && quotes.length === 0 ? <Spinner pad={40} /> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#5A6080', fontSize: 11 }}>
                <th style={CELL}>Company</th>
                <th style={CELL}>Name</th>
                <th style={CELL}>Phone</th>
                <th style={CELL}>Message</th>
                <th style={CELL}>Sent</th>
                <th style={CELL}>Status</th>
                <th style={{ ...CELL, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 && (
                <tr><td colSpan={7} style={{ ...CELL, color: '#9BA3C4' }}>No requests here.</td></tr>
              )}
              {quotes.map((quote) => {
                const state = offerStateOf(quote);
                const badge = OFFER_BADGE[state];
                return (
                  <tr key={quote.id} style={{ borderTop: '1px solid #EEF0F7' }}>
                    <td style={{ ...CELL, fontWeight: 700, color: '#1A1D2E' }}>{quote.company_name ?? '—'}</td>
                    <td style={CELL}>{quote.quote?.name ?? quote.quote?.asked_by_name ?? '—'}</td>
                    <td style={{ ...CELL, fontFamily: "'DM Mono', monospace", fontSize: 11.5, whiteSpace: 'nowrap' }}>{quote.quote?.phone ?? '—'}</td>
                    <td style={{ ...CELL, maxWidth: 320, color: '#3A3F55', lineHeight: 1.5 }}>{quote.quote?.message ?? '—'}</td>
                    <td style={CELL}>{(quote.quote?.asked_at ?? quote.created_at).slice(0, 10)}</td>
                    <td style={CELL}>
                      <span className={`badge ${badge.cls}`}>{badge.label}</span>
                      {(state === 'sent' || state === 'changed') && quote.quote?.offer?.sent_at && (
                        <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 4, maxWidth: 220 }}>
                          Emailed {quote.quote.offer.sent_at.slice(0, 10)} to {(quote.quote.offer.sent_to ?? []).join(', ')}
                        </div>
                      )}
                    </td>
                    <td style={{ ...CELL, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {quote.status === 'draft' && (
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" className="btn bs bsm"
                            onClick={() => navigate(`${SUBSCRIPTIONS_PAGE}/${quote.id}/edit`, { state: { back: '/spark/quotes' } })}>
                            {state === 'received' ? 'Make offer' : 'Edit offer'}
                          </button>
                          {/* Approve only once the client has seen this exact offer (decided 2026-11-09);
                              "changed" waits for Send offer again. */}
                          {state === 'sent' && (
                            <button type="button" className="btn bsm sub-approve" onClick={() => openAction('approve', quote)}>✓ Approve</button>
                          )}
                          <button type="button" className="btn bs bsm" onClick={() => openAction('delete', quote)}>Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pager total={total} page={Math.min(page, pages)} pages={pages} size={pageSize}
          onPage={setPage} onSize={(size) => { setPageSize(size); setPage(1); }} />
      </div>

      <FormDialog open={action !== null} title={action?.kind === 'approve' ? 'Approve the plan' : 'Delete the quote'}
        onClose={() => { if (!acting) setAction(null); }}>
        {action && (
          <div className="card" style={{ padding: '20px 24px', maxWidth: 460, margin: '0 auto' }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>
              {action.kind === 'approve'
                ? `Approve this plan for ${action.quote.company_name ?? 'the company'}?`
                : `Delete ${action.quote.company_name ?? 'this company'}'s quote?`}
            </div>
            <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 4, lineHeight: 1.6 }}>
              {action.kind === 'approve'
                ? `${action.quote.name}. It's published for ${action.quote.company_name ?? 'the company'} only; their admin gets "Your plan is ready" and can subscribe.`
                : 'The request and its offer are removed. The company can send a new request with Contact us.'}
            </div>
            {actionError && <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: 8 }}>{actionError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn bs" disabled={acting} onClick={() => setAction(null)}>Back</button>
              <button type="button" className={`btn ${action.kind === 'approve' ? 'sub-approve' : 'bp'}`} disabled={acting} onClick={confirmAction}>
                {action.kind === 'approve' ? 'Approve' : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </FormDialog>
    </div>
  );
}
