import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sarCycles, sarUsers, getSectors } from '@/lib/api';
import type { Sector } from '@/types/company';
import type { ContentLanguage, CreateCyclePayload, SARUser } from '@/types/cycles';
import { COMPANY_PROFILE_OPTIONS } from '@/types/cycles';

const PRIMARY = '#4040C8';

const WORKFLOW_STEPS = [
  'Admin creates the cycle — sets the name, fiscal year, dates, and assigns a Project Manager',
  'PM configures the cycle — writes the kickoff brief, adds department timelines, activates it',
  'Departments answer AI-generated questions — each department submits their narrative',
  'PM reviews & generates the final report',
];

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 18, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: subtitle ? 2 : 14 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>{title}</h2>
      </div>
      {subtitle && <p style={{ fontSize: 11, color: '#9BA3C4', marginBottom: 14 }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function FlagToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1.5px solid ${value ? PRIMARY : '#E2E4F0'}`,
        background: value ? '#EEEEFF' : '#fff',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        color: value ? PRIMARY : '#5A6080',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 5,
          flexShrink: 0,
          border: value ? 'none' : '1.5px solid #C9CDE4',
          background: value ? PRIMARY : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );
}

export default function CreateCyclePage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>('en');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [companyProfile, setCompanyProfile] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [shariah, setShariah] = useState(false);
  const [subsidiaries, setSubsidiaries] = useState(false);
  const [sukuk, setSukuk] = useState(false);

  const [pms, setPms] = useState<SARUser[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    sarUsers.listProjectManagers().then(setPms).catch(() => setPms([]));
    getSectors().then(setSectors).catch(() => setSectors([]));
  }, []);

  const canSubmit =
    name.trim() !== '' &&
    fiscalYear.trim() !== '' &&
    !!contentLanguage &&
    projectManagerId !== '' &&
    startDate !== '' &&
    endDate !== '' &&
    submissionDeadline !== '' &&
    companyProfile !== '' &&
    sectorId !== '';

  const submit = async () => {
    if (busy || !canSubmit) return;
    setErr('');
    setBusy(true);
    try {
      const payload: CreateCyclePayload = {
        name: name.trim(),
        fiscal_year: parseInt(fiscalYear, 10),
        content_language: contentLanguage,
        project_manager_id: projectManagerId,
        cycle_start_date: startDate,
        cycle_end_date: endDate,
        submission_deadline: submissionDeadline,
        company_profile: companyProfile,
        sector_id: sectorId,
        is_shariah_compliant: shariah,
        has_subsidiaries: subsidiaries,
        has_sukuk: sukuk,
      };
      const cycle = await sarCycles.create(payload);
      navigate(`/annual-report/cycles/${cycle.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create cycle.');
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => navigate('/annual-report')}
          aria-label="Back"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#5A6080', fontSize: 18 }}
        >
          ←
        </button>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1A1D2E' }}>Create New Reporting Cycle</h1>
          <p style={{ fontSize: 12, color: '#5A6080', marginTop: 2 }}>
            Define the cycle, assign a Project Manager, and set the timeline.
          </p>
        </div>
      </div>

      {/* Workflow explainer */}
      <div
        style={{
          background: 'rgba(64,64,200,.05)',
          border: '1px solid rgba(64,64,200,.18)',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 800, color: PRIMARY, marginBottom: 8 }}>
          How the cycle workflow works
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {WORKFLOW_STEPS.map((s, i) => (
            <li key={i} style={{ fontSize: 11.5, color: '#3A3F5C', lineHeight: 1.5 }}>{s}</li>
          ))}
        </ol>
      </div>

      {/* Cycle Information */}
      <SectionCard icon="📄" title="Cycle Information">
        <div className="fl">
          <label className="fl-label">Cycle Name *</label>
          <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY2025 Annual Report" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="fl" style={{ marginBottom: 0 }}>
            <label className="fl-label">Fiscal Year *</label>
            <input className="inp" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2026" />
          </div>
          <div className="fl" style={{ marginBottom: 0 }}>
            <label className="fl-label">Content Language</label>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button type="button" className={`tab ${contentLanguage === 'en' ? 'act' : ''}`} onClick={() => setContentLanguage('en')}>
                English
              </button>
              <button type="button" className={`tab ${contentLanguage === 'ar' ? 'act' : ''}`} onClick={() => setContentLanguage('ar')}>
                العربية
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Assign Project Manager */}
      <SectionCard
        icon="👥"
        title="Assign Project Manager"
        subtitle="The PM will log in to write the kickoff brief, assign teams, and track department progress."
      >
        <div className="fl" style={{ marginBottom: 0 }}>
          <label className="fl-label">Project Manager *</label>
          <select className="inp sel" value={projectManagerId} onChange={(e) => setProjectManagerId(e.target.value)}>
            <option value="">Select a Project Manager</option>
            {pms.map((pm) => (
              <option key={pm.id ?? pm.user_id} value={pm.user_id}>
                {pm.full_name}
              </option>
            ))}
          </select>
        </div>
      </SectionCard>

      {/* Timeline */}
      <SectionCard
        icon="📅"
        title="Timeline"
        subtitle="Set the overall reporting period. The PM can further define per-department deadlines after activation."
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="fl" style={{ marginBottom: 0 }}>
            <label className="fl-label">Cycle Start Date *</label>
            <input className="inp" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="fl" style={{ marginBottom: 0 }}>
            <label className="fl-label">Cycle End Date *</label>
            <input className="inp" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="fl" style={{ marginBottom: 0 }}>
            <label className="fl-label">Submission Deadline *</label>
            <input className="inp" type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      {/* Company Profile */}
      <SectionCard icon="🏢" title="Company Profile" subtitle="These determine which sections your report requires.">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="fl" style={{ marginBottom: 0 }}>
            <label className="fl-label">Company Profile *</label>
            <select className="inp sel" value={companyProfile} onChange={(e) => setCompanyProfile(e.target.value)}>
              <option value="">Select a company profile</option>
              {COMPANY_PROFILE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="fl" style={{ marginBottom: 0 }}>
            <label className="fl-label">Sector *</label>
            <select className="inp sel" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">Select a sector</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <FlagToggle label="Shariah-compliant" value={shariah} onChange={setShariah} />
          <FlagToggle label="Has subsidiaries" value={subsidiaries} onChange={setSubsidiaries} />
          <FlagToggle label="Has sukuk" value={sukuk} onChange={setSukuk} />
        </div>
      </SectionCard>

      {err && (
        <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginBottom: 12 }}>
          {err}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn bs" type="button" onClick={() => navigate('/annual-report')}>
          Cancel
        </button>
        <button className="btn bp" type="button" onClick={submit} disabled={busy || !canSubmit}>
          {busy ? 'Creating…' : 'Create Cycle'}
        </button>
      </div>
    </div>
  );
}
