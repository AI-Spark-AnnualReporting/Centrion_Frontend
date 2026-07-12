import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminConsole, companies as companiesApi, documents as documentsApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { Company } from '@/types/company';
import type { Department } from '@/types/admin';
import { CYCLE_SECTOR_OPTIONS } from '@/types/cycles';
import { DisclosureTimeline } from '@/components/dashboard/DisclosureTimeline';
import { KpiCards } from '@/components/dashboard/KpiCards';
import { ActiveReportsCard } from '@/components/dashboard/ActiveReportsCard';
import { BoardMeetingsCard } from '@/components/dashboard/BoardMeetingsCard';
import { ShareholderCommsCard } from '@/components/dashboard/ShareholderCommsCard';
import { ComplianceSnapshotCard } from '@/components/dashboard/ComplianceSnapshotCard';
import { EsgComparisonsCard } from '@/components/dashboard/EsgComparisonsCard';
import { AskCopilotCard } from '@/components/dashboard/AskCopilotCard';

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

// Key-highlight categories → icon + colours. The backend tags each highlight with one of
// these categories (unknown → 'strategy'); the frontend owns the icon/colour for consistency.
const HIGHLIGHT_STYLE: Record<string, { icon: string; color: string; bg: string }> = {
  financial: { icon: '📈', color: '#0F9D6B', bg: '#E7F7F0' },
  esg: { icon: '🌱', color: '#0D9488', bg: '#E2F6F3' },
  governance: { icon: '🏛️', color: '#4040C8', bg: '#ECEEFF' },
  compliance: { icon: '⚠️', color: '#B45309', bg: '#FDF3E2' },
  strategy: { icon: '🎯', color: '#7C3AED', bg: '#F1ECFE' },
};
const HIGHLIGHT_FALLBACK = { icon: '•', color: '#5A6080', bg: '#F1F2F8' };

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
  // Report-style extraction runs in the background after onboarding; these drive the
  // "wait for it to land" poll so the card never spins forever.
  const [stylePollDone, setStylePollDone] = useState(false); // budget elapsed without report_tone
  const [styleRetry, setStyleRetry] = useState(0);           // bump to restart the poll

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
  // being processed in the background, so they're absent on first render. Poll with a
  // slow backoff for up to a few minutes (large reports + the LLM can be slow),
  // updating company + docs live (no reload). If the budget elapses without
  // report_tone, flip to a soft "taking longer" state instead of spinning forever.
  useEffect(() => {
    if (!companyId || companyProp?.report_tone) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    const MAX_WAIT_MS = 4 * 60 * 1000;
    setStylePollDone(false);
    const nextDelay = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 30_000) return 3000;   // snappy for the first 30s
      if (elapsed < 90_000) return 6000;   // then ease off
      return 12000;                        // slow heartbeat
    };
    const tick = () => {
      Promise.allSettled([
        companiesApi.getMyCompany(),
        documentsApi.list<{ documents?: WorkspaceDoc[] }>(companyId),
      ]).then(([c, d]) => {
        if (cancelled) return;
        const fresh = c.status === 'fulfilled' ? c.value : null;
        if (fresh) setCompany(fresh);
        if (d.status === 'fulfilled') setDocs(d.value?.documents ?? []);
        if (fresh?.report_tone) return;                                  // done — styleReady flips
        if (Date.now() - startedAt >= MAX_WAIT_MS) { setStylePollDone(true); return; }
        timer = setTimeout(tick, nextDelay());
      });
    };
    timer = setTimeout(tick, nextDelay());
    return () => { cancelled = true; clearTimeout(timer); };
  }, [companyId, companyProp?.report_tone, styleRetry]);

  // "Check again" from the card's taking-longer state: re-check now and restart the poll.
  const recheckStyle = () => {
    setStylePollDone(false);
    setStyleRetry((n) => n + 1);
    if (companyId) companiesApi.getMyCompany().then(setCompany).catch(() => {});
  };

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

  const fiscalMonth = company?.fiscal_year_end_month ? MONTHS[company.fiscal_year_end_month - 1] : '—';
  const employees = company?.employee_count ? company.employee_count.toLocaleString() : '—';
  const exchange = company?.listed_exchange || 'Not listed';

  const tone = company?.report_tone ?? null;
  // Themes are stored as {name, explanation}; the dashboard shows only the names.
  const themeChips = (company?.report_theme ?? []).map((t) => t.name).filter(Boolean);
  const styleReady = Boolean(tone || themeChips.length);

  const frameworks = company?.esg_frameworks ?? [];
  const highlights = company?.report_highlights ?? [];

  const subParts: string[] = [];
  if (departments.length) subParts.push(`${departments.length} department${departments.length === 1 ? '' : 's'} active`);
  if (docs.length) subParts.push(`${docs.length} document${docs.length === 1 ? '' : 's'} indexed`);
  const subline = subParts.length ? subParts.join('  ·  ') : 'Your workspace is being set up.';

  // Company profile "fact sheet" — each field is added only when it has a value, so
  // the hero panel is rich for a fully-filled company and stays tidy for a sparse one.
  const LANG_LABELS: Record<string, string> = { en: 'English', ar: 'Arabic' };
  const OWNERSHIP_LABELS: Record<string, string> = { listed: 'Listed', private: 'Private' };
  // Each fact gets a dot in a rotating accent colour.
  const DOT_COLORS = ['#4ADE80', '#5EEAD4', '#818CF8', '#FCD34D', '#F87171', '#C4B5FD', '#38BDF8', '#FB923C'];
  const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
  const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const reportingSectorLabel = CYCLE_SECTOR_OPTIONS.find((s) => s.value === company?.reporting_sector)?.label ?? null;

  // Ordered most→least important so that, if a company has more fields than the
  // card should hold, the least-important ones (Website / Reporting Sector /
  // Exchange) drop off via the slice below.
  const facts: { label: string; value: React.ReactNode }[] = [];
  if (company?.company_profile) facts.push({ label: 'Ownership', value: OWNERSHIP_LABELS[company.company_profile] ?? titleCase(company.company_profile) });
  if (company?.jurisdiction) facts.push({ label: 'Jurisdiction', value: company.jurisdiction });
  if (company?.headquarter_city) facts.push({ label: 'Headquarters', value: titleCase(company.headquarter_city) });
  if (company?.founded_year) facts.push({ label: 'Founded', value: company.founded_year });
  if (company?.employee_count) facts.push({ label: 'Employees', value: company.employee_count.toLocaleString() });
  if (company?.sector_name) facts.push({ label: 'Sector', value: company.sector_name });
  if (company?.reporting_currency) facts.push({ label: 'Currency', value: company.reporting_currency });
  if (company?.primary_language) facts.push({ label: 'Language', value: LANG_LABELS[company.primary_language] ?? company.primary_language });
  if (company?.fiscal_year_end_month) facts.push({ label: 'Fiscal Year End', value: MONTHS[company.fiscal_year_end_month - 1] });
  if (company?.listed_exchange) facts.push({ label: 'Exchange', value: company.listed_exchange });
  if (reportingSectorLabel) facts.push({ label: 'Reporting Sector', value: reportingSectorLabel });
  // Website is NOT in this list — it renders on the left identity column (with a
  // globe glyph) rather than as a dotted fact row.
  // The hero sits in a narrower-but-taller top-row slot (beside the Disclosure
  // Timeline), so there's room to show every fact as one vertical column.

  const flags: string[] = [];
  if (company?.is_shariah) flags.push('Shariah-compliant');
  if (company?.has_sukuk) flags.push('Sukuk');
  if (company?.has_subsidiaries) flags.push('Subsidiaries');

  // Fill the hero's empty left column: the last 3 facts + the flag pills sit under the
  // website (left); the rest stay in the right column. Dot colours stay keyed to each
  // fact's ORIGINAL index so nothing recolours.
  const RIGHT_COUNT = Math.max(0, facts.length - 3);
  const rightFacts = facts.slice(0, RIGHT_COUNT);
  const leftFacts = facts.slice(RIGHT_COUNT);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top row — company hero (left, ~60%) + disclosure timeline (right, ~40%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 20, alignItems: 'stretch' }}>
        {/* Hero — company workspace masthead (reshaped: narrower + taller, stacked) */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, padding: '26px 28px', color: '#fff', background: 'linear-gradient(135deg, #4A47D4 0%, #3736AE 55%, #2E2D93 100%)', boxShadow: '0 18px 40px rgba(53,53,181,.28)' }}>
          {/* Soft depth glows */}
          <div style={{ position: 'absolute', top: -70, right: -50, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,.16), transparent 70%)' }} />
          <div style={{ position: 'absolute', bottom: -100, left: -30, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.4), transparent 70%)' }} />
          {/* Split: identity (left) · metadata list + pills as a right-aligned block */}
          <div style={{ position: 'relative', display: 'flex', height: '100%', gap: 28, alignItems: 'flex-start' }}>
            {/* Left — identity: name, status, website */}
            <div style={{ flex: '0 0 40%', minWidth: 0 }}>
              <div>
                <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.6px', lineHeight: 1.12, margin: 0, textShadow: '0 2px 12px rgba(15,15,50,.2)', overflowWrap: 'break-word' }}>
                  {company?.name || companyName}
                </h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12, fontSize: 12.5, fontWeight: 500, opacity: 0.92 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 0 3px rgba(74,222,128,.25)', flexShrink: 0 }} />
                  <span>{subline}</span>
                </div>
                {company?.website_url && (
                  <a
                    href={company.website_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="7" cy="7" r="5.6" stroke="rgba(255,255,255,.75)" strokeWidth="1.3" />
                      <path d="M1.4 7h11.2M7 1.4c1.7 1.6 2.5 3.5 2.5 5.6S8.7 11 7 12.6C5.3 11 4.5 9.1 4.5 7S5.3 3 7 1.4z" stroke="rgba(255,255,255,.75)" strokeWidth="1.3" strokeLinejoin="round" />
                    </svg>
                    <span style={{ borderBottom: '1px solid rgba(255,255,255,.4)', paddingBottom: 1 }}>{hostOf(company.website_url)}</span>
                  </a>
                )}
              </div>

              {/* Moved from the right column to fill the left space: last 3 facts + pills */}
              {(leftFacts.length > 0 || flags.length > 0) && (
                <div style={{ marginTop: 22 }}>
                  {leftFacts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', rowGap: 11 }}>
                      {leftFacts.map((f, j) => {
                        const idx = RIGHT_COUNT + j;
                        return (
                          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT_COLORS[idx % DOT_COLORS.length], boxShadow: `0 0 0 3px ${DOT_COLORS[idx % DOT_COLORS.length]}40`, flexShrink: 0 }} />
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', minWidth: 130, flexShrink: 0 }}>{f.label}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>{f.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {flags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                      {flags.map((fl) => (
                        <span key={fl} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.16)', padding: '3px 10px', borderRadius: 20 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80' }} />
                          {fl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right — remaining facts, right-aligned single column */}
            {rightFacts.length > 0 && (
              <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
                {/* Start the list around the vertical middle of the company name. */}
                <div style={{ display: 'flex', flexDirection: 'column', rowGap: 11, marginTop: 18 }}>
                  {rightFacts.map((f, i) => (
                    <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT_COLORS[i % DOT_COLORS.length], boxShadow: `0 0 0 3px ${DOT_COLORS[i % DOT_COLORS.length]}40`, flexShrink: 0 }} />
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.4px', textTransform: 'uppercase', color: 'rgba(255,255,255,.45)', minWidth: 130, flexShrink: 0 }}>{f.label}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>{f.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Disclosure timeline — read-only upcoming deadlines / meetings / milestones */}
        <DisclosureTimeline company={company} />
      </div>

      {/* KPI row — Revenue / Net Profit / ESG Score / Disclosure Index (honest: real data or "not enough data yet") */}
      <KpiCards company={company} />

      {/* Row A — Active Reports · Board Meetings · Shareholder Comms */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <ActiveReportsCard />
        <BoardMeetingsCard />
        <ShareholderCommsCard />
      </div>

      {/* Row B — Compliance Snapshot (left) | ESG Comparisons + Ask Copilot (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 16, alignItems: 'stretch' }}>
        <ComplianceSnapshotCard />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <EsgComparisonsCard />
          <AskCopilotCard />
        </div>
      </div>

      {/* Stat cards — real */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <StatCard accent="#3B52E0" label="Fiscal Year End" value={fiscalMonth} sub="Reporting period" />
        <StatCard accent="#7C3AED" label="Employees" value={employees} sub="Headcount" />
        <StatCard accent="#0F9D6B" label="Listed Exchange" value={exchange} sub="Market listing" />
        <StatCard accent="#E8A33D" label="Documents Indexed" value={String(docs.length)} sub="Source files" />
      </div>

      {/* Content row — description (left) | documents + frameworks (right), aligned fixed height + internal scroll */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: 16, height: 440 }}>
        {/* What we learned */}
        <div className="card" style={{ padding: '22px 24px', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={CARD_TITLE}>What we learned from your reports</div>
            {styleReady && <span style={{ fontSize: 11, fontWeight: 700, color: '#3B52E0', background: '#ECEEFF', padding: '3px 10px', borderRadius: 20 }}>AI</span>}
          </div>
          <div style={{ height: 1, background: '#ECEEF8', margin: '14px 0' }} />
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 6 }}>
            {!styleReady ? (
              stylePollDone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '6px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: '#FDF3E2' }}>⏳</span>
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1D2E' }}>This is taking longer than usual</div>
                      <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2, lineHeight: 1.55 }}>
                        Large reports can take a few minutes to analyse. You can keep working — the summary appears here automatically once it's ready.
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={recheckStyle} style={{ alignSelf: 'flex-start', fontSize: 12, fontWeight: 700, color: ACCENT, background: '#ECEEFF', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}>Check again</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
                  <div className="proc-ring" style={{ width: 26, height: 26, borderWidth: 2.5, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1A1D2E' }}>Analysing your documents…</div>
                    <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 2 }}>
                      We're reading your uploaded reports to learn their tone, themes and structure. This appears here shortly.
                    </div>
                  </div>
                </div>
              )
            ) : (
              <>
                {company?.description && (
                  <p style={{ fontSize: 13.5, color: '#3A3F58', lineHeight: 1.65, margin: '0 0 18px' }}>{company.description}</p>
                )}
                {themeChips.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', color: '#9BA3C4', textTransform: 'uppercase', marginBottom: 8 }}>Key themes</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {themeChips.map((t) => (
                        <span key={t} style={{ fontSize: 12, fontWeight: 600, color: '#3B52E0', background: '#ECEEFF', padding: '5px 12px', borderRadius: 20 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {highlights.length > 0 && (
                  <div style={{ marginTop: (company?.description || themeChips.length) ? 20 : 0 }}>
                    <div style={{ height: 1, background: '#ECEEF8', margin: '0 0 14px' }} />
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.6px', color: '#9BA3C4', textTransform: 'uppercase', marginBottom: 12 }}>Key highlights</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                      {highlights.map((h, i) => {
                        const s = HIGHLIGHT_STYLE[h.category] ?? HIGHLIGHT_FALLBACK;
                        return (
                          <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                            <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: s.bg, border: `1px solid ${s.color}22` }}>{s.icon}</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#3A3F58', lineHeight: 1.5, paddingTop: 5 }}>{h.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Documents (top) + Regulatory Frameworks (bottom) — stacked, scroll internally */}
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          <div className="card" style={{ padding: '18px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={CARD_TITLE}>Your Documents</div>
              <button type="button" onClick={() => navigate('/docs')} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer' }}>View all →</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {docs.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#9BA3C4', padding: '8px 0' }}>
                  No documents yet. <button type="button" onClick={() => navigate('/docs')} style={{ color: ACCENT, fontWeight: 700, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Upload your reports →</button>
                </div>
              ) : (
                docs.map((doc, i) => {
                  const sc = docStatusColor(doc.extraction_status);
                  return (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i ? '1px solid #F4F5FA' : 'none' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: ACCENT, background: 'rgba(64,64,200,.1)', padding: '4px 6px', borderRadius: 6, textTransform: 'uppercase', flexShrink: 0 }}>{doc.file_type || 'doc'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#1A1D2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.filename}>{doc.filename}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: sc.color, background: sc.bg, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.4px', flexShrink: 0 }}>{doc.extraction_status || 'processing'}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {frameworks.length > 0 && (
            <div className="card" style={{ padding: '18px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginBottom: 6 }}>
                <div style={CARD_TITLE}>⚖️ Regulatory Frameworks</div>
                <div style={{ fontSize: 11.5, color: '#9BA3C4', marginTop: 2 }}>Referenced in your ESG report</div>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {frameworks.map((f, i) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderTop: i ? '1px solid #F4F5FA' : 'none', fontSize: 13, color: '#1A1D2E', fontWeight: 600 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                    {f}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Your Departments — full width, below the content row */}
      {departments.length > 0 && (
        <div className="card" style={{ padding: '22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={CARD_TITLE}>Your Departments</div>
              <div style={{ fontSize: 11.5, color: '#9BA3C4', marginTop: 2 }}>{departments.length} departments configured for {companyName}</div>
            </div>
            {isAdmin && <button type="button" onClick={() => navigate('/admin-console/departments')} style={{ fontSize: 12, fontWeight: 700, color: ACCENT, background: 'transparent', border: 'none', cursor: 'pointer' }}>Manage →</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10, marginTop: 14 }}>
            {departments.map((d, i) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #ECEEF8', borderRadius: 10, padding: '11px 13px' }}>
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

    </div>
  );
}

export default DashboardWorkspace;
