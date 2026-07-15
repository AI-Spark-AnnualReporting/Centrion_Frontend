import { useEffect, useState } from 'react';
import { sarCycles, adminConsole } from '@/lib/api';
import type { ContentLanguage, CreateCyclePayload, Cycle } from '@/types/cycles';
import type { AdminUserRow } from '@/types/admin';

const PRIMARY = '#4040C8';

const WORKFLOW_STEPS = [
  'Admin creates the cycle — sets the name, fiscal year, dates, and assigns a Project Manager',
  'PM configures the cycle — writes the kickoff brief, adds department timelines, activates it',
  'Departments answer AI-generated questions — each department submits their narrative',
  'PM reviews & generates the final report',
];

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: '#1A1D2E',
        textTransform: 'uppercase',
        letterSpacing: '.4px',
        margin: '4px 0 12px',
      }}
    >
      {children}
    </div>
  );
}

// Collapsible "Create Reporting Cycle" card — mirrors the ESG Validator form on
// the Reports page. Sits above the cycles list; calls onCreated after a
// successful create so the parent can refresh the list.
export default function CycleForm({ onCreated }: { onCreated: (cycle: Cycle) => void }) {
  const [open, setOpen] = useState(true);

  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>('en');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');

  const [pms, setPms] = useState<AdminUserRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // YYYY-MM-DD in local time — used as the deadline input's `min` so past dates can't be picked
  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    // Company-scoped PMs via the Centriyon admin endpoint (the SAR endpoint
    // returned PMs across every company). These user IDs are shared with SAR,
    // so they're valid as the cycle's project_manager_id.
    adminConsole
      .listUsers({ role: 'project_manager' })
      .then((res: unknown) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray((res as { users?: AdminUserRow[] })?.users)
            ? (res as { users: AdminUserRow[] }).users
            : [];
        // Filter to PMs client-side too — the backend doesn't reliably honour
        // the ?role=project_manager query param (it returned admins as well).
        setPms(list.filter((u) => u.role === 'project_manager'));
      })
      .catch(() => setPms([]));
  }, []);

  // First empty required field, if any — drives the on-click validation message
  // so the button always does something instead of silently staying disabled.
  const missingField = (): string | null => {
    if (name.trim().length < 3) return 'Cycle Name (min 3 characters)';
    if (fiscalYear.trim() === '') return 'Fiscal Year';
    if (projectManagerId === '') return 'Project Manager';
    if (startDate === '') return 'Cycle Start Date';
    if (endDate === '') return 'Cycle End Date';
    if (submissionDeadline === '') return 'Submission Deadline';
    return null;
  };

  const reset = () => {
    setName('');
    setFiscalYear('');
    setContentLanguage('en');
    setProjectManagerId('');
    setStartDate('');
    setEndDate('');
    setSubmissionDeadline('');
  };

  const submit = async () => {
    if (busy) return;
    const missing = missingField();
    if (missing) {
      setErr(`${missing} is required.`);
      return;
    }
    if (submissionDeadline < today) {
      setErr('Submission Deadline must be today or later.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      const payload: CreateCyclePayload = {
        cycle_name: name.trim(),
        fiscal_year: parseInt(fiscalYear, 10),
        project_manager_id: projectManagerId,
        start_date: startDate,
        end_date: endDate,
        submission_deadline: submissionDeadline,
      };
      const cycle = await sarCycles.create(payload);
      reset();
      onCreated(cycle);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to create cycle.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 16, overflow: 'hidden' }}>
      {/* Header — collapsible, mirrors the ESG Validator card */}
      <div
        style={{
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          cursor: 'pointer',
          borderBottom: open ? '1px solid #ECEEF8' : 'none',
        }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="white" strokeWidth="1.3" />
              <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E' }}>Create Reporting Cycle</div>
            <div style={{ fontSize: 11, color: '#5A6080' }}>Define the cycle, assign a Project Manager, and set the timeline</div>
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: '.2s', marginTop: 4 }}>
          <path d="M3 5l4 4 4-4" stroke="#5A6080" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {open && (
        <div style={{ padding: '18px 20px' }}>
          {/* Workflow explainer */}
          <div
            style={{
              background: 'rgba(64,64,200,.05)',
              border: '1px solid rgba(64,64,200,.18)',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 800, color: PRIMARY, marginBottom: 6 }}>How the cycle workflow works</div>
            <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {WORKFLOW_STEPS.map((s, i) => (
                <li key={i} style={{ fontSize: 11, color: '#3A3F5C', lineHeight: 1.5 }}>{s}</li>
              ))}
            </ol>
          </div>

          {/* Cycle Information */}
          <GroupHeading>Cycle Information</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr', gap: 12, marginBottom: 18 }}>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Cycle Name *</label>
              <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. FY2025 Annual Report" />
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Fiscal Year *</label>
              <input className="inp" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} placeholder="2026" />
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Content Language *</label>
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button type="button" className={`tab ${contentLanguage === 'en' ? 'act' : ''}`} onClick={() => setContentLanguage('en')}>English</button>
                <button type="button" className={`tab ${contentLanguage === 'ar' ? 'act' : ''}`} onClick={() => setContentLanguage('ar')}>العربية</button>
              </div>
            </div>
          </div>

          {/* Assign PM */}
          <GroupHeading>Assign Project Manager</GroupHeading>
          <div className="fl" style={{ marginBottom: 18 }}>
            <label className="fl-label">Project Manager *</label>
            <select className="inp sel" value={projectManagerId} onChange={(e) => setProjectManagerId(e.target.value)}>
              <option value="">Select a Project Manager</option>
              {pms.map((pm) => {
                const id = pm.user_id || pm.id;
                return (
                  <option key={id} value={id}>{pm.full_name}</option>
                );
              })}
            </select>
          </div>

          {/* Timeline */}
          <GroupHeading>Timeline</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Cycle Start Date *</label>
              <input
                className="inp"
                type="date"
                value={startDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setStartDate(v);
                  // Downstream dates can't precede the new start — clear them
                  // instead of leaving a now-invalid value in place.
                  if (endDate && endDate < v) setEndDate('');
                  if (submissionDeadline && submissionDeadline < v) setSubmissionDeadline('');
                }}
              />
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Cycle End Date *</label>
              <input
                className="inp"
                type="date"
                min={startDate || undefined}
                value={endDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v && startDate && v < startDate) return;
                  setEndDate(v);
                  if (submissionDeadline && v && submissionDeadline < v) setSubmissionDeadline('');
                }}
              />
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Submission Deadline *</label>
              <input
                className="inp"
                type="date"
                min={endDate && endDate > today ? endDate : today}
                value={submissionDeadline}
                onChange={(e) => {
                  const v = e.target.value;
                  const floor = endDate && endDate > today ? endDate : today;
                  setSubmissionDeadline(v && v < floor ? '' : v);
                }}
              />
            </div>
          </div>

          {/* Reporting sector + company profile (listed/private, Shariah,
              subsidiaries, sukuk) are set once at onboarding and the cycle
              inherits them from the company — no longer collected here. */}

          {err && <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: 12 }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            {/* Stays enabled; submit() reports the first missing field so the
                click is never a silent no-op. */}
            <button className="btn bp" type="button" onClick={submit} disabled={busy}>
              {busy ? 'Creating…' : 'Create Cycle'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
