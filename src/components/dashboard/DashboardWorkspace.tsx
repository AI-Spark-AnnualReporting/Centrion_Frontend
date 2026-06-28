import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminConsole, companies as companiesApi, documents as documentsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company } from '@/types/company';
import type { Department } from '@/types/admin';
import { CYCLE_SECTOR_OPTIONS } from '@/types/cycles';
import { ReportStartCards } from '@/components/dashboard/ReportStartCards';

/**
 * Personal welcome dashboard — shown after onboarding once report documents have
 * been uploaded, until the company's first report is generated (then DashboardPage
 * switches to the ESG Command Center). Built from REAL data: company profile, the
 * extracted report tone/theme/outline, the uploaded documents, and the real
 * department agents. No fake metrics — those live on the ESG dashboard.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ACCENT = '#4040C8';
const AGENT_COLORS = ['#3B52E0', '#0F9D6B', '#7C3AED', '#B7791F', '#E5484D', '#5A6080'];

interface WorkspaceDoc {
  id: string;
  filename: string;
  file_type?: string;
  extraction_status?: string;
  created_at?: string;
}

const CARD_TITLE: React.CSSProperties = { fontSize: 15, fontWeight: 800, color: '#1A1D2E' };

function StatCard({ accent, label, value, sub }: { accent: string; label: string; value: string; sub: string }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ height: 3, background: accent }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.6px', color: '#9BA3C4', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 23, fontWeight: 800, color: '#1A1D2E', margin: '6px 0 2px', letterSpacing: '-.5px' }}>{value}</div>
        <div style={{ fontSize: 11.5, color: '#9BA3C4' }}>{sub}</div>
      </div>
    </div>
  );
}

function docStatusColor(status?: string): { color: string; bg: string } {
  if (status === 'completed') return { color: '#16A34A', bg: 'rgba(34,197,94,.12)' };
  if (status === 'failed') return { color: '#DC2626', bg: 'rgba(239,68,68,.12)' };
  return { color: '#B45309', bg: 'rgba(245,158,11,.15)' };
}

export function DashboardWorkspace({ company: companyProp, companyName }: { company: Company | null; companyName: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const companyId = user?.company_id ?? null;

  const [company, setCompany] = useState<Company | null>(companyProp);
  const [docs, setDocs] = useState<WorkspaceDoc[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  // Use the company the gate fetched; fall back to fetching it ourselves.
  useEffect(() => {
    if (companyProp) { setCompany(companyProp); return; }
    let cancelled = false;
    companiesApi.getMyCompany().then((c) => { if (!cancelled) setCompany(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [companyProp]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    documentsApi
      .list<{ documents?: WorkspaceDoc[] }>(companyId)
      .then((r) => { if (!cancelled) setDocs(r?.documents ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [companyId]);

  // Self-heal: right after onboarding the uploaded docs + report_tone are still
  // being processed in the background, so they're absent on first render. Poll a
  // few times until report_tone lands, updating company + docs live (no reload).
  useEffect(() => {
    if (!companyId || companyProp?.report_tone) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      Promise.allSettled([
        companiesApi.getMyCompany(),
        documentsApi.list<{ documents?: WorkspaceDoc[] }>(companyId),
      ]).then(([c, d]) => {
        if (cancelled) return;
        const fresh = c.status === 'fulfilled' ? c.value : null;
        if (fresh) setCompany(fresh);
        if (d.status === 'fulfilled') setDocs(d.value?.documents ?? []);
        attempts += 1;
        if (!fresh?.report_tone && attempts < 8) timer = setTimeout(tick, 3000);
      });
    };
    timer = setTimeout(tick, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [companyId, companyProp?.report_tone]);

  // Real department agents — endpoint is admin-gated, so only admins fetch it.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    adminConsole
      .listDepartments()
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.departments ?? []);
        if (!cancelled) setDepartments(list.filter((d) => d.is_active !== false));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin]);

  const firstName = (user?.full_name ?? '').trim().split(' ')[0] || 'there';
  const fiscalMonth = company?.fiscal_year_end_month ? MONTHS[company.fiscal_year_end_month - 1] : '—';
  const employees = company?.employee_count ? company.employee_count.toLocaleString() : '—';
  const exchange = company?.listed_exchange || 'Not listed';
  const sectorLabel = CYCLE_SECTOR_OPTIONS.find((s) => s.value === company?.reporting_sector)?.label ?? '—';

  const tone = company?.report_tone ?? null;
  const theme = company?.report_theme ?? null;
  const styleReady = Boolean(tone || theme);
  const themeChips = theme ? theme.split(',').map((t) => t.trim()).filter(Boolean) : [];

  const subParts: string[] = [];
  if (departments.length) subParts.push(`${departments.length} AI agent${departments.length === 1 ? '' : 's'} active`);
  if (docs.length) subParts.push(`${docs.length} document${docs.length === 1 ? '' : 's'} indexed`);
  if (sectorLabel !== '—') subParts.push(sectorLabel);
  const subline = subParts.length ? subParts.join('  ·  ') : 'Your workspace is being set up.';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, padding: '30px 32px', color: '#fff', background: 'linear-gradient(135deg, #4A47D4 0%, #3736AE 100%)', boxShadow: '0 18px 40px rgba(53,53,181,.28)' }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.14), transparent 70%)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 13, opacity: 0.82, fontWeight: 500 }}>Good day, {firstName} 👋</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.6px', margin: '6px 0 8px' }}>
            {companyName}'s workspace is live and ready.
          </h1>
          <p style={{ fontSize: 13, opacity: 0.88, margin: 0 }}>{subline}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
            {[
              { label: 'Generate Report', go: '/reports' },
              { label: 'Ask AI', go: '/ai' },
              { label: 'Upload Document', go: '/docs' },
              { label: 'Start Annual Report', go: '/annual-report' },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => navigate(a.go)}
                style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.22)', borderRadius: 9, padding: '9px 16px', cursor: 'pointer' }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Choose a report to start — slim tiles, right under the hero */}
      <ReportStartCards mini />

      {/* Stat cards — real */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard accent="#3B52E0" label="Fiscal Year End" value={fiscalMonth} sub="Reporting period" />
        <StatCard accent="#7C3AED" label="Employees" value={employees} sub="Headcount" />
        <StatCard accent="#0F9D6B" label="Listed Exchange" value={exchange} sub="Market listing" />
        <StatCard accent="#E8A33D" label="Documents Indexed" value={String(docs.length)} sub="Source files" />
      </div>

      {/* What we learned | agents + documents */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* What we learned from your reports */}
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={CARD_TITLE}>What we learned from your reports</div>
            {styleReady && <span style={{ fontSize: 11, fontWeight: 700, color: '#3B52E0', background: '#ECEEFF', padding: '3px 10px', borderRadius: 20 }}>AI</span>}
          </div>
          <div style={{ height: 1, background: '#ECEEF8', margin: '16px 0' }} />

          {!styleReady ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
              <div className="proc-ring" style={{ width: 26, height: 26, borderWidth: 2.5, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1D2E' }}>Analysing your documents…</div>
                <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
                  We're reading your uploaded reports to learn their tone, themes and structure. This appears here shortly.
                </div>
              </div>
            </div>
          ) : (
            <>
              {company?.description && (
                <p style={{ fontSize: 13.5, color: '#3A3F58', lineHeight: 1.6, margin: '0 0 18px' }}>{company.description}</p>
              )}

              {tone && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', color: '#9BA3C4', textTransform: 'uppercase', marginBottom: 6 }}>Tone of voice</div>
                  <p style={{ fontSize: 13, color: '#3A3F58', lineHeight: 1.55, margin: 0 }}>{tone}</p>
                </div>
              )}

              {themeChips.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', color: '#9BA3C4', textTransform: 'uppercase', marginBottom: 8 }}>Key themes</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {themeChips.map((t) => (
                      <span key={t} style={{ fontSize: 12, fontWeight: 600, color: '#3B52E0', background: '#ECEEFF', padding: '5px 12px', borderRadius: 20 }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

            </>
          )}
        </div>

        {/* Right column: agents + documents */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {departments.length > 0 && (
            <div className="card" style={{ padding: '22px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={CARD_TITLE}>Your AI Agents</div>
                {isAdmin && <button type="button" onClick={() => navigate('/admin-console/departments')} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer' }}>Manage →</button>}
              </div>
              <div style={{ fontSize: 11.5, color: '#9BA3C4', marginBottom: 12 }}>{departments.length} agents trained on {companyName} context</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {departments.slice(0, 6).map((d, i) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i ? '1px solid #F4F5FA' : 'none' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: AGENT_COLORS[i % AGENT_COLORS.length], background: `${AGENT_COLORS[i % AGENT_COLORS.length]}14`, padding: '3px 7px', borderRadius: 6, flexShrink: 0 }}>
                      {(d.department_code || d.department_name || '?').slice(0, 3).toUpperCase()}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.department_name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#10B981', fontWeight: 600, flexShrink: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} /> Ready
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: '22px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={CARD_TITLE}>Your Documents</div>
              <button type="button" onClick={() => navigate('/docs')} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer' }}>View all →</button>
            </div>
            {docs.length === 0 ? (
              <div style={{ fontSize: 12.5, color: '#9BA3C4', padding: '8px 0' }}>
                No documents yet. <button type="button" onClick={() => navigate('/docs')} style={{ color: ACCENT, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Upload your reports →</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 6 }}>
                {docs.slice(0, 5).map((doc, i) => {
                  const sc = docStatusColor(doc.extraction_status);
                  return (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid #F4F5FA' : 'none' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: ACCENT, background: 'rgba(64,64,200,.1)', padding: '4px 6px', borderRadius: 6, textTransform: 'uppercase', flexShrink: 0 }}>{doc.file_type || 'doc'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.filename}>{doc.filename}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: sc.color, background: sc.bg, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 }}>{doc.extraction_status || 'processing'}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Next steps */}
      <div className="card" style={{ padding: '22px 24px' }}>
        <div style={CARD_TITLE}>Next steps</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
          {[
            { label: 'Review your company profile', dot: '#3B52E0', go: '/profile' },
            { label: 'Upload more documents', dot: '#E8A33D', go: '/docs' },
            ...(isAdmin ? [{ label: 'Invite your team', dot: '#0F9D6B', go: '/admin-console/users' }] : [{ label: 'View your leadership', dot: '#0F9D6B', go: '/stakeholders' }]),
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => navigate(q.go)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, fontWeight: 700, color: '#1A1D2E', background: '#fff', border: '1px solid #ECEEF8', borderRadius: 10, padding: '13px 14px', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: q.dot, flexShrink: 0 }} /> {q.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DashboardWorkspace;
