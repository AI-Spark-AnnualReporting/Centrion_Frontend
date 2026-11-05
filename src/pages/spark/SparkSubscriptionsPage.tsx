// Spark admin → Subscriptions. The plans every cloud company sees on its
// Subscription page, as pricing cards (no Buy now here), 3 per page.
// Tabs: Published and Drafts (plans for every company) and Custom plans (made
// for one company from its request: companies table on the left, that
// company's cards on the right). Click a card for Edit and Delete — Delete
// removes a plan nobody bought and hides one that was bought (the server
// decides). "+ Create subscription" opens the editor page. The page never
// scrolls. On-premises clients still use license keys (Licenses page).
//
// Plans: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md,
//        Centriton/.claude/plans/subscription-test-fixes.md (fixes 1 and 5)

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '@/components/shared/Spinner';
import { CustomPlanCompanies } from '@/components/subscriptions/CustomPlanCompanies';
import { CardStrip, DurationTabs, PlanCard, type DurationFilter } from '@/components/subscriptions/PlanCard';
import { useToast } from '@/hooks/use-toast';
import { sparkPlans } from '@/lib/api';
import { Pager } from '@/pages/spark/SparkLicensesPage';
import { SUBSCRIPTIONS_PAGE } from '@/pages/spark/SparkPlanEditorPage';
import type { LicensableModule } from '@/types/license';
import type { CustomPlanCompany, PlanKind, PlanStatus, SubscriptionPlan } from '@/types/subscription';

const CARDS_PER_PAGE = 3;

type TabKey = 'published' | 'draft' | 'custom';

const TABS: { key: TabKey; label: string; title: string; kind: PlanKind; status?: PlanStatus }[] = [
  { key: 'published', label: 'Published', title: 'Published plans', kind: 'public', status: 'published' },
  { key: 'draft', label: 'Drafts', title: 'Drafts — companies don’t see these yet', kind: 'public', status: 'draft' },
  { key: 'custom', label: 'Custom plans', title: 'Custom plans', kind: 'custom' },
];

/** Custom plans tab: say whether the company can see the plan yet. */
function statusFlag(plan: SubscriptionPlan) {
  if (plan.status === 'published') return <span className="badge b-gn">Published</span>;
  return <span className="badge b-gy">Draft</span>;
}

/** The question Delete asks first. A plan companies are on stays theirs until it ends. */
export function deleteQuestion(plan: SubscriptionPlan): string {
  const onIt = plan.subscriber_count ?? 0;
  if (onIt === 0) return `Delete ${plan.name}? This can't be undone.`;
  const who = onIt === 1 ? '1 company is' : `${onIt} companies are`;
  return `${who} on ${plan.name}. They keep it until it ends, but nobody new can buy it. Delete ${plan.name}?`;
}

/** The message after Delete, from what the server did. */
export function deletedMessage(name: string, result: 'deleted' | 'hidden', companiesOnIt: number): string {
  if (result === 'deleted') return `${name} deleted`;
  if (companiesOnIt > 0) {
    return `${name} deleted. ${companiesOnIt === 1 ? '1 company keeps' : `${companiesOnIt} companies keep`} it until it ends.`;
  }
  return `${name} deleted. Companies that bought it keep their history.`;
}

export default function SparkSubscriptionsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tabKey, setTabKey] = useState<TabKey>('published');
  const [duration, setDuration] = useState<DurationFilter>('all');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [catalogue, setCatalogue] = useState<LicensableModule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Record<TabKey, number | null>>({ published: null, draft: null, custom: null });
  // Custom plans: the picked company. undefined = the table hasn't loaded yet; null = no company.
  const [company, setCompany] = useState<CustomPlanCompany | null | undefined>(undefined);
  const companyId = useRef<string | null>(null);
  const [companiesReload, setCompaniesReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const tab = TABS.find((t) => t.key === tabKey)!;
  const custom = tabKey === 'custom';

  // The number on each tab: one small request per tab (limit 1, just the total).
  const loadCounts = useCallback(() => {
    for (const t of TABS) {
      sparkPlans.list({ kind: t.kind, status: t.status, limit: 1 })
        .then((res) => setCounts((before) => ({ ...before, [t.key]: res.total })))
        .catch(() => setCounts((before) => ({ ...before, [t.key]: null })));
    }
  }, []);

  const loadCards = useCallback(() => {
    // Custom plans: wait for the companies table (spinner), then for a pick.
    if (custom && company === undefined) {
      setLoading(true);
      return;
    }
    if (custom && company === null) {
      setPlans([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    sparkPlans
      .list({
        kind: tab.kind,
        status: tab.status,
        company_id: custom ? company?.company_id : undefined,
        duration: duration === 'all' ? undefined : duration,
        with_enterprise: duration !== 'all',
        page,
        limit: CARDS_PER_PAGE,
        // Cheapest first; Enterprise (no price) comes last.
        sort_by: 'price',
        order: 'asc',
      })
      .then((res) => {
        setPlans(res.items);
        setTotal(res.total);
        setCatalogue(res.modules_catalogue);
        setError('');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load plans.'))
      .finally(() => setLoading(false));
  }, [tab, custom, company, duration, page]);

  useEffect(loadCounts, [loadCounts]);
  useEffect(loadCards, [loadCards]);

  const openTab = (key: TabKey) => {
    setTabKey(key);
    setPage(1);
    setSelectedId(null);
  };

  // Called by the companies table on every load too (stale closure), so the
  // picked company's id is kept in a ref: only a different company resets the page.
  const pickCompany = (next: CustomPlanCompany | null) => {
    const nextId = next?.company_id ?? null;
    if (nextId !== companyId.current) {
      companyId.current = nextId;
      setPage(1);
      setSelectedId(null);
    }
    setCompany(next);
  };

  const remove = async (plan: SubscriptionPlan) => {
    if (!window.confirm(deleteQuestion(plan))) return;
    setBusyId(plan.id);
    try {
      const done = await sparkPlans.remove(plan.id);
      toast({ title: deletedMessage(plan.name, done.result, done.companies_on_it) });
      setSelectedId(null);
      // The last card on a page went: step back a page.
      if (plans.length === 1 && page > 1) setPage(page - 1);
      else loadCards();
      loadCounts();
      if (custom) setCompaniesReload((n) => n + 1);
    } catch (e) {
      toast({ title: 'Could not delete', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const actionsFor = (plan: SubscriptionPlan) => {
    if (selectedId !== plan.id) return undefined;
    return (
      <>
        <button type="button" className="btn bp bsm" onClick={() => navigate(`${SUBSCRIPTIONS_PAGE}/${plan.id}/edit`)}>✎ Edit</button>
        <button type="button" className="btn bs bsm" disabled={busyId === plan.id} onClick={() => remove(plan)}>Delete</button>
      </>
    );
  };

  const pages = Math.max(1, Math.ceil(total / CARDS_PER_PAGE));
  const stageTitle = custom ? (company ? `Custom plans for ${company.company_name}` : 'Custom plans') : tab.title;
  const emptyText = custom && !company
    ? 'No custom plans yet. They appear when a company sends a request (Quotes → Make a plan).'
    : 'No plans here.';

  const cards = (
    <div className="sub-stage">
      <div className="sub-stage-title">{stageTitle}</div>
      {loading && plans.length === 0 ? <Spinner pad={60} /> : plans.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#fff', fontSize: 12, padding: '30px 0 90px' }}>
          {emptyText}{!custom && <> Use <b>+ Create subscription</b>.</>}
        </div>
      ) : (
        <CardStrip>
          {plans.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              position={(page - 1) * CARDS_PER_PAGE + index}
              catalogue={catalogue}
              flag={custom ? statusFlag(plan) : undefined}
              selected={selectedId === plan.id}
              onClick={() => setSelectedId(selectedId === plan.id ? null : plan.id)}
              actions={actionsFor(plan)}
            />
          ))}
        </CardStrip>
      )}
    </div>
  );

  return (
    <div className="sub-fit">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>Subscription plans</div>
          <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
            {custom
              ? 'Plans made for one company from its request (Quotes → Make a plan). Only that company sees them.'
              : 'What every cloud company sees on its Subscription page. Click a plan to edit it.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <DurationTabs value={duration} onChange={(next) => { setDuration(next); setPage(1); setSelectedId(null); }} />
          <button type="button" className="btn bp" onClick={() => navigate(`${SUBSCRIPTIONS_PAGE}/new`)}>+ Create subscription</button>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Status" style={{ alignSelf: 'flex-start' }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tabKey === t.key}
            className={`tab ${tabKey === t.key ? 'act' : ''}`} onClick={() => openTab(t.key)}>
            {t.label}
            {counts[t.key] != null && <span className="sub-tab-n">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      {error && <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      {/* The last child takes the rest of the height (content--fit); the page never scrolls. */}
      <div className="sub-split">
        {custom && <CustomPlanCompanies selectedId={company?.company_id ?? null} onSelect={pickCompany} reloadKey={companiesReload} />}
        <div className="sub-split-cards">
          {cards}
          {total > CARDS_PER_PAGE && (
            <div className="card" style={{ padding: 0 }}>
              <Pager total={total} page={Math.min(page, pages)} pages={pages} size={CARDS_PER_PAGE} onPage={setPage} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
