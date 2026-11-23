import { useEffect, useRef, useState } from 'react';
import { sarCycles, adminConsole, companies } from '@/lib/api';
import { useLicenseRoom } from '@/components/license/useLicenseRoom';
import { LimitHint } from '@/components/license/LimitHint';
import { useAuth } from '@/context/AuthContext';
import { YearPicker } from '@/components/shared/YearPicker';
import { getYearRange, isYearInRange } from '@/lib/yearRange';
import { formatFiscalPeriod, getFiscalPeriod } from '@/lib/fiscalPeriod';
import type { ContentLanguage, CreateCyclePayload, Cycle } from '@/types/cycles';
import type { AdminUserRow } from '@/types/admin';

const PRIMARY = '#4040C8';

const WORKFLOW_STEPS = [
  'Admin creates the cycle — sets the name, fiscal year, deadline, and assigns a Project Manager',
  'PM configures the cycle — writes the kickoff brief, adds department timelines, activates it',
  'Department lead curates & reviews — refines the AI-generated questions for their department and reviews each answer',
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
  // Collapsed on arrival: creating a cycle is the rare action, reading the
  // list below is the common one, and expanded this card pushes the list off
  // the first screen.
  const [open, setOpen] = useState(false);

  const [name, setName] = useState('');
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>('english');
  // Spark staff run the cycles they create for a client, so they are the PM by
  // default. Client PMs stay in the list below — this is a starting point, not a
  // lock. Every other role opens on the placeholder exactly as before.
  const { user } = useAuth();
  const isSpark = user?.role === 'spark_internal';
  const [projectManagerId, setProjectManagerId] = useState(
    isSpark ? (user?.user_id ?? '') : '',
  );
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  // The company's fiscal year-end month (from onboarding). The cycle's start/end
  // dates are no longer asked for — they are filled with the fiscal period of the
  // picked year (the DB still requires them; nothing downstream reads them).
  // undefined = still loading, null = unknown (falls back to December).
  const [yearEndMonth, setYearEndMonth] = useState<number | null | undefined>(undefined);
  const companyRequested = useRef(false);

  const [pms, setPms] = useState<AdminUserRow[]>([]);
  const [busy, setBusy] = useState(false);
  // License: every new cycle counts as one annual report.
  const annualRoom = useLicenseRoom('annual', 'Annual Reports');
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

  // Load the fiscal year-end month once, the first time the card is opened —
  // not on page load, so the cycles list doesn't pay for it.
  useEffect(() => {
    if (!open || companyRequested.current) return;
    companyRequested.current = true;
    companies
      .getMyCompany()
      .then((company) => setYearEndMonth(company?.fiscal_year_end_month ?? null))
      .catch(() => setYearEndMonth(null));
  }, [open]);

  // The fiscal period of the picked year, e.g. 1 Jul 2024 – 30 Jun 2025.
  const fiscalPeriod = fiscalYear !== null ? getFiscalPeriod(fiscalYear, yearEndMonth) : null;

  // First empty required field, if any — drives the on-click validation message
  // so the button always does something instead of silently staying disabled.
  const missingField = (): string | null => {
    if (name.trim().length < 3) return 'Cycle Name (min 3 characters)';
    if (fiscalYear === null) return 'Fiscal Year';
    if (projectManagerId === '') return 'Project Manager';
    if (submissionDeadline === '') return 'Submission Deadline';
    return null;
  };

  const reset = () => {
    setName('');
    setFiscalYear(null);
    setContentLanguage('english');
    setProjectManagerId('');
    setSubmissionDeadline('');
  };

  const submit = async () => {
    if (busy) return;
    const missing = missingField();
    if (missing || fiscalYear === null) {
      setErr(`${missing ?? 'Fiscal Year'} is required.`);
      return;
    }
    // The picker only offers this year ± 10, so this is a safety net only.
    if (!isYearInRange(fiscalYear)) {
      const years = getYearRange();
      setErr(`Fiscal Year must be between ${years[0]} and ${years[years.length - 1]}.`);
      return;
    }
    if (submissionDeadline < today) {
      setErr('Submission Deadline must be today or later.');
      return;
    }
    setErr('');
    setBusy(true);
    try {
      // Falls back to a December year-end if the company couldn't be loaded.
      const period = getFiscalPeriod(fiscalYear, yearEndMonth);
      const payload: CreateCyclePayload = {
        cycle_name: name.trim(),
        fiscal_year: fiscalYear,
        project_manager_id: projectManagerId,
        start_date: period.startDate,
        end_date: period.endDate,
        submission_deadline: submissionDeadline,
        content_language: contentLanguage,
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
        role="button"
        tabIndex={0}
        aria-expanded={open}
        // Now that the card starts closed this header is the ONLY way into the
        // form, so it has to work without a mouse. Enter and Space both toggle,
        // and Space has its page-scroll default suppressed.
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
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
            <div style={{ fontSize: 11, color: '#5A6080' }}>Define the cycle, assign a Project Manager, and set the deadline</div>
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
              <label className="fl-label" htmlFor="cycle-fiscal-year">Fiscal Year *</label>
              <YearPicker id="cycle-fiscal-year" value={fiscalYear} onChange={setFiscalYear} />
              {/* Shows what the picked year means for THIS company's fiscal calendar.
                  Waits for the company so it never flashes a wrong (December) period. */}
              {fiscalPeriod && yearEndMonth !== undefined && (
                <div style={{ fontSize: 11, color: '#5A6080', marginTop: 6 }}>
                  Covers {formatFiscalPeriod(fiscalPeriod)}
                </div>
              )}
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Content Language *</label>
              <div className="tabs" style={{ marginBottom: 0 }}>
                <button type="button" className={`tab ${contentLanguage === 'english' ? 'act' : ''}`} onClick={() => setContentLanguage('english')}>English</button>
                <button type="button" className={`tab ${contentLanguage === 'arabic' ? 'act' : ''}`} onClick={() => setContentLanguage('arabic')}>العربية</button>
              </div>
            </div>
          </div>

          {/* Project Manager + Submission Deadline share one row. The cycle start/end
              dates are no longer asked for (filled from the fiscal period on submit). */}
          <GroupHeading>Project Manager &amp; Deadline</GroupHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 18 }}>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Project Manager *</label>
              <select className="inp sel" value={projectManagerId} onChange={(e) => setProjectManagerId(e.target.value)}>
                <option value="">Select a Project Manager</option>
                {isSpark && user?.user_id && (
                  <option value={user.user_id}>{user.full_name} (you)</option>
                )}
                {pms.map((pm) => {
                  const id = pm.user_id || pm.id;
                  return (
                    <option key={id} value={id}>{pm.full_name}</option>
                  );
                })}
              </select>
            </div>
            <div className="fl" style={{ marginBottom: 0 }}>
              <label className="fl-label">Submission Deadline *</label>
              <input
                className="inp"
                type="date"
                min={today}
                value={submissionDeadline}
                onChange={(e) => {
                  const v = e.target.value;
                  // Native date inputs fire onChange with an empty string on every
                  // keystroke while a segment (day/month/year) is still incomplete —
                  // committing that would reset the whole field mid-type. Only commit
                  // once the date is fully valid; a real clear is caught on blur.
                  if (!v) return;
                  if (v < today) return;
                  setSubmissionDeadline(v);
                }}
                onBlur={(e) => {
                  if (!e.target.value) setSubmissionDeadline('');
                }}
              />
            </div>
          </div>

          {/* Reporting sector + company profile (listed/private, Shariah,
              subsidiaries, sukuk) are set once at onboarding and the cycle
              inherits them from the company — no longer collected here. */}

          {err && <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: 12 }}>{err}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 18 }}>
            <LimitHint room={annualRoom} />
            {annualRoom.blocked && (
              <span style={{ fontSize: 11.5, color: '#9BA3C4', maxWidth: 320 }}>{annualRoom.reason}</span>
            )}
            {/* Stays enabled for missing fields; submit() reports the first one
                so the click is never a silent no-op. Greyed out only when the
                license has no room (the reason is shown next to it). */}
            <button className="btn bp" type="button" onClick={submit} disabled={busy || annualRoom.blocked}>
              {busy ? 'Creating…' : 'Create Cycle'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
