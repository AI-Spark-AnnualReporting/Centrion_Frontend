import { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { useNavigate, useParams } from 'react-router-dom';
import { sarCycles, sarUsers, adminConsole, companies, ApiError } from '@/lib/api';
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
import type { DepartmentSuggestionsResponse, ReportOutlineDetail } from '@/types/company';
import { PreviousOutline } from './PreviousOutline';
import SelectOutlineModal, { type OutlineSource } from './SelectOutlineModal';
import AssignDepartmentsSection, { type DepartmentAssignment } from './AssignDepartmentsSection';
import { departmentsWithoutLead, everyDepartmentHasLead } from './departmentLead';
import CycleSetupPanel, { type SetupTarget } from './CycleSetupPanel';
import ReportTeamCard from './ReportTeamCard';
import { isAdminLevel } from '@/constants/roles';
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canSubmit =
    name.trim().length >= 3 &&
    fiscalYear.trim() !== '' &&
    startDate !== '' &&
    endDate !== '' &&
    submissionDeadline !== '';

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
      };
      await sarCycles.update(cycle.id, payload);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to update cycle.');
      setBusy(false);
    }
  };

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

          <div style={{ fontSize: 11, color: '#9BA3C4', paddingTop: 4 }}>
            Reporting sector, company profile, Shariah, subsidiaries &amp; sukuk are set on the
            company (Profile page / onboarding) and inherited by each cycle.
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

// What the "Selected outline" strip says about each source.
const OUTLINE_LABELS: Record<OutlineSource, { name: string; description: string }> = {
  previous: {
    name: 'Previous',
    description: 'Your own report structure, read from the contents page of the annual report you uploaded.',
  },
  system: {
    name: 'System',
    description: 'Standard sections for your sector and company profile, including CMA requirements.',
  },
};

const MODE_FILTERS: { key: SectionMode | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'generate', label: 'Generate' },
  { key: 'attach', label: 'Attach' },
  { key: 'auto', label: 'Auto' },
  { key: 'manual', label: 'Manual' },
  { key: 'extract', label: 'Extract' },
  { key: 'analyze', label: 'Analyze' },
];

// ── Outline card: nothing picked yet ───────────────────────────────────────
function NoOutlineSelected({
  canManage,
  busyText,
  onSelect,
}: {
  canManage: boolean;
  /** What the button says while it can't be used; null when it can. */
  busyText: string | null;
  onSelect: () => void;
}) {
  return (
    <div style={{ padding: '44px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
      <div
        aria-hidden="true"
        style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', background: '#EEEEFC', color: PRIMARY, fontSize: 20 }}
      >
        ☰
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#1A1D2E', marginTop: 4 }}>No outline selected yet</div>
      <div style={{ fontSize: 12, color: '#9BA3C4', maxWidth: 420, lineHeight: 1.5 }}>
        {canManage
          ? "Pick where this report's sections come from: your previous report's structure, or the system's standard sections."
          : 'An admin picks where this report’s sections come from.'}
      </div>
      {canManage && (
        <button className="btn bp" type="button" style={{ marginTop: 8 }} disabled={busyText !== null} onClick={onSelect}>
          {busyText ?? 'Select outline'}
        </button>
      )}
    </div>
  );
}

/** A small drawn padlock, sized to the label text (an emoji renders differently per OS). */
function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// ── Outline card: which outline is in use, and a way to change it ─────────────
function SelectedOutlineStrip({
  source,
  count,
  canManage,
  locked,
  busyText,
  onChange,
}: {
  source: OutlineSource;
  count: number;
  canManage: boolean;
  /** The cycle has started: the outline can no longer be changed. */
  locked: boolean;
  /** What the button says while it can't be used; null when it can. */
  busyText: string | null;
  onChange: () => void;
}) {
  const label = OUTLINE_LABELS[source];
  return (
    <div
      style={{
        margin: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        border: `1.5px solid ${PRIMARY}`,
        background: '#EEEEFC',
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: PRIMARY,
          }}
        >
          Selected outline
          {locked && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#5A6080' }}>
              · <LockIcon /> Locked because the cycle has started
            </span>
          )}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#1A1D2E' }}>
          {label.name} · {count} {count === 1 ? 'section' : 'sections'}
        </span>
        <span style={{ fontSize: 11.5, color: '#5A6080' }}>{label.description}</span>
      </div>
      {canManage && !locked && (
        <button className="btn bs bsm" type="button" disabled={busyText !== null} onClick={onChange}>
          {busyText ?? '⇅ Change outline'}
        </button>
      )}
    </div>
  );
}

export default function CycleDetailPage() {
  const { cycleId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = isAdminLevel(user?.role);

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

  // Which section list this cycle is built from, as saved on the cycle. null = nobody
  // has picked yet: the Outline card then shows only "Select outline". It changes only
  // after the backend has accepted a pick, so the page never shows a list the cycle is
  // not actually built from.
  const [chosenSource, setChosenSource] = useState<OutlineSource | null>(null);
  const [selectingOutline, setSelectingOutline] = useState(false);

  // Use the source picked in the popup. This REBUILDS the cycle's section list, and
  // the backend refuses it outright (409) if any section it would clear already has
  // work on it. Picking the source already in use rebuilds it: a cycle's sections can
  // drift from its choice, since resolving only ever adds, and this is the way back.
  const applyOutlineSource = (v: OutlineSource) => {
    setSelectingOutline(false);
    setSectionsErr('');
    setSectionsMsg('');
    setSectionsBusy(true);
    sarCycles
      .setOutlineSource(cycleId, v)
      .then((res) => {
        setChosenSource(v);
        setModeFilter('all');
        setSections(res.sections ?? []);
        setSectionsMsg(
          v === 'previous'
            ? `Using this company's own sections — ${res.sections?.length ?? 0} in the report.`
            : `Using the standard sections — ${res.sections?.length ?? 0} in the report.`,
        );
      })
      .catch((e) => {
        setSectionsErr(
          e instanceof Error ? e.message : 'Could not switch the outline.',
        );
      })
      .finally(() => setSectionsBusy(false));
  };
  // Last year's outline hangs off the REPORT it was read from, not off the cycle —
  // the cycle comes from SAR, the report from Centriton — so it needs its own fetch.
  const [prevOutline, setPrevOutline] = useState<ReportOutlineDetail | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(true);
  const [outlineErr, setOutlineErr] = useState('');
  const [outlineReload, setOutlineReload] = useState(0);

  // PMs — used only to resolve the assigned PM's name for the header (the
  // overview payload carries project_manager_id but not always the name).
  const [pms, setPms] = useState<SARUser[]>([]);

  // Draft-state department assignment.
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [departmentSuggestions, setDepartmentSuggestions] =
    useState<DepartmentSuggestionsResponse | null>(null);
  const [assigned, setAssigned] = useState<DepartmentAssignment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');
  const [submitErr, setSubmitErr] = useState('');

  const fetchOverview = () => {
    setDeptBusy(true);
    return sarCycles
      .overview(cycleId)
      .then((res) => {
        setOverview(res);
        const saved = res?.cycle?.outline_source;
        setChosenSource(saved === 'previous' || saved === 'system' ? saved : null);
        return res;
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load cycle.');
        return null;
      })
      .finally(() => setDeptBusy(false));
  };

  // Initial load: GET the resolved sections. If none exist yet on a cycle whose outline
  // has been picked, resolve them now so the view shows a populated list without a
  // manual "Re-resolve" click. With no outline picked, nothing is built: the card
  // shows "Select outline" and the popup builds the list.
  const fetchSections = async (source: OutlineSource | null) => {
    setSectionsBusy(true);
    try {
      const list = await sarCycles.sections(cycleId);
      if (list.length > 0 || !canManage || source === null) {
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
    // Sections wait for the overview: whether to build them depends on the saved choice.
    fetchOverview()
      .then((res) => {
        const saved = res?.cycle?.outline_source;
        return fetchSections(saved === 'previous' || saved === 'system' ? saved : null);
      })
      .finally(() => setLoading(false));
    sarUsers.listProjectManagers().then(setPms).catch(() => setPms([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleId]);

  // Last year's outline. Keyed on company_id as well as the reload counter: AuthContext
  // masks company_id to whichever company a Spark user is acting as, so switching
  // company with this page open has to refetch or the card shows the wrong one.
  // Failing here must never take the System view down with it — hence its own error.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    let cancelled = false;
    setOutlineLoading(true);
    setOutlineErr('');
    companies
      .getLatestOutline(companyId)
      .then((res) => {
        if (!cancelled) setPrevOutline(res.outline ?? null);
      })
      .catch(() => {
        if (!cancelled) setOutlineErr("Couldn't load this company's previous outline.");
      })
      .finally(() => {
        if (!cancelled) setOutlineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.company_id, outlineReload]);

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

    // Same guard, same silent-failure rule: a suggestion is advisory, so a failure here
    // must not surface an error on a page about something else.
    const companyId = user?.company_id;
    if (companyId) {
      companies
        .getDepartmentSuggestions(companyId)
        .then(setDepartmentSuggestions)
        .catch(() => setDepartmentSuggestions(null));
    }

    // Hydrate from any existing assignments on the cycle (usually empty for a
    // fresh draft). The dept's HR Lead comes from allDepartments, not the assignment.
    setAssigned(
      (overview?.departments ?? []).map((d) => ({
        department_id: d.department_id,
        department_name: d.department_name,
        department_code: d.department_code,
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
            },
          ],
    );

  const removeDepartment = (departmentId: string) =>
    setAssigned((prev) => prev.filter((a) => a.department_id !== departmentId));

  // Spark staff run the cycles they submit, so they lead every department in one
  // — the backend makes the same substitution from the caller's own identity.
  const selfLeadName = user?.role === 'spark_internal' ? (user.full_name || 'You') : null;

  // Every added department must have an HR Lead before the cycle can be submitted.
  // Shared with the section so the gate and the warning badge can't disagree.
  // And an outline must be picked: a cycle can't start without knowing its sections.
  const canSubmit =
    chosenSource !== null &&
    assigned.length > 0 &&
    everyDepartmentHasLead(assigned, allDepartments, selfLeadName);

  // The Cycle setup panel's steps scroll to the card where each one is done, and
  // flash it briefly so the eye lands on it.
  const jumpToSetupStep = (target: SetupTarget) => {
    const card = document.getElementById(`cycle-setup-${target}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('cycle-setup-flash');
    // Reading a layout value restarts the animation when the same card is picked twice.
    void card.offsetWidth;
    card.classList.add('cycle-setup-flash');
  };

  // Submit = assign departments (bulk). The cycle stays in draft; it only goes
  // active when the PM submits the kickoff brief and generates questions.
  const handleSubmitCycle = async () => {
    if (submitting || !canSubmit) return;
    setSubmitErr('');
    setSubmitMsg('');
    setSubmitting(true);
    try {
      // The page holds the cycle's whole department list (loaded from the cycle, then
      // edited), so it asks the backend to remove any department taken off it.
      const res = await sarCycles.assignDepartments(cycleId, {
        assignments: assigned.map((a) => ({ department_id: a.department_id })),
        replace: true,
      });
      const removed = res?.assignments_removed ?? 0;
      setSubmitMsg(
        removed > 0
          ? `Departments saved: ${removed} removed. The project manager can now kick off the cycle.`
          : 'Departments assigned. The project manager can now kick off the cycle.',
      );
      await fetchOverview();
    } catch (e) {
      // ApiError.message already carries the backend's `detail` (or a
      // generic message for 429/5xx infra failures) — read it rather than
      // re-parsing `e.body.detail` directly, which would bypass that
      // sanitization.
      const status = e instanceof ApiError ? e.status : undefined;
      const msg = e instanceof Error ? e.message : 'Failed to save departments.';
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

  // Why the outline buttons are waiting, if they are. Rebuilding the section list is
  // the slow one; the contents page only has to load before the popup can say
  // whether Previous exists.
  let outlineBusyText: string | null = null;
  if (sectionsBusy) outlineBusyText = 'Building sections…';
  else if (outlineLoading) outlineBusyText = 'Loading…';

  if (loading) {
    return <Spinner pad={80} />;
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
  // Only an admin on a draft cycle can submit it, so only they get the setup panel.
  const showSetup = cycle.status === 'draft' && canManage;
  // After kickoff the departments' questions are written for this outline, so it is
  // locked: no Change outline, no Re-resolve. The backend refuses both too (409).
  const outlineLocked = cycle.status !== 'draft';
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
        {/* Submit is NOT here — it lives at the foot of the page, after the content
            it acts on. Edit stays, because it opens a modal rather than committing
            the page's state. */}
        {canManage && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn bs" type="button" onClick={() => setEditing(true)}>
              ✎ Edit
            </button>
          </div>
        )}
      </div>

      {/* On a draft cycle an admin gets the Cycle setup panel beside the page. The
          layout class puts it on the right on wide screens, above the content on
          narrow ones. */}
      <div className={showSetup ? 'cycle-setup-layout' : undefined}>
      <div style={{ minWidth: 0 }}>

      {/* Draft → assign departments sits right under the header, above the stats */}
      {cycle.status === 'draft' && canManage && (
        <div id="cycle-setup-departments" style={{ marginBottom: 16 }}>
          <AssignDepartmentsSection
            allDepartments={allDepartments}
            assigned={assigned}
            onAdd={addDepartment}
            onRemove={removeDepartment}
            selfLeadName={selfLeadName}
            departmentSuggestions={departmentSuggestions}
          />
        </div>
      )}

      {/* Spark staff run this cycle for a client, so they get a way straight into
          each role's workspace — but only once departments are actually assigned
          to it. Gated on that, not on cycle.status: activation is a separate flow
          the PM runs later, and shouldn't hold this card back. Until departments
          exist this would just be an empty "no departments" card sitting above
          Assign Departments, which already owns that job on this screen. */}
      {user?.role === 'spark_internal' && departments.length > 0 && (
        <ReportTeamCard cycle={cycle} departments={departments} pmName={pmName} />
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

      {/* Department Sessions — shown for non-draft (or read-only IR) views; the
          draft-admin view uses the Assign Departments section above instead.
          Placed above Report Sections: which departments are doing is the more
          actionable question day-to-day than the section list itself. */}
      {!(cycle.status === 'draft' && canManage) && (
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
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

      {/* Report Sections */}
      <div id="cycle-setup-outline" className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1D2E' }}>Outline</div>
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
          {/* Re-resolve rebuilds the SYSTEM list from the company profile — it has
              nothing to act on for a company's own (Previous) sections. */}
          {canManage && !outlineLocked && chosenSource === 'system' && (
            <button className="btn bs bsm" type="button" disabled={sectionsBusy} onClick={() => resolveSections()}>
              {sectionsBusy ? 'Resolving…' : '⟳ Re-resolve from current profile'}
            </button>
          )}
        </div>

        {chosenSource === null ? (
          <NoOutlineSelected
            canManage={canManage && !outlineLocked}
            busyText={outlineBusyText}
            onSelect={() => setSelectingOutline(true)}
          />
        ) : (
          <>
            <SelectedOutlineStrip
              source={chosenSource}
              count={sections.length}
              canManage={canManage}
              locked={outlineLocked}
              busyText={outlineBusyText}
              onChange={() => setSelectingOutline(true)}
            />

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

            {chosenSource === 'previous' ? (
              <PreviousOutline
                sections={filteredSections}
                detail={prevOutline}
                loading={outlineLoading}
                error={outlineErr}
                onRetry={() => setOutlineReload((n) => n + 1)}
              />
            ) : filteredSections.length === 0 ? (
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
                      <td style={{ ...td, color: '#9BA3C4', fontFamily: "'DM Mono', monospace" }}>{i + 1}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{s.title}</td>
                      <td style={td}><SectionLayerBadge layer={s.layer} /></td>
                      <td style={td}><SectionModeBadge mode={s.mode} /></td>
                      <td style={td}><SectionStatusBadge status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {selectingOutline && (
        <SelectOutlineModal
          cycleId={cycleId}
          current={chosenSource}
          currentCount={sections.length}
          previousDetail={prevOutline}
          onClose={() => setSelectingOutline(false)}
          onUse={applyOutlineSource}
        />
      )}

      </div>

      {showSetup && (
        <CycleSetupPanel
          outlineChosen={chosenSource !== null}
          departmentCount={assigned.length}
          withoutLead={departmentsWithoutLead(assigned, allDepartments, selfLeadName)}
          canSubmit={canSubmit}
          submitting={submitting}
          building={sectionsBusy}
          message={submitMsg}
          error={submitErr}
          onSubmit={handleSubmitCycle}
          onJump={jumpToSetupStep}
        />
      )}
      </div>

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
