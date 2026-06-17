import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sarCycles, sarUsers, adminConsole, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type {
  CreateCyclePayload,
  Cycle,
  CycleOverview,
  CycleSection,
  SARUser,
  SectionMode,
} from '@/types/cycles';
import { COMPANY_PROFILE_OPTIONS, CYCLE_SECTOR_OPTIONS } from '@/types/cycles';
import type { AdminUserRow, Department } from '@/types/admin';
import AssignDepartmentsSection, { type DepartmentAssignment } from './AssignDepartmentsSection';
import {
  CycleStatusBadge,
  ProgressBar,
  SectionLayerBadge,
  SectionModeBadge,
  SectionStatusBadge,
  SessionStatusBadge,
  formatCycleDate,
  isOverdue,
  safePct,
} from './cycle-ui';

const PRIMARY = '#4040C8';

// type=date wants YYYY-MM-DD; cycle dates may carry a time component.
const toDateInput = (s?: string | null) => (s ? s.slice(0, 10) : '');

// ── Edit Cycle modal ────────────────────────────────────────────────────────
function EditCycleModal({
  cycle,
  onClose,
  onSaved,
}: {
  cycle: Cycle;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Prefill defensively — the GET response may use either the new SAR field
  // names (cycle_name/start_date/sector/is_shariah) or the older ones.
  const [name, setName] = useState(cycle.cycle_name ?? cycle.name ?? '');
  const [fiscalYear, setFiscalYear] = useState(String(cycle.fiscal_year));
  // Project Manager isn't editable here — keep the cycle's current PM and send
  // it back unchanged so the PUT doesn't drop it.
  const projectManagerId = cycle.project_manager_id;
  const [startDate, setStartDate] = useState(toDateInput(cycle.start_date ?? cycle.cycle_start_date));
  const [endDate, setEndDate] = useState(toDateInput(cycle.end_date ?? cycle.cycle_end_date));
  const [submissionDeadline, setSubmissionDeadline] = useState(toDateInput(cycle.submission_deadline));
  const [companyProfile, setCompanyProfile] = useState(cycle.company_profile ?? '');
  const [sectorId, setSectorId] = useState(cycle.sector ?? cycle.sector_id ?? '');
  const [shariah, setShariah] = useState(cycle.is_shariah ?? cycle.is_shariah_compliant ?? false);
  const [subsidiaries, setSubsidiaries] = useState(cycle.has_subsidiaries);
  const [sukuk, setSukuk] = useState(cycle.has_sukuk);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canSubmit =
    name.trim().length >= 3 &&
    fiscalYear.trim() !== '' &&
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
      const payload: Partial<CreateCyclePayload> = {
        cycle_name: name.trim(),
        fiscal_year: parseInt(fiscalYear, 10),
        project_manager_id: projectManagerId,
        start_date: startDate,
        end_date: endDate,
        submission_deadline: submissionDeadline,
        company_profile: companyProfile,
        sector: sectorId,
        is_shariah: shariah,
        has_subsidiaries: subsidiaries,
        has_sukuk: sukuk,
      };
      await sarCycles.update(cycle.id, payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update cycle.');
      setBusy(false);
    }
  };

  const flag = (label: string, value: boolean, set: (v: boolean) => void) => (
    <button
      type="button"
      onClick={() => set(!value)}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '9px 11px',
        borderRadius: 10,
        border: `1.5px solid ${value ? PRIMARY : '#E2E4F0'}`,
        background: value ? '#EEEEFF' : '#fff',
        cursor: 'pointer',
        fontSize: 11.5,
        fontWeight: 600,
        color: value ? PRIMARY : '#5A6080',
      }}
    >
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          flexShrink: 0,
          border: value ? 'none' : '1.5px solid #C9CDE4',
          background: value ? PRIMARY : '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value && (
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2l2.2 2.2L9.5 3.6" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {label}
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ width: 460, maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '20px 24px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>Edit Cycle</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #E2E4F0', background: '#fff', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
        <div style={{ padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="fl" style={{ margin: 0 }}>
            <label className="fl-label">Cycle Name *</label>
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="fl" style={{ margin: 0 }}>
            <label className="fl-label">Fiscal Year *</label>
            <input className="inp" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fl" style={{ margin: 0 }}>
              <label className="fl-label">Start Date *</label>
              <input className="inp" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="fl" style={{ margin: 0 }}>
              <label className="fl-label">End Date *</label>
              <input className="inp" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="fl" style={{ margin: 0 }}>
            <label className="fl-label">Submission Deadline *</label>
            <input className="inp" type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} />
          </div>

          <div style={{ borderTop: '1px solid #ECEEF8', paddingTop: 12, fontSize: 12, fontWeight: 800, color: '#1A1D2E' }}>
            🏢 Company Profile
          </div>
          <div className="fl" style={{ margin: 0 }}>
            <label className="fl-label">Company Profile *</label>
            <select className="inp sel" value={companyProfile} onChange={(e) => setCompanyProfile(e.target.value)}>
              <option value="">Select a company profile</option>
              {/* Surface the saved value even if it's not in our known option list */}
              {companyProfile && !COMPANY_PROFILE_OPTIONS.some((o) => o.value === companyProfile) && (
                <option value={companyProfile}>{companyProfile}</option>
              )}
              {COMPANY_PROFILE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="fl" style={{ margin: 0 }}>
            <label className="fl-label">Sector *</label>
            <select className="inp sel" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">Select a sector</option>
              {sectorId && !CYCLE_SECTOR_OPTIONS.some((s) => s.value === sectorId) && (
                <option value={sectorId}>{cycle.sector_name ?? sectorId}</option>
              )}
              {CYCLE_SECTOR_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {flag('Shariah-compliant', shariah, setShariah)}
            {flag('Has subsidiaries', subsidiaries, setSubsidiaries)}
            {flag('Has sukuk', sukuk, setSukuk)}
          </div>

          {err && <div role="alert" style={{ fontSize: 11, color: '#DC2626' }}>{err}</div>}
        </div>
        <div style={{ padding: '14px 24px 18px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn bs" type="button" onClick={onClose}>Cancel</button>
          <button className="btn bp" type="button" onClick={submit} disabled={busy || !canSubmit}>
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────
function StatTile({ label, value, accent, bar }: { label: string; value: React.ReactNode; accent?: string; bar?: number }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0, padding: 16 }}>
      <div style={{ fontSize: 11, color: '#9BA3C4', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent ?? '#1A1D2E', marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
      {bar != null && (
        <div style={{ marginTop: 8 }}>
          <ProgressBar pct={bar} width="100%" />
        </div>
      )}
    </div>
  );
}

const MODE_FILTERS: { key: SectionMode | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'generate', label: 'Generate' },
  { key: 'attach', label: 'Attach' },
  { key: 'auto', label: 'Auto' },
  { key: 'manual', label: 'Manual' },
  { key: 'extract', label: 'Extract' },
  { key: 'analyze', label: 'Analyze' },
];

export default function CycleDetailPage() {
  const { cycleId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.role === 'admin';

  const [overview, setOverview] = useState<CycleOverview | null>(null);
  const [sections, setSections] = useState<CycleSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modeFilter, setModeFilter] = useState<SectionMode | 'all'>('all');
  const [editing, setEditing] = useState(false);
  const [sectionsBusy, setSectionsBusy] = useState(false);
  const [sectionsMsg, setSectionsMsg] = useState('');
  const [sectionsErr, setSectionsErr] = useState('');
  const [deptBusy, setDeptBusy] = useState(false);

  // PMs — used only to resolve the assigned PM's name for the header (the
  // overview payload carries project_manager_id but not always the name).
  const [pms, setPms] = useState<SARUser[]>([]);

  // Draft-state department assignment.
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [departmentUsers, setDepartmentUsers] = useState<AdminUserRow[]>([]);
  const [assigned, setAssigned] = useState<DepartmentAssignment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitErr, setSubmitErr] = useState('');

  const fetchOverview = () => {
    setDeptBusy(true);
    return sarCycles
      .overview(cycleId)
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cycle.'))
      .finally(() => setDeptBusy(false));
  };

  // Initial load: GET the resolved sections. If none exist yet (a freshly
  // created cycle whose sections haven't been resolved), resolve them now so the
  // view shows a populated list without a manual "Re-resolve" click.
  const fetchSections = async () => {
    setSectionsBusy(true);
    try {
      const list = await sarCycles.sections(cycleId);
      if (list.length > 0 || !canManage) {
        setSections(list);
        return;
      }
      try {
        const res = await sarCycles.resolveSections(cycleId);
        setSections(res.sections ?? []);
      } catch {
        // resolve can 400 if company profile / sector aren't set — show the
        // empty list and let the admin resolve manually.
        setSections(list);
      }
    } catch {
      /* sections are secondary — overview error already surfaces */
    } finally {
      setSectionsBusy(false);
    }
  };

  // Re-resolve: POST /resolve-sections recomputes the section list from the
  // cycle's profile (idempotent). Returns the full current list.
  const resolveSections = () => {
    setSectionsBusy(true);
    setSectionsErr('');
    setSectionsMsg('');
    return sarCycles
      .resolveSections(cycleId)
      .then((res) => {
        setSections(res.sections ?? []);
        setSectionsMsg(
          res.sections_created > 0
            ? `${res.sections_created} section${res.sections_created === 1 ? '' : 's'} added.`
            : 'Already up to date — no new sections.',
        );
      })
      .catch((e) =>
        setSectionsErr(
          e instanceof Error
            ? e.message
            : 'Failed to resolve sections. Ensure company profile and sector are set.',
        ),
      )
      .finally(() => setSectionsBusy(false));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverview(), fetchSections()]).finally(() => setLoading(false));
    sarUsers.listProjectManagers().then(setPms).catch(() => setPms([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  const isDraft = overview?.cycle.status === 'draft';

  // Load the department + user lists (and hydrate any saved assignments) once we
  // know the cycle is a draft an admin can manage.
  useEffect(() => {
    if (!isDraft || !canManage) return;
    adminConsole
      .listDepartments()
      .then((res) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.departments)
            ? res.departments
            : [];
        setAllDepartments(list.filter((d) => d.is_active !== false));
      })
      .catch(() => setAllDepartments([]));

    adminConsole
      .listUsers({ role: 'department_user' })
      .then((res: unknown) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray((res as { users?: AdminUserRow[] })?.users)
            ? (res as { users: AdminUserRow[] }).users
            : [];
        setDepartmentUsers(list);
      })
      .catch(() => setDepartmentUsers([]));

    // Hydrate from any existing assignments on the cycle (usually empty for a
    // fresh draft).
    setAssigned(
      (overview?.departments ?? []).map((d) => ({
        department_id: d.department_id,
        department_name: d.department_name,
        department_code: d.department_code,
        assigned_user_id: d.assigned_user_id ?? null,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDraft, canManage, cycleId]);

  const addDepartment = (dept: Department) =>
    setAssigned((prev) =>
      prev.some((a) => a.department_id === dept.id)
        ? prev
        : [
            ...prev,
            {
              department_id: dept.id,
              department_name: dept.department_name,
              department_code: dept.department_code,
              assigned_user_id: null,
            },
          ],
    );

  const removeDepartment = (departmentId: string) =>
    setAssigned((prev) => prev.filter((a) => a.department_id !== departmentId));

  const changeAssignedUser = (departmentId: string, userId: string) =>
    setAssigned((prev) =>
      prev.map((a) =>
        a.department_id === departmentId ? { ...a, assigned_user_id: userId || null } : a,
      ),
    );

  const canSubmit =
    assigned.length > 0 && assigned.every((a) => !!a.assigned_user_id);

  // Submit = assign departments (bulk) THEN activate, in sequence.
  const handleSubmitCycle = async () => {
    if (submitting || !canSubmit) return;
    setSubmitErr('');
    setSubmitMsg('');
    setSubmitting(true);
    try {
      await sarCycles.assignDepartments(cycleId, {
        assignments: assigned.map((a) => ({
          department_id: a.department_id,
          user_id: a.assigned_user_id as string,
        })),
      });
      await sarCycles.activate(cycleId);
      setSubmitMsg('Cycle activated. AI-generated questions are being prepared.');
      await fetchOverview();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : undefined;
      const msg =
        e instanceof ApiError && typeof (e.body as { detail?: string })?.detail === 'string'
          ? (e.body as { detail: string }).detail
          : e instanceof Error
            ? e.message
            : 'Failed to activate cycle.';
      if (status === 400 && /draft/i.test(msg)) {
        setSubmitErr('This cycle is no longer in draft. Refreshing…');
        await fetchOverview();
      } else {
        setSubmitErr(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSections = useMemo(
    () => (modeFilter === 'all' ? sections : sections.filter((s) => s.mode === modeFilter)),
    [sections, modeFilter],
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="skel" style={{ height: 70, borderRadius: 12 }} />
        <div style={{ display: 'flex', gap: 14 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skel" style={{ flex: 1, height: 90, borderRadius: 12 }} />
          ))}
        </div>
        <div className="skel" style={{ height: 240, borderRadius: 12 }} />
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>Couldn’t load this cycle</div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6 }}>{error || 'No data returned.'}</div>
        <button className="btn bs" type="button" style={{ marginTop: 14 }} onClick={() => navigate('/annual-report')}>
          ← Back to cycles
        </button>
      </div>
    );
  }

  const { cycle, stats, departments } = overview;
  // Overview gives project_manager_id but not always the name — resolve from the
  // PM list, falling back to any name the payload did include.
  const pmName =
    cycle.project_manager_name ??
    pms.find((p) => p.user_id === cycle.project_manager_id)?.full_name ??
    '—';
  const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9BA3C4', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'left', padding: '12px 16px' };
  const td: React.CSSProperties = { fontSize: 12, color: '#1A1D2E', padding: '12px 16px' };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <button
            type="button"
            onClick={() => navigate('/annual-report')}
            aria-label="Back"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#5A6080', fontSize: 18, marginTop: 2 }}
          >
            ←
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1A1D2E' }}>{cycle.cycle_name ?? cycle.name}</h1>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
              FY{cycle.fiscal_year} · Deadline{' '}
              <span style={{ color: isOverdue(cycle.submission_deadline, cycle.status) ? '#DC2626' : '#9BA3C4' }}>
                {formatCycleDate(cycle.submission_deadline)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <CycleStatusBadge status={cycle.status} />
              <span style={{ fontSize: 11, color: '#5A6080' }}>PM: {pmName}</span>
            </div>
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn bs" type="button" onClick={() => setEditing(true)}>
              ✎ Edit
            </button>
            {cycle.status === 'draft' && (
              <button
                className="btn bp"
                type="button"
                onClick={handleSubmitCycle}
                disabled={!canSubmit || submitting}
                title={!canSubmit ? 'Assign at least one department, each with a responsible user' : undefined}
              >
                {submitting ? 'Submitting…' : '✓ Submit'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Submit feedback (draft) */}
      {cycle.status === 'draft' && (submitMsg || submitErr) && (
        <div
          role={submitErr ? 'alert' : 'status'}
          style={{
            marginBottom: 14,
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            background: submitErr ? 'rgba(229,72,77,.08)' : 'rgba(34,197,94,.1)',
            border: `1px solid ${submitErr ? 'rgba(229,72,77,.25)' : 'rgba(34,197,94,.25)'}`,
            color: submitErr ? '#B33A3E' : '#16A34A',
          }}
        >
          {submitErr || submitMsg}
        </div>
      )}

      {/* Draft → assign departments sits right under the header, above the stats */}
      {cycle.status === 'draft' && canManage && (
        <div style={{ marginBottom: 16 }}>
          <AssignDepartmentsSection
            allDepartments={allDepartments}
            departmentUsers={departmentUsers}
            assigned={assigned}
            onAdd={addDepartment}
            onRemove={removeDepartment}
            onChangeUser={changeAssignedUser}
          />
        </div>
      )}

      {/* Stat tiles — in draft, Total Departments tracks the live local count */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        <StatTile
          label="Total Departments"
          value={cycle.status === 'draft' ? assigned.length : stats.total_departments}
        />
        <StatTile label="Submitted" value={cycle.status === 'draft' ? 0 : stats.submitted} accent="#16A34A" />
        <StatTile label="In Progress" value={cycle.status === 'draft' ? 0 : stats.in_progress} accent={PRIMARY} />
        <StatTile
          label="Completion Rate"
          value={cycle.status === 'draft' ? '0%' : `${safePct(stats.completion_rate)}%`}
          accent={PRIMARY}
          bar={cycle.status === 'draft' ? 0 : stats.completion_rate}
        />
      </div>

      {/* Report Sections */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>Report Sections</div>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
              The sections this cycle’s annual report will contain.
            </div>
            {sectionsMsg && (
              <div style={{ fontSize: 11, color: '#16A34A', marginTop: 6, fontWeight: 600 }}>{sectionsMsg}</div>
            )}
            {sectionsErr && (
              <div role="alert" style={{ fontSize: 11, color: '#DC2626', marginTop: 6, fontWeight: 600 }}>{sectionsErr}</div>
            )}
          </div>
          {canManage && (
            <button className="btn bs bsm" type="button" disabled={sectionsBusy} onClick={() => resolveSections()}>
              {sectionsBusy ? 'Resolving…' : '⟳ Re-resolve from current profile'}
            </button>
          )}
        </div>

        <div style={{ padding: '10px 16px', display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: '1px solid #F4F5FB' }}>
          {MODE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setModeFilter(f.key)}
              className={`fw-chip ${modeFilter === f.key ? 'sel' : ''}`}
              style={{ padding: '4px 11px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredSections.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: '#9BA3C4' }}>No sections.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFE' }}>
                <th style={{ ...th, width: 44 }}>#</th>
                <th style={th}>Section</th>
                <th style={th}>Layer</th>
                <th style={th}>Mode</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSections.map((s, i) => (
                <tr key={s.section_code || i} style={{ borderTop: '1px solid #F4F5FB' }}>
                  <td style={{ ...td, color: '#9BA3C4', fontFamily: "'DM Mono', monospace" }}>{s.section_number ?? i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{s.title}</td>
                  <td style={td}><SectionLayerBadge layer={s.layer} /></td>
                  <td style={td}><SectionModeBadge mode={s.mode} /></td>
                  <td style={td}><SectionStatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Department Sessions — shown for non-draft (or read-only IR) views; the
          draft-admin view uses the Assign Departments section above instead. */}
      {!(cycle.status === 'draft' && canManage) && (
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>Department Sessions</div>
          <button className="btn bs bsm" type="button" disabled={deptBusy} onClick={() => fetchOverview()}>
            ⟳ Refresh
          </button>
        </div>
        {departments.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 12, color: '#9BA3C4' }}>No department sessions yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFBFE' }}>
                <th style={th}>Department</th>
                <th style={th}>Assigned user</th>
                <th style={th}>Progress</th>
                <th style={th}>Status</th>
                <th style={th}>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.department_id} style={{ borderTop: '1px solid #F4F5FB' }}>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{d.department_name}</div>
                    <div style={{ fontSize: 10, color: '#9BA3C4' }}>{d.department_code}</div>
                  </td>
                  <td style={td}>
                    {d.assigned_user_name ? (
                      <>
                        <div>{d.assigned_user_name}</div>
                        {d.assigned_user_email && <div style={{ fontSize: 10, color: '#9BA3C4' }}>{d.assigned_user_email}</div>}
                      </>
                    ) : (
                      <span style={{ color: '#C4C9DD' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ProgressBar pct={d.progress} width={120} />
                      <span style={{ fontSize: 11, color: '#5A6080', fontFamily: "'DM Mono', monospace" }}>{safePct(d.progress)}%</span>
                    </div>
                  </td>
                  <td style={td}><SessionStatusBadge status={d.session_status} /></td>
                  <td style={{ ...td, color: '#5A6080' }}>{d.submitted_at ? formatCycleDate(d.submitted_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      {editing && (
        <EditCycleModal
          cycle={cycle}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            fetchOverview();
          }}
        />
      )}
    </div>
  );
}
