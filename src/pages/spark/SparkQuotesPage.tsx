// Spark admin → Quotes. What cloud clients asked for with "Get a quote". Each
// quote is already a draft plan for that company; "Check and set price" opens
// it on the plan editor page, and publishing it lets only that company subscribe.
//
// Plans: Centriton/.claude/plans/cloud-subscriptions.md and
// cloud-subscriptions-v2-redesign.md

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { ModuleTags, durationLabel, peopleSummary } from '@/components/subscriptions/PlanFields';
import { sparkPlans } from '@/lib/api';
import { PAGE_SIZES, Pager } from '@/pages/spark/SparkLicensesPage';
import { SUBSCRIPTIONS_PAGE } from '@/pages/spark/SparkPlanEditorPage';
import type { LicensableModule } from '@/types/license';
import type { PlanStatus, SubscriptionPlan } from '@/types/subscription';

const CELL = { padding: '10px 14px', verticalAlign: 'top' } as const;

const STATUS_TABS: { key: PlanStatus; label: string }[] = [
  { key: 'draft', label: 'Needs a price' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' },
];

const STATUS_BADGE: Record<PlanStatus, { label: string; cls: string }> = {
  draft: { label: 'Needs a price', cls: 'b-am' },
  published: { label: 'Published', cls: 'b-gn' },
  archived: { label: 'Archived', cls: 'b-gy' },
};

export default function SparkQuotesPage() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<SubscriptionPlan[]>([]);
  const [catalogue, setCatalogue] = useState<LicensableModule[]>([]);
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
        setCatalogue(res.modules_catalogue);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load quotes.'))
      .finally(() => setLoading(false));
  }, [status, page, pageSize]);

  useEffect(load, [load]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Quote requests</div>
        <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
          A plan is made from each quote automatically. Check it, set the price, publish — only that company sees it.
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
                <th style={CELL}>What they asked for</th>
                <th style={CELL}>Asked by</th>
                <th style={CELL}>Sent</th>
                <th style={CELL}>Status</th>
                <th style={{ ...CELL, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {quotes.length === 0 && (
                <tr><td colSpan={6} style={{ ...CELL, color: '#9BA3C4' }}>No quotes here.</td></tr>
              )}
              {quotes.map((quote) => {
                // What they asked for, not what spark_admin has changed it to since.
                const asked = quote.quote?.asked ?? quote;
                const badge = STATUS_BADGE[quote.status];
                return (
                  <tr key={quote.id} style={{ borderTop: '1px solid #EEF0F7' }}>
                    <td style={{ ...CELL, fontWeight: 700, color: '#1A1D2E' }}>{quote.company_name ?? '—'}</td>
                    <td style={{ ...CELL, maxWidth: 340 }}>
                      <ModuleTags limits={asked} catalogue={catalogue} />
                      <div style={{ color: '#9BA3C4', marginTop: 4 }}>{peopleSummary(asked)}</div>
                      {quote.quote?.duration && (
                        <div style={{ color: '#9BA3C4' }}>Prefers {durationLabel(quote.quote.duration)}</div>
                      )}
                      {quote.quote?.note && <div style={{ marginTop: 4 }}>“{quote.quote.note}”</div>}
                    </td>
                    <td style={CELL}>{quote.quote?.asked_by_name ?? quote.quote?.asked_by ?? '—'}</td>
                    <td style={CELL}>{(quote.quote?.asked_at ?? quote.created_at).slice(0, 10)}</td>
                    <td style={CELL}><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                    <td style={{ ...CELL, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {quote.status === 'draft' && (
                        <button type="button" className="btn bp bsm"
                          onClick={() => navigate(`${SUBSCRIPTIONS_PAGE}/${quote.id}/edit`, { state: { back: '/spark/quotes' } })}>
                          Check and set price
                        </button>
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
    </div>
  );
}
