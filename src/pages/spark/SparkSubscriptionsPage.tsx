// Spark admin → Subscriptions. The plans every cloud company sees on its
// Subscription page, as pricing cards (no Buy now here). Click a card to get
// Edit, and Archive (companies use it) or Delete. "+ Create subscription" opens
// the editor page. On-premises clients still use license keys (Licenses page).
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { DurationTabs, PlanCard, matchesDuration, type DurationFilter } from '@/components/subscriptions/PlanCard';
import { useToast } from '@/hooks/use-toast';
import { sparkPlans } from '@/lib/api';
import { PAGE_SIZES, Pager } from '@/pages/spark/SparkLicensesPage';
import { SUBSCRIPTIONS_PAGE } from '@/pages/spark/SparkPlanEditorPage';
import type { LicensableModule } from '@/types/license';
import type { PlanStatus, SubscriptionPlan } from '@/types/subscription';

const STATUS_TABS: { key: PlanStatus; label: string; title: string }[] = [
  { key: 'published', label: 'Published', title: 'Published plans' },
  { key: 'draft', label: 'Drafts', title: 'Drafts — companies don’t see these yet' },
  { key: 'archived', label: 'Archived', title: 'Archived — nobody new can buy these' },
];

function flagFor(plan: SubscriptionPlan) {
  if (plan.company_id) return <span className="badge b-am">For {plan.company_name ?? 'one company'}</span>;
  const count = plan.subscriber_count ?? 0;
  if (count > 0) return <span className="badge b-gy">{count} compan{count === 1 ? 'y' : 'ies'}</span>;
  return null;
}

export default function SparkSubscriptionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [catalogue, setCatalogue] = useState<LicensableModule[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<PlanStatus>('published');
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    sparkPlans
      .list({ status, page, limit: pageSize, sort_by: 'price', order: 'asc' })
      .then((res) => {
        setPlans(res.items);
        setTotal(res.total);
        setCatalogue(res.modules_catalogue);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load plans.'))
      .finally(() => setLoading(false));
  }, [status, page, pageSize]);

  useEffect(load, [load]);

  const archive = async (plan: SubscriptionPlan) => {
    setBusyId(plan.id);
    try {
      await sparkPlans.update(plan.id, { status: 'archived' });
      toast({ title: 'Archived — nobody new can buy it' });
      setSelectedId(null);
      load();
    } catch (e) {
      toast({ title: 'Could not archive', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (plan: SubscriptionPlan) => {
    if (!window.confirm(`Delete ${plan.name}? This can't be undone.`)) return;
    setBusyId(plan.id);
    try {
      await sparkPlans.remove(plan.id);
      toast({ title: 'Plan deleted' });
      setSelectedId(null);
      load();
    } catch (e) {
      toast({ title: 'Could not delete', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  // Priced plans first (cheapest first, as loaded), Enterprise last.
  const shown = plans.filter((plan) => matchesDuration(plan, duration))
    .sort((a, b) => Number(a.duration === 'enterprise') - Number(b.duration === 'enterprise'));
  const tab = STATUS_TABS.find((t) => t.key === status)!;

  const actionsFor = (plan: SubscriptionPlan) => {
    if (selectedId !== plan.id) return undefined;
    const inUse = (plan.subscriber_count ?? 0) > 0;
    return (
      <>
        <button type="button" className="btn bp bsm" onClick={() => navigate(`${SUBSCRIPTIONS_PAGE}/${plan.id}/edit`)}>✎ Edit</button>
        {plan.status !== 'archived' && (inUse ? (
          <button type="button" className="btn bs bsm" disabled={busyId === plan.id} onClick={() => archive(plan)}>Archive</button>
        ) : (
          <button type="button" className="btn bs bsm" disabled={busyId === plan.id} onClick={() => remove(plan)}>Delete</button>
        ))}
      </>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Subscription plans</div>
          <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
            What every cloud company sees on its Subscription page. Click a plan to edit it.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <DurationTabs value={duration} onChange={setDuration} />
          <button type="button" className="btn bp" onClick={() => navigate(`${SUBSCRIPTIONS_PAGE}/new`)}>+ Create subscription</button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Status">
        {STATUS_TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={status === t.key}
            className={`tab ${status === t.key ? 'act' : ''}`}
            onClick={() => { setStatus(t.key); setPage(1); setSelectedId(null); }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      {loading && plans.length === 0 ? <Spinner pad={60} /> : (
        <div className="sub-stage">
          <div className="sub-stage-title">{tab.title}</div>
          {shown.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#fff', fontSize: 12, padding: '30px 0 90px' }}>
              No plans here. Use <b>+ Create subscription</b>.
            </div>
          ) : (
            <div className="sub-cards">
              {shown.map((plan, index) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  position={index}
                  catalogue={catalogue}
                  flag={flagFor(plan)}
                  selected={selectedId === plan.id}
                  onClick={() => setSelectedId(selectedId === plan.id ? null : plan.id)}
                  actions={actionsFor(plan)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {total > PAGE_SIZES[0] && (
        <div className="card" style={{ padding: 0 }}>
          <Pager total={total} page={Math.min(page, pages)} pages={pages} size={pageSize}
            onPage={setPage} onSize={(size) => { setPageSize(size); setPage(1); }} />
        </div>
      )}
    </div>
  );
}
