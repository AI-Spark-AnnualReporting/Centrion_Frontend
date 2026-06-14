import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sarCycles, sarUsers, getSectors } from '@/lib/api';
import type { Sector } from '@/types/company';
import type {
  ContentLanguage,
  CreateCyclePayload,
  Cycle,
  CycleOverview,
  CycleSection,
  SARUser,
  SectionMode,
} from '@/types/cycles';
import { COMPANY_PROFILE_OPTIONS } from '@/types/cycles';
import {
  CycleStatusBadge,
  ProgressBar,
  SectionLayerBadge,
  SectionModeBadge,
  SectionStatusBadge,
  SessionStatusBadge,
  formatCycleDate,
  isOverdue,
} from './cycle-ui';

const PRIMARY = '#4040C8';

// type=date wants YYYY-MM-DD; cycle dates may carry a time component.
const toDateInput = (s?: string | null) => (s ? s.slice(0, 10) : '');

// ── Edit Cycle modal ────────────────────────────────────────────────────────
function EditCycleModal({
  cycle,
  projectManagers,
  sectors,
  onClose,
  onSaved,
}: {
  cycle: Cycle;
  projectManagers: SARUser[];
  sectors: Sector[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cycle.name);
  const [fiscalYear, setFiscalYear] = useState(String(cycle.fiscal_year));
  const [contentLanguage, setContentLanguage] = useState<ContentLanguage>(cycle.content_language);
  const [projectManagerId, setProjectManagerId] = useState(cycle.project_manager_id);
  const [startDate, setStartDate] = useState(toDateInput(cycle.cycle_start_date));
  const [endDate, setEndDate] = useState(toDateInput(cycle.cycle_end_date));
  const [submissionDeadline, setSubmissionDeadline] = useState(toDateInput(cycle.submission_deadline));
  const [companyProfile, setCompanyProfile] = useState(cycle.company_profile);
  const [sectorId, setSectorId] = useState(cycle.sector_id);
  const [shariah, setShariah] = useState(cycle.is_shariah_compliant);
  const [subsidiaries, setSubsidiaries] = useState(cycle.has_subsidiaries);
  const [sukuk, setSukuk] = useState(cycle.has_sukuk);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

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
      const payload: Partial<CreateCyclePayload> = {
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="fl" style={{ margin: 0 }}>
              <label className="fl-label">Fiscal Year *</label>
              <input className="inp" type="number" value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} />
            </div>
            <div className="fl" style={{ margin: 0 }}>
              <label className="fl-label">Content Language *</label>
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

          {/* Project Manager — added per Part 6 spec */}
          <div className="fl" style={{ margin: 0 }}>
            <label className="fl-label">Project Manager *</label>
            <select className="inp sel" value={projectManagerId} onChange={(e) => setProjectManagerId(e.target.value)}>
              <option value="">Select a Project Manager</option>
              {projectManagers.map((pm) => (
                <option key={pm.id ?? pm.user_id} value={pm.user_id}>
                  {pm.full_name}
                </option>
              ))}
            </select>
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
              {cycle.sector_id && !sectors.some((s) => s.id === cycle.sector_id) && (
                <option value={cycle.sector_id}>{cycle.sector_name ?? 'Current sector'}</option>
              )}
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
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
  { key: 'ai_written', label: 'AI-written' },
  { key: 'upload', label: 'Upload' },
  { key: 'system', label: 'System' },
  { key: 'extract', label: 'Extract' },
  { key: 'manual', label: 'Manual' },
];

export default function CycleDetailPage() {
  const { cycleId = '' } = useParams();
  const navigate = useNavigate();

  const [overview, setOverview] = useState<CycleOverview | null>(null);
  const [sections, setSections] = useState<CycleSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modeFilter, setModeFilter] = useState<SectionMode | 'all'>('all');
  const [editing, setEditing] = useState(false);
  const [sectionsBusy, setSectionsBusy] = useState(false);
  const [deptBusy, setDeptBusy] = useState(false);

  // Shared lookups for the edit modal (loaded once).
  const [pms, setPms] = useState<SARUser[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);

  const fetchOverview = () => {
    setDeptBusy(true);
    return sarCycles
      .overview(cycleId)
      .then(setOverview)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load cycle.'))
      .finally(() => setDeptBusy(false));
  };

  const fetchSections = () => {
    setSectionsBusy(true);
    return sarCycles
      .sections(cycleId)
      .then(setSections)
      .catch(() => {
        /* sections are secondary — overview error already surfaces */
      })
      .finally(() => setSectionsBusy(false));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverview(), fetchSections()]).finally(() => setLoading(false));
    sarUsers.listProjectManagers().then(setPms).catch(() => setPms([]));
    getSectors().then(setSectors).catch(() => setSectors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

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
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1A1D2E' }}>{cycle.name}</h1>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
              FY{cycle.fiscal_year} · Deadline{' '}
              <span style={{ color: isOverdue(cycle.submission_deadline, cycle.status) ? '#DC2626' : '#9BA3C4' }}>
                {formatCycleDate(cycle.submission_deadline)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <CycleStatusBadge status={cycle.status} />
              <span style={{ fontSize: 11, color: '#5A6080' }}>PM: {cycle.project_manager_name ?? '—'}</span>
            </div>
          </div>
        </div>
        <button className="btn bs" type="button" onClick={() => setEditing(true)}>
          ✎ Edit
        </button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        <StatTile label="Total Departments" value={stats.total_departments} />
        <StatTile label="Submitted" value={stats.submitted} accent="#16A34A" />
        <StatTile label="In Progress" value={stats.in_progress} accent={PRIMARY} />
        <StatTile label="Completion Rate" value={`${Math.round(stats.completion_rate)}%`} accent={PRIMARY} bar={stats.completion_rate} />
      </div>

      {/* Report Sections */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>Report Sections</div>
            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 2 }}>
              The sections this cycle’s annual report will contain.
            </div>
          </div>
          <button className="btn bs bsm" type="button" disabled={sectionsBusy} onClick={() => fetchSections()}>
            ⟳ Re-resolve from current profile
          </button>
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
                <tr key={s.id} style={{ borderTop: '1px solid #F4F5FB' }}>
                  <td style={{ ...td, color: '#9BA3C4', fontFamily: "'DM Mono', monospace" }}>{s.section_code || i + 1}</td>
                  <td style={{ ...td, fontWeight: 600 }}>{s.section_name}</td>
                  <td style={td}><SectionLayerBadge layer={s.layer} /></td>
                  <td style={td}><SectionModeBadge mode={s.mode} /></td>
                  <td style={td}><SectionStatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Department Sessions */}
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
                      <span style={{ fontSize: 11, color: '#5A6080', fontFamily: "'DM Mono', monospace" }}>{Math.round(d.progress)}%</span>
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

      {editing && (
        <EditCycleModal
          cycle={cycle}
          projectManagers={pms}
          sectors={sectors}
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
