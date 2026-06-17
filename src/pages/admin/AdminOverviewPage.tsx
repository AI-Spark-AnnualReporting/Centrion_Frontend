import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { adminConsole } from '@/lib/api';
import type { ActivityType, AdminOverview } from '@/types/admin';
import { shortDateTime } from '@/lib/time';

const PRIMARY = '#4040C8';
const TEAL = '#0D9488';

// System health is hardcoded for now per spec (made data-driven later).
const SYSTEM_HEALTH: {
  name: string;
  uptime: string;
  status: 'Operational' | 'Degraded' | 'Down';
}[] = [
  { name: 'Reporting API', uptime: '99.98%', status: 'Operational' },
  { name: 'Tadawul feed', uptime: '99.91%', status: 'Operational' },
  { name: 'CMA e-Disclosure', uptime: '99.99%', status: 'Operational' },
  { name: 'Slack integration', uptime: '—', status: 'Degraded' },
];

const HEALTH_BADGE: Record<string, string> = {
  Operational: 'b-gn',
  Degraded: 'b-am',
  Down: 'b-rd',
};
const HEALTH_DOT: Record<string, string> = {
  Operational: '#16A34A',
  Degraded: '#F59E0B',
  Down: '#DC2626',
};

const ACTIVITY_BADGE: Record<ActivityType, string> = {
  USER: 'b-or',
  REPORT: 'b-tl',
  SYSTEM: 'b-gy',
  PERMISSION: 'b-pp',
  DEPARTMENT: 'b-bl',
};
const ACTIVITY_DOT: Record<ActivityType, string> = {
  USER: '#4040C8',
  REPORT: '#0D9488',
  SYSTEM: '#9BA3C4',
  PERMISSION: '#7C3AED',
  DEPARTMENT: '#2563EB',
};

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="card" style={{ padding: 18, ...style }}>
      {children}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  hint,
  hintColor,
  amber,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint: string;
  hintColor: string;
  amber?: boolean;
}) {
  return (
    <Card
      style={{
        flex: 1,
        minWidth: 0,
        ...(amber
          ? { background: '#FFFBEB', borderColor: '#FCE7B0' }
          : {}),
      }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: amber ? 'rgba(245,158,11,.14)' : '#EEEEFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: amber ? '#B45309' : PRIMARY,
          marginBottom: 12,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          color: '#1A1D2E',
          lineHeight: 1,
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E', marginTop: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>{hint}</div>
    </Card>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 14,
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

export default function AdminOverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    adminConsole
      .overview()
      .then((res) => {
        if (alive) setData(res);
      })
      .catch((err) => {
        if (alive)
          setError(err instanceof Error ? err.message : 'Failed to load overview.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ flex: 1, height: 118, borderRadius: 16 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <div className="skel" style={{ flex: 3, height: 240, borderRadius: 16 }} />
          <div className="skel" style={{ flex: 2, height: 240, borderRadius: 16 }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>
          Couldn’t load the overview
        </div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6 }}>
          {error || 'No data returned.'}
        </div>
      </Card>
    );
  }

  const chartData = data.reports_by_quarter ?? [];
  const lastIdx = chartData.length - 1;
  const storagePct =
    data.storage_limit_gb > 0
      ? Math.round((data.document_storage_gb / data.storage_limit_gb) * 100)
      : 0;

  const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n}% QoQ`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 14 }}>
        <StatCard
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          }
          value={String(data.active_users)}
          label="Active users"
          hint={`of ${data.total_seats} seats`}
          hintColor="#9BA3C4"
        />
        <StatCard
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          }
          value={String(data.reports_this_quarter)}
          label="Reports this quarter"
          hint={fmtPct(data.reports_qoq_pct)}
          hintColor="#16A34A"
        />
        <StatCard
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <ellipse cx="7" cy="3.5" rx="4.5" ry="2" stroke="currentColor" strokeWidth="1.3" />
              <path d="M2.5 3.5v7c0 1.1 2 2 4.5 2s4.5-.9 4.5-2v-7M2.5 7c0 1.1 2 2 4.5 2s4.5-.9 4.5-2" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          }
          value={`${data.document_storage_gb} GB`}
          label="Document storage"
          hint={`of ${data.storage_limit_gb} GB · ${storagePct}% used`}
          hintColor="#9BA3C4"
        />
        <StatCard
          amber
          icon={
            <svg viewBox="0 0 14 14" width="15" height="15" fill="none">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M7 4v3.2M7 9.4v.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          }
          value={String(data.pending_actions)}
          label="Pending actions"
          hint={`${data.pending_invites} invites · ${data.pending_onboarding} onboarding · Needs review`}
          hintColor="#B45309"
        />
      </div>

      {/* Chart + system health */}
      <div style={{ display: 'flex', gap: 14 }}>
        <Card style={{ flex: 3, minWidth: 0 }}>
          <SectionTitle
            title="Reports generated"
            subtitle="Trailing 12 quarters"
            right={
              <span className="badge b-gn">{fmtPct(data.reports_qoq_pct)}</span>
            }
          />
          <div style={{ height: 200 }}>
            {chartData.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  color: '#9BA3C4',
                }}
              >
                No report history yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
                  <XAxis
                    dataKey="quarter"
                    tick={{ fontSize: 9, fill: '#9BA3C4' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(64,64,200,.06)' }}
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #E2E4F0',
                      fontSize: 11,
                      boxShadow: '0 8px 24px rgba(0,0,0,.08)',
                    }}
                  />
                  <Bar dataKey="count" radius={[5, 5, 0, 0]} maxBarSize={34}>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={i === lastIdx ? TEAL : PRIMARY} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card style={{ flex: 2, minWidth: 0 }}>
          <SectionTitle title="System health" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {SYSTEM_HEALTH.map((h, i) => (
              <div
                key={h.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 0',
                  borderTop: i === 0 ? 'none' : '1px solid #F1F2F9',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: HEALTH_DOT[h.status],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1D2E', flex: 1 }}>
                  {h.name}
                </span>
                <span style={{ fontSize: 11, color: '#9BA3C4', fontFamily: "'DM Mono', monospace" }}>
                  {h.uptime}
                </span>
                <span className={`badge ${HEALTH_BADGE[h.status]}`}>{h.status}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin-console/users')}
            style={{
              marginTop: 12,
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 11,
              fontWeight: 700,
              color: PRIMARY,
              cursor: 'pointer',
            }}
          >
            View integrations →
          </button>
        </Card>
      </div>

      {/* Recent activity + needs attention */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <Card style={{ flex: 3, minWidth: 0 }}>
          <SectionTitle
            title="Recent activity"
            right={
              <span style={{ fontSize: 11, fontWeight: 700, color: PRIMARY, cursor: 'pointer' }}>
                Full audit log →
              </span>
            }
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {(data.recent_activity ?? []).slice(0, 10).map((a, i) => (
              <div
                key={a.id ?? i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 0',
                  borderTop: i === 0 ? 'none' : '1px solid #F1F2F9',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: ACTIVITY_DOT[a.type] ?? '#9BA3C4',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#1A1D2E' }}>
                    <span style={{ fontWeight: 700 }}>{a.actor}</span>{' '}
                    <span style={{ color: '#5A6080' }}>{a.action}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}>
                    {shortDateTime(a.timestamp)}
                  </div>
                </div>
                <span className={`badge ${ACTIVITY_BADGE[a.type] ?? 'b-gy'}`}>{a.type}</span>
              </div>
            ))}
            {(data.recent_activity ?? []).length === 0 && (
              <div style={{ fontSize: 12, color: '#9BA3C4', padding: '8px 0' }}>
                No recent activity.
              </div>
            )}
          </div>
        </Card>

        <Card style={{ flex: 2, minWidth: 0 }}>
          <SectionTitle title="Needs attention" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(data.needs_attention ?? []).map((n, i) => (
              <button
                key={n.id ?? i}
                type="button"
                onClick={() => n.target && navigate(n.target)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid #ECEEF8',
                  background: '#FAFBFE',
                  cursor: n.target ? 'pointer' : 'default',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: '#EEEEFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: PRIMARY,
                    flexShrink: 0,
                    fontSize: 13,
                  }}
                >
                  •
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1A1D2E' }}>{n.title}</div>
                  <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>{n.description}</div>
                </div>
                <svg viewBox="0 0 12 12" width="12" height="12" fill="none" style={{ color: '#C4C9DD', flexShrink: 0 }}>
                  <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))}
            {(data.needs_attention ?? []).length === 0 && (
              <div style={{ fontSize: 12, color: '#9BA3C4', padding: '8px 0' }}>
                Nothing needs attention.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
