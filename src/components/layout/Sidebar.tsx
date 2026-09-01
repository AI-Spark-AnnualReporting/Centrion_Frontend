import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { SECTIONS, SECTION_KEYS } from '@/constants/spark-sections';
import { useFeatureAccess } from '@/lib/features';
import type { FeatureKey } from '@/constants/features';

// Sub-sections shown when the "Reports" item is expanded — mirrors the report
// generation flows offered on the Reports page. (ESG Validator lives under
// "Reports Validation" instead — see REPORTS_VALIDATION_CHILDREN below.)
const REPORT_CHILDREN: { key: string; label: string; path: string; featureKey: FeatureKey; end?: boolean; allowedRoles?: ('admin' | 'ir')[] }[] = [
  { key: 'quarterly', label: 'Quarterly', path: '/reports/quarterly', featureKey: 'quarterly_report' },
  { key: 'earnings', label: 'Earnings', path: '/earnings/setup', featureKey: 'earnings_report' },
  // Annual cycles are only managed in-app (admin/ir); every other role's
  // annual_report access lives in the spark_studio workspace app, reached via
  // the app switcher — not a per-item deep link.
  { key: 'annual', label: 'Annual', path: '/annual-report', featureKey: 'annual_report', allowedRoles: ['admin', 'ir'] },
  // The board-report builder. Its own top-level path rather than a child of
  // /annual-report, so opening it doesn't also light up "Annual" (that item
  // matches on prefix, and must keep matching /annual-report/cycles/...). Its
  // own feature key (board_report) — gated independently of Annual Report,
  // no role restriction (unlike annual, it's not admin/ir-only).
  { key: 'board', label: 'Board Report', path: '/board-report', featureKey: 'board_report' },
];

// Sub-sections shown when the "Reports Validator" item is expanded — the two
// validation/compliance-checking tools, kept separate from the report
// generation flows above so "Reports" isn't overloaded with unrelated tools.
const REPORTS_VALIDATION_CHILDREN: { key: string; label: string; path: string; featureKey: FeatureKey; end?: boolean }[] = [
  // `end` → highlight only on an exact /reports match, so this isn't also
  // "active" on /reports/quarterly (which startsWith('/reports')).
  { key: 'esg', label: 'ESG Validator', path: '/reports', featureKey: 'esg_validator', end: true },
  { key: 'compliance', label: 'Compliance Validation', path: '/compliance', featureKey: 'compliance_validation' },
];

// Sub-sections shown when the "Profile" item is expanded — User Profile
// (personal info) and Company Profile (company details + brand identity,
// merged in — see CompanyProfilePage). Both share the parent's "profile"
// featureKey, so no per-child filtering is needed here.
const PROFILE_CHILDREN: { key: string; label: string; path: string; end?: boolean }[] = [
  { key: 'user', label: 'User Profile', path: '/profile', end: true },
  { key: 'company', label: 'Company Profile', path: '/profile/company' },
];

// Admin Console sub-sections — mirror the pages under /admin-console. Shown only
// to admins as an expandable nav item (same pattern as Reports). `end` marks the
// index route so it's only "active" on an exact match.
// Overview isn't listed — clicking the "Admin Console" parent lands on it.
const ADMIN_CHILDREN: { key: string; label: string; path: string; end?: boolean }[] = [
  { key: 'users', label: 'Users & Roles', path: '/admin-console/users' },
  { key: 'departments', label: 'Departments', path: '/admin-console/departments' },
];

// Spark console sections — the lists at /spark/:section. Labels come from
// SECTIONS so the sidebar can't disagree with the page it opens.
const SPARK_CHILDREN = SECTION_KEYS.map((key) => ({
  key,
  label: SECTIONS[key].title,
  path: `/spark/${key}`,
}));

// Explicitly typed (like REPORT_CHILDREN / ADMIN_CHILDREN above) because only
// some items carry `adminOnly` — inferred, the array element would be a union
// and reading .adminOnly off it wouldn't compile.
const NAV_ITEMS: {
  section: string;
  items: {
    key: string;
    label: string;
    path: string;
    icon: string;
    badge: { cls: string; text: string } | null;
    adminOnly?: boolean;
    // Gated against visible_features (see useFeatureAccess). Items without
    // one (Profile, Upload Reports, Brand Identity) stay purely role-gated.
    featureKey?: FeatureKey;
  }[];
}[] = [
  {
    section: 'IR System',
    items: [
      { key: 'dashboard', label: 'Command Center', path: '/dashboard', icon: 'grid', badge: null, featureKey: 'command_center' },
      { key: 'reports', label: 'Reports', path: '/reports/quarterly', icon: 'doc', badge: null },
      { key: 'reportsValidation', label: 'Reports Validator', path: '/reports', icon: 'shield', badge: null },
      { key: 'kpi', label: 'KPI Normalizer', path: '/kpi', icon: 'chart', badge: null, featureKey: 'kpi_normalizer' },
      { key: 'ai', label: 'AI Copilot', path: '/ai', icon: 'chat', badge: null, featureKey: 'ai_copilot' },
    ],
  },
  {
    section: 'Stakeholders',
    items: [
      // The one calendar: board/investor meetings plus the derived disclosure
      // deadlines the separate "IR Calendar" item used to carry.
      { key: 'meetings', label: 'Board & Meetings', path: '/meetings', icon: 'calchk', badge: null, featureKey: 'board_meetings' },
      { key: 'stakeholders', label: 'Leadership', path: '/stakeholders', icon: 'people', badge: null, featureKey: 'leadership' },
      { key: 'comms', label: 'Communication Hub', path: '/comms', icon: 'mail', badge: null, featureKey: 'communication_hub' },
    ],
  },
  {
    section: 'Workspace',
    items: [
      { key: 'docs', label: 'Document Bank', path: '/docs', icon: 'file', badge: null, featureKey: 'document_bank' },
      { key: 'questions', label: 'Questions Bank', path: '/questions', icon: 'question', badge: null, featureKey: 'questions_bank' },
      // Expandable — see PROFILE_CHILDREN (User Profile / Company Profile,
      // the latter now including what used to be the standalone Brand
      // Identity page).
      { key: 'profile', label: 'Profile', path: '/profile', icon: 'user', badge: null, featureKey: 'profile' },
      // The onboarding upload step, reachable after the fact. Admin-only —
      // not part of the 16-feature catalogue, stays purely role-gated.
      { key: 'uploadReports', label: 'Upload Previous Reports', path: '/upload-reports', icon: 'file', badge: null, adminOnly: true },
    ],
  },
];

const icons: Record<string, JSX.Element> = {
  grid: <svg viewBox="0 0 13 13" fill="none"><rect x=".5" y=".5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/><rect x="7.5" y=".5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/><rect x=".5" y="7.5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/><rect x="7.5" y="7.5" width="5" height="5" rx=".7" stroke="currentColor" strokeWidth="1.2"/></svg>,
  doc: <svg viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M3.5 5h6M3.5 7.5h6M3.5 10h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  chart: <svg viewBox="0 0 13 13" fill="none"><path d="M1.5 9.5l3-3.5 2 2.5L9 5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>,
  shield: <svg viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L2 3.5v3.2c0 2.8 2 5 4.5 5.8 2.5-.8 4.5-3 4.5-5.8V3.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  chat: <svg viewBox="0 0 13 13" fill="none"><path d="M6.5 1C3.5 1 1 3.2 1 5.9c0 1.4.6 2.6 1.6 3.5L2 11l2.8-1.3c.6.2 1.1.3 1.7.3 3 0 5.5-2.2 5.5-4.9S9.5 1 6.5 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  mail: <svg viewBox="0 0 13 13" fill="none"><path d="M2 2h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4L2 11.5V3a1 1 0 0 1 0-.9z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>,
  people: <svg viewBox="0 0 13 13" fill="none"><circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/><circle cx="9" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/><path d="M1 11c0-1.7 1.3-3 3-3s3 1.3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M7.5 8.2c.4-.1.9-.2 1.5-.2 1.7 0 3 1.3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  file: <svg viewBox="0 0 13 13" fill="none"><path d="M2 1.5h6l3 3V12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2"/><path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1.2"/></svg>,
  question: <svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5.5C5 4.7 5.7 4 6.5 4S8 4.7 8 5.5c0 .6-.3 1.1-.8 1.4L7 7.5M7 9.5v.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  user: <svg viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M1.5 12c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  calchk: <svg viewBox="0 0 13 13" fill="none"><rect x="1" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1v2M9 1v2M1 5.5h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><path d="M4.6 8.6l1.3 1.3 2.5-2.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  brand: <svg viewBox="0 0 13 13" fill="none"><path d="M2.5 11.5V3a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 10.5 3v8.5l-4-2.2-4 2.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><circle cx="6.5" cy="5" r="1.4" stroke="currentColor" strokeWidth="1.2"/></svg>,
};

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isVisible } = useFeatureAccess();

  // Excludes the bare '/reports' path — that's ESG Validator's route, now
  // under "Reports Validator" below — but still covers /reports/quarterly.
  const reportsActive =
    location.pathname.startsWith('/reports/') || location.pathname.startsWith('/earnings');
  const [reportsOpen, setReportsOpen] = useState(reportsActive);

  const validationActive =
    location.pathname === '/reports' || location.pathname.startsWith('/compliance');
  const [validationOpen, setValidationOpen] = useState(validationActive);

  const adminActive = location.pathname.startsWith('/admin-console');
  const [adminOpen, setAdminOpen] = useState(adminActive);

  const profileActive = location.pathname.startsWith('/profile');
  const [profileOpen, setProfileOpen] = useState(profileActive);

  // Spark belongs to no company, so every item below reads a company off the
  // JWT that they don't have — the whole tenant nav is hidden for them and
  // replaced by the single Spark entry.
  const isSpark = user?.role === 'spark_admin';

  const handleNav = (path: string) => {
    navigate(path);
  };

  const visibleReportChildren = REPORT_CHILDREN.filter(
    (child) =>
      isVisible(child.featureKey) &&
      (!child.allowedRoles || (user && child.allowedRoles.includes(user.role as 'admin' | 'ir'))),
  );
  const visibleValidationChildren = REPORTS_VALIDATION_CHILDREN.filter((child) =>
    isVisible(child.featureKey),
  );

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const displayName = user?.full_name ?? 'Ahmad Al-Rashid';
  // Backend-resolved label, falling back to the raw role so a session stored
  // before the backend sent `display_role` still shows something.
  const displayRole = user?.display_role || user?.role || 'ESG Manager';
  const initials = (user?.full_name ?? 'AR')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <nav className="sb">
      <div className="sb-header">
        <div className="sb-logo">
          <div className="sb-lmark">
            <svg viewBox="0 0 14 14" fill="none" width="14" height="14">
              <rect x=".5" y=".5" width="5.5" height="5.5" rx="1" fill="white" />
              <rect x="8" y=".5" width="5.5" height="5.5" rx="1" fill="white" opacity=".4" />
              <rect x=".5" y="8" width="5.5" height="5.5" rx="1" fill="white" opacity=".4" />
              <rect x="8" y="8" width="5.5" height="5.5" rx="1" fill="white" />
            </svg>
          </div>
          <div>
            <div className="sb-lname">Centriyon</div>
          </div>
        </div>
      </div>
      {/* Sidebar search hidden until it's wired up. */}
      <div style={{ height: 10 }} />
      {(isSpark ? [] : NAV_ITEMS).map((section) => (
        <div key={section.section}>
          <div className="sb-sec">{section.section}</div>
          {section.items
            .filter((i) => !i.adminOnly || user?.role === 'admin')
            .filter((i) => !i.featureKey || isVisible(i.featureKey))
            .filter((i) => i.key !== 'reports' || visibleReportChildren.length > 0)
            .filter((i) => i.key !== 'reportsValidation' || visibleValidationChildren.length > 0)
            .map((item) =>
            item.key === 'reports' ? (
              <div key={item.key}>
                <button
                  className={`sb-item ${reportsActive && !reportsOpen ? 'act' : ''}`}
                  onClick={() => setReportsOpen((o) => !o)}
                  aria-expanded={reportsOpen}
                >
                  {icons[item.icon]}
                  {item.label}
                  <svg
                    viewBox="0 0 12 12"
                    width="11"
                    height="11"
                    fill="none"
                    style={{
                      marginLeft: 'auto',
                      flexShrink: 0,
                      opacity: 0.6,
                      transition: '.15s',
                      transform: reportsOpen ? 'rotate(180deg)' : 'none',
                    }}
                  >
                    <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {reportsOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {visibleReportChildren.map((child) => {
                      const childActive = child.end
                        ? location.pathname === child.path
                        : location.pathname.startsWith(child.path);
                      return (
                      <button
                        key={child.key}
                        className={`sb-item ${childActive ? 'act' : ''}`}
                        style={{ paddingLeft: 34, fontSize: 11 }}
                        onClick={() => handleNav(child.path)}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background: 'currentColor',
                            opacity: 0.45,
                            flexShrink: 0,
                          }}
                        />
                        {child.label}
                      </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : item.key === 'reportsValidation' ? (
              <div key={item.key}>
                <button
                  className={`sb-item ${validationActive && !validationOpen ? 'act' : ''}`}
                  onClick={() => setValidationOpen((o) => !o)}
                  aria-expanded={validationOpen}
                >
                  {icons[item.icon]}
                  {item.label}
                  <svg
                    viewBox="0 0 12 12"
                    width="11"
                    height="11"
                    fill="none"
                    style={{
                      marginLeft: 'auto',
                      flexShrink: 0,
                      opacity: 0.6,
                      transition: '.15s',
                      transform: validationOpen ? 'rotate(180deg)' : 'none',
                    }}
                  >
                    <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {validationOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {visibleValidationChildren.map((child) => {
                      const childActive = child.end
                        ? location.pathname === child.path
                        : location.pathname.startsWith(child.path);
                      return (
                        <button
                          key={child.key}
                          className={`sb-item ${childActive ? 'act' : ''}`}
                          style={{ paddingLeft: 34, fontSize: 11 }}
                          onClick={() => handleNav(child.path)}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: 'currentColor',
                              opacity: 0.45,
                              flexShrink: 0,
                            }}
                          />
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : item.key === 'profile' ? (
              <div key={item.key}>
                <button
                  className={`sb-item ${profileActive && !profileOpen ? 'act' : ''}`}
                  onClick={() => setProfileOpen((o) => !o)}
                  aria-expanded={profileOpen}
                >
                  {icons[item.icon]}
                  {item.label}
                  <svg
                    viewBox="0 0 12 12"
                    width="11"
                    height="11"
                    fill="none"
                    style={{
                      marginLeft: 'auto',
                      flexShrink: 0,
                      opacity: 0.6,
                      transition: '.15s',
                      transform: profileOpen ? 'rotate(180deg)' : 'none',
                    }}
                  >
                    <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {profileOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {PROFILE_CHILDREN.map((child) => {
                      const childActive = child.end
                        ? location.pathname === child.path
                        : location.pathname.startsWith(child.path);
                      return (
                        <button
                          key={child.key}
                          className={`sb-item ${childActive ? 'act' : ''}`}
                          style={{ paddingLeft: 34, fontSize: 11 }}
                          onClick={() => handleNav(child.path)}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: 'currentColor',
                              opacity: 0.45,
                              flexShrink: 0,
                            }}
                          />
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={item.key}
                className={`sb-item ${location.pathname === item.path ? 'act' : ''}`}
                onClick={() => handleNav(item.path)}
              >
                {icons[item.icon]}
                {item.label}
                {item.badge && <span className={`sb-badge ${item.badge.cls}`}>{item.badge.text}</span>}
              </button>
            ),
          )}
          {section.section !== 'Workspace' && <div className="sb-div" />}
        </div>
      ))}
      {user?.role === 'admin' && (
        <div>
          <div className="sb-div" />
          <div className="sb-sec">Admin</div>
          <button
            className={`sb-item ${
              location.pathname === '/admin-console' || (adminActive && !adminOpen)
                ? 'act'
                : ''
            }`}
            onClick={() => {
              handleNav('/admin-console');
              setAdminOpen(true);
            }}
            aria-expanded={adminOpen}
          >
            <svg viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.6 2.6l1.05 1.05M9.35 9.35l1.05 1.05M10.4 2.6L9.35 3.65M3.65 9.35L2.6 10.4"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            Admin Console
            <svg
              viewBox="0 0 12 12"
              width="11"
              height="11"
              fill="none"
              onClick={(e) => {
                e.stopPropagation();
                setAdminOpen((o) => !o);
              }}
              style={{
                marginLeft: 'auto',
                flexShrink: 0,
                opacity: 0.6,
                transition: '.15s',
                transform: adminOpen ? 'rotate(180deg)' : 'none',
              }}
            >
              <path d="M3 4.5L6 7.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {adminOpen && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {ADMIN_CHILDREN.map((child) => {
                const childActive = child.end
                  ? location.pathname === child.path
                  : location.pathname.startsWith(child.path);
                return (
                  <button
                    key={child.key}
                    className={`sb-item ${childActive ? 'act' : ''}`}
                    style={{ paddingLeft: 34, fontSize: 11 }}
                    onClick={() => handleNav(child.path)}
                  >
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'currentColor',
                        opacity: 0.45,
                        flexShrink: 0,
                      }}
                    />
                    {child.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {isSpark && (
        <div>
          <div className="sb-sec">Spark</div>
          {/* Overview first, then one child per list. Always expanded, unlike
              the Admin Console's collapsible block: this is the whole sidebar
              for a Spark user, and collapsing it would leave nothing at all. */}
          <button
            className={`sb-item ${location.pathname === '/spark' ? 'act' : ''}`}
            onClick={() => handleNav('/spark')}
          >
            {icons['grid']}
            Overview
          </button>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {SPARK_CHILDREN.map((child) => (
              <button
                key={child.key}
                className={`sb-item ${location.pathname === child.path ? 'act' : ''}`}
                style={{ paddingLeft: 34, fontSize: 11 }}
                onClick={() => handleNav(child.path)}
              >
                <span
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'currentColor',
                    opacity: 0.45,
                    flexShrink: 0,
                  }}
                />
                {child.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ flex: 1 }} />
      <div className="sb-div" />
      <div className="sb-user">
        <div className="sb-uav">{initials}</div>
        <div>
          <div className="sb-uname">{displayName}</div>
          <div className="sb-urole">{displayRole}</div>
        </div>
        <button className="sb-logout" onClick={handleLogout} type="button" aria-label="Log out" title="Log out">
          <svg viewBox="0 0 13 13" fill="none"><path d="M5 11H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2M8.5 8.5l3-2.5-3-2.5M11.5 6H5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    </nav>
  );
}
