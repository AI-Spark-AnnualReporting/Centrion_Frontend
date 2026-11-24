// Spark → Companies → one company. Read-only: plan, users, modules, money and
// AI credits (over time, by feature, by user, packs bought) for a range.
//
// Route: /spark/companies/:companyId · Plan: Centriton/.claude/plans/spark-company-dashboard.md

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Spinner } from '@/components/shared/Spinner';
import { formatCredits, formatCreditsDetail, formatDollars, formatPaidDate } from '@/components/ai-credits/creditFormat';
import { CreditsLeft, Meter, PlanStatusChip, daysUntil, formatDay } from '@/components/spark/companyKpis';
import { roleMeta } from '@/constants/roles';
import { spark } from '@/lib/api';
import type { SparkCompanyDashboard, UsageRange } from '@/types/spark';

const BAR_COLOUR = '#4040C8';
const INK = '#1A1D2E';
const MUTED = '#5A6080';
const FAINT = '#9BA3C4';

const RANGES: { key: UsageRange; label: string }[] = [
  { key: 'period', label: 'This period' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'all', label: 'All time' },
];

export default function SparkCompanyDashboardPage() {
  const { companyId = '' } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState<UsageRange>('period');
  const [dashboard, setDashboard] = useState<SparkCompanyDashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    spark.companyDashboard(companyId, range)
      .then((next) => { if (alive) { setDashboard(next); setError(''); } })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Failed to load the dashboard.'));
    return () => { alive = false; };
  }, [companyId, range]);

  const back = (
    <button type="button" className="btn bs" style={{ alignSelf: 'flex-start' }}
      onClick={() => navigate('/spark/companies')}>
      ← Back to Companies
    </button>
  );

  if (error && !dashboard) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {back}
        <div className="card" style={{ padding: 14, fontSize: 12, color: '#DC2626' }}>{error}</div>
      </div>
    );
  }
  if (!dashboard) return <Spinner pad={80} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {back}
      <Header dashboard={dashboard} />
      <KpiTiles dashboard={dashboard} />
      <Modules modules={dashboard.modules} hasPlan={dashboard.plan !== null} />
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: INK }}>AI credits</div>
          <div className="tabs" role="tablist" aria-label="Range" style={{ marginBottom: 0 }}>
            {RANGES.map((option) => (
              <button key={option.key} type="button" role="tab" aria-selected={range === option.key}
                className={`tab ${range === option.key ? 'act' : ''}`} onClick={() => setRange(option.key)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {error && <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 8 }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <OverTime usage={dashboard.usage} />
          <ByFeature features={dashboard.usage.by_feature} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <ByUser people={dashboard.usage.by_user} />
        <Purchases dashboard={dashboard} />
      </div>
    </div>
  );
}

function Header({ dashboard }: { dashboard: SparkCompanyDashboard }) {
  const { company, plan } = dashboard;
  const details = [company.jurisdiction, company.created_at ? `joined ${formatPaidDate(company.created_at)}` : '']
    .filter(Boolean).join(' · ');
  const daysLeft = plan && plan.status === 'active' ? daysUntil(plan.ends_at) : null;
  return (
    <div className="card" style={{ padding: '16px 18px', display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: INK }}>{company.name}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{details || 'Jurisdiction not set'}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        {plan ? (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
              <b style={{ fontSize: 14, color: INK }}>{plan.name || 'Plan'}</b>
              <PlanStatusChip status={plan.status} />
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
              {formatDay(plan.starts_at)} → {formatDay(plan.ends_at)}
              {daysLeft !== null && ` · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}
            </div>
          </>
        ) : (
          <PlanStatusChip status="none" />
        )}
      </div>
    </div>
  );
}

function Tile({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="card" style={{ padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: FAINT, textTransform: 'uppercase', letterSpacing: '.04em' }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: INK, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{children}</div>
      {hint && <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function KpiTiles({ dashboard }: { dashboard: SparkCompanyDashboard }) {
  const { users, credits, paid } = dashboard;
  const userPercent = users.limit ? (users.used / users.limit) * 100 : 0;
  const usersFull = users.limit !== null && users.used >= users.limit;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      <Tile title="Users">
        {users.used} <span style={{ fontSize: 13, color: MUTED, fontWeight: 600 }}>/ {users.limit ?? '—'}</span>
        {users.limit !== null && <Meter percent={userPercent} tone={usersFull ? 'red' : ''} label="Users" />}
      </Tile>
      <Tile title="AI credits left">
        {credits ? <div style={{ fontSize: 14, fontWeight: 600 }}><CreditsLeft credits={credits} /></div> : '—'}
      </Tile>
      <Tile title="Used this period" hint={credits ? `of ${formatCredits(credits.total)} credits` : 'no plan'}>
        {credits ? formatCredits(credits.used) : '—'}
      </Tile>
      <Tile title="Total paid" hint={`plans ${formatDollars(paid.plans, 0)} · packs ${formatDollars(paid.packs, 0)}`}>
        {formatDollars(paid.total, 0)}
      </Tile>
      <Tile title="Reports this period" hint="counted against the plan">{dashboard.reports_this_period}</Tile>
      <Tile title="Last activity">
        <span style={{ fontSize: 16 }}>{dashboard.last_activity ? formatPaidDate(dashboard.last_activity) : 'None yet'}</span>
      </Tile>
    </div>
  );
}

function Modules({ modules, hasPlan }: { modules: SparkCompanyDashboard['modules']; hasPlan: boolean }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: INK, marginBottom: 12 }}>Modules</div>
      {!hasPlan && <div style={{ fontSize: 12, color: FAINT, marginBottom: 10 }}>No plan yet, so no module is switched on.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
        {modules.map((module) => <ModuleCard key={module.key} module={module} />)}
      </div>
    </div>
  );
}

function ModuleCard({ module }: { module: SparkCompanyDashboard['modules'][number] }) {
  if (!module.in_plan) {
    return (
      <div data-testid={`module-${module.key}`}
        style={{ border: '1px dashed #E3E7F0', background: '#F6F7FB', borderRadius: 11, padding: '11px 13px', color: FAINT }}>
        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{module.label}</div>
        <div style={{ fontSize: 11, marginTop: 6 }}>Not in plan</div>
      </div>
    );
  }
  const full = module.limit !== null && module.used !== null && module.used >= module.limit;
  return (
    <div data-testid={`module-${module.key}`} style={{ border: '1px solid #E3E7F0', borderRadius: 11, padding: '11px 13px' }}>
      <div style={{ fontWeight: 700, fontSize: 12.5, color: INK }}>{module.label}</div>
      {module.used === null ? (
        <span className="badge b-gn" style={{ marginTop: 6 }}>Included</span>
      ) : module.limit === null ? (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>{module.used} used · no limit</div>
      ) : (
        <>
          <Meter percent={module.limit > 0 ? (module.used / module.limit) * 100 : 100} tone={full ? 'red' : ''} label={module.label} />
          <div style={{ fontSize: 11, color: full ? '#DC2626' : MUTED, fontWeight: full ? 700 : 400 }}>
            {module.used} / {module.limit} {full ? '· full' : 'used'}
          </div>
        </>
      )}
    </div>
  );
}

/** "19 Nov" on the axis; weeks read "w/c 16 Nov" in the tooltip. */
function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function OverTime({ usage }: { usage: SparkCompanyDashboard['usage'] }) {
  const { bucket, points } = usage.over_time;
  const nothing = points.every((point) => point.credits === 0);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>Credits used per {bucket}</div>
      {nothing ? (
        <div style={{ height: 220, display: 'grid', placeItems: 'center', fontSize: 12, color: FAINT }}>No AI use in this range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="#EFF1F8" />
            <XAxis dataKey="date" tickFormatter={shortDay} tick={{ fontSize: 10, fill: MUTED }} tickLine={false}
              axisLine={{ stroke: '#E3E7F0' }} minTickGap={12} />
            <YAxis tick={{ fontSize: 10, fill: FAINT }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: '#F0F0FF' }}
              labelFormatter={(day: string) => (bucket === 'week' ? `Week of ${shortDay(day)}` : shortDay(day))}
              formatter={(value: number) => [`${formatCreditsDetail(value)} credits`, 'Used']} />
            <Bar dataKey="credits" fill={BAR_COLOUR} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ponytail: the top 6 features, the rest folded into "Other" (a company can use ~20).
const TOP_FEATURES = 6;

function ByFeature({ features }: { features: SparkCompanyDashboard['usage']['by_feature'] }) {
  const shown = features.slice(0, TOP_FEATURES);
  const rest = features.slice(TOP_FEATURES);
  if (rest.length > 0) {
    shown.push({
      action: 'other',
      label: `Other (${rest.length} features)`,
      credits: rest.reduce((sum, feature) => sum + feature.credits, 0),
      jobs: rest.reduce((sum, feature) => sum + feature.jobs, 0),
    });
  }
  const largest = Math.max(...shown.map((feature) => feature.credits), 0);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 6 }}>By feature</div>
      {shown.length === 0 && <div style={{ fontSize: 12, color: FAINT, padding: '20px 0' }}>No AI use in this range.</div>}
      {shown.map((feature) => (
        <div key={feature.action} title={`${feature.label}: ${formatCreditsDetail(feature.credits)} credits · ${feature.jobs} ${feature.jobs === 1 ? 'use' : 'uses'}`}
          style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) minmax(40px, 1fr)', alignItems: 'center', gap: 10, padding: '5px 0', fontSize: 12 }}>
          <span style={{ color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{feature.label}</span>
          <span style={{ height: 10, background: '#ECEDF7', borderRadius: 4, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: '0 4px 4px 0', background: BAR_COLOUR,
              width: `${largest > 0 ? Math.max(1, (feature.credits / largest) * 100) : 0}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function roleLabel(role: string | null): string {
  return role ? roleMeta(role).label : '—';
}

function ByUser({ people }: { people: SparkCompanyDashboard['usage']['by_user'] }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', fontSize: 13, fontWeight: 800, color: INK }}>By user</div>
      <div style={{ overflowX: 'auto' }}>
        <table className="utable" style={{ width: '100%', fontSize: 12 }}>
          <thead><tr><th>User</th><th>Role</th><th style={{ textAlign: 'right' }}>Credits</th><th style={{ textAlign: 'right' }}>Times used</th></tr></thead>
          <tbody>
            {people.length === 0 && <tr className="urow"><td colSpan={4} style={{ color: FAINT }}>No AI use in this range.</td></tr>}
            {people.map((person) => (
              <tr key={person.user_id ?? 'unknown'} className="urow">
                <td><b>{person.full_name}</b></td>
                <td style={{ color: MUTED }}>{roleLabel(person.role)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCreditsDetail(person.credits)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{person.jobs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SourceBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, minWidth: 100, background: '#F7F7FF', border: '1px solid #E3E7F0', borderRadius: 10, padding: '9px 12px' }}>
      <div style={{ fontSize: 11, color: FAINT }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function Purchases({ dashboard }: { dashboard: SparkCompanyDashboard }) {
  const { credits, purchases } = dashboard;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px 10px', fontSize: 13, fontWeight: 800, color: INK }}>Where this period's credits came from</div>
      {credits ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '0 16px 12px' }}>
          <SourceBox label="Included in plan" value={formatCredits(credits.included)} />
          <SourceBox label="Packs bought" value={`+${formatCredits(credits.packs)}`} />
          <SourceBox label="Carried over" value={formatCredits(credits.carried)} />
        </div>
      ) : (
        <div style={{ padding: '0 16px 12px', fontSize: 12, color: FAINT }}>No plan, so no credits.</div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table className="utable" style={{ width: '100%', fontSize: 12 }}>
          <thead><tr><th>Paid on</th><th style={{ textAlign: 'right' }}>Credits</th><th style={{ textAlign: 'right' }}>Price</th><th>Bought by</th></tr></thead>
          <tbody>
            {purchases.length === 0 && <tr className="urow"><td colSpan={4} style={{ color: FAINT }}>No credit packs bought.</td></tr>}
            {purchases.map((pack) => (
              <tr key={pack.id} className="urow">
                <td>{formatPaidDate(pack.paid_at)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCredits(pack.credits)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatDollars(pack.price)}</td>
                <td style={{ color: MUTED }}>{pack.bought_by ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
