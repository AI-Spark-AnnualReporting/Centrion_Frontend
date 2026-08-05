import { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '@/components/shared/Spinner';
import { admin, adminConsole } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { SHOW_CHANGE_ROLE, SHOW_SUSPEND_USER } from './admin-flags';
import {
  ASSIGNABLE_ROLES,
  CAPABILITY_GROUPS,
  ROLE_DISPLAY,
  ROLE_ORDER,
  roleLabel,
  type BackendRole,
} from '@/constants/roles';
import type {
  AdminUserRow,
  Department,
  InviteUserPayload,
  InviteUserResponse,
  PermissionMatrix,
  UserStatus,
} from '@/types/admin';
import { relativeTime } from '@/lib/time';
import { initialsOf, gradientFor } from '@/lib/avatar';
import { downloadText } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const PRIMARY = '#4040C8';
type View = 'users' | 'matrix';
type StatusFilter = 'all' | UserStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'invited', label: 'Invited' },
  { key: 'suspended', label: 'Suspended' },
];

const STATUS_META: Record<UserStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'b-gn' },
  invited: { label: 'Invited', cls: 'b-am' },
  suspended: { label: 'Suspended', cls: 'b-rd' },
};

function StatusBadge({ status }: { status: UserStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return <span className={`badge ${m.cls}`}>● {m.label}</span>;
}

// The backend uses slightly different field names than the table reads
// (last_login / report_count). Normalise to the AdminUserRow shape, keeping
// existing keys as fallbacks so either naming works.
function normalizeUser(raw: any): AdminUserRow {
  return {
    ...raw,
    last_active: raw.last_active ?? raw.last_login ?? null,
    reports_count: raw.reports_count ?? raw.report_count ?? null,
  };
}

// ── Role summary cards ─────────────────────────────────────────────────────
function RoleCards({
  counts,
  active,
  onPick,
}: {
  counts: Record<string, number>;
  active: BackendRole | null;
  onPick: (role: BackendRole) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      {ROLE_ORDER.map((role) => {
        const meta = ROLE_DISPLAY[role];
        const isActive = active === role;
        return (
          <button
            key={role}
            type="button"
            onClick={() => onPick(role)}
            className="card"
            style={{
              flex: 1,
              minWidth: 0,
              padding: 14,
              textAlign: 'left',
              cursor: 'pointer',
              border: isActive ? `1.5px solid ${PRIMARY}` : undefined,
              boxShadow: isActive ? '0 4px 16px rgba(64,64,200,.16)' : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: meta.dot,
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#1A1D2E' }}>{meta.label}</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
                {counts[role] ?? 0}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#9BA3C4', marginTop: 6 }}>{meta.description}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── Invite modal ───────────────────────────────────────────────────────────
function InviteModal({
  departments,
  onClose,
  onInvited,
}: {
  departments: Department[];
  onClose: () => void;
  onInvited: (res: InviteUserResponse) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BackendRole>('department_user');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // A department applies to `department_user` and `hod`. Clear the selection when
  // the role moves away so we never send a stale id.
  useEffect(() => {
    if (role !== 'department_user' && role !== 'hod') setDepartmentId(null);
  }, [role]);

  const needsDepartment = role === 'department_user' || role === 'hod';
  const canSubmit =
    fullName.trim() !== '' &&
    email.trim() !== '' &&
    (!needsDepartment || departmentId !== null);

  const submit = async () => {
    if (busy) return;
    setErr('');
    if (!fullName.trim()) return setErr('Full name is required');
    if (!/.+@.+\..+/.test(email)) return setErr('A valid email is required');
    if (needsDepartment && !departmentId) return setErr('Please select a department');
    if (role === 'hod' && departmentId) {
      const dept = departments.find((d) => d.id === departmentId);
      if (dept?.has_hod) {
        const ok = window.confirm(
          `${dept.department_name} already has a ${dept.department_code} Lead` +
            (dept.hod_name ? ` (${dept.hod_name})` : '') +
            `. Creating this user will replace them as the ${dept.department_code} Lead. Continue?`,
        );
        if (!ok) return;
      }
    }
    setBusy(true);
    try {
      const payload: InviteUserPayload = {
        full_name: fullName.trim(),
        email: email.trim(),
        role,
      };
      if (needsDepartment && departmentId) payload.department_id = departmentId;
      const res = await adminConsole.inviteUser(payload);
      onInvited(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to invite user.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '20px 24px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>Invite user</div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1.5px solid #E2E4F0',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="fl">
            <label className="fl-label">Full name</label>
            <input
              className="inp"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sara Haddad"
            />
          </div>
          <div className="fl">
            <label className="fl-label">Email</label>
            <input
              className="inp"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </div>
          <div className="fl">
            <label className="fl-label">Role</label>
            <select
              className="inp sel"
              value={role}
              onChange={(e) => setRole(e.target.value as BackendRole)}
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_DISPLAY[r].label} — {ROLE_DISPLAY[r].description}
                </option>
              ))}
            </select>
          </div>

          {/* Department — required for department_user and hod. */}
          {needsDepartment && (
            <div className="fl">
              <label className="fl-label">Department</label>
              {departments.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'rgba(245,158,11,.1)',
                    border: '1px solid #F4D9A6',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#B45309',
                  }}
                >
                  No departments available. Create a department first.
                </div>
              ) : (
                <select
                  className="inp sel"
                  value={departmentId ?? ''}
                  onChange={(e) => setDepartmentId(e.target.value || null)}
                >
                  <option value="">Select a department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.department_name} ({d.department_code})
                    </option>
                  ))}
                </select>
              )}
              {role === 'hod' &&
                departmentId &&
                departments.find((d) => d.id === departmentId)?.has_hod && (
                  <div style={{ marginTop: 6, fontSize: 10.5, color: '#B45309', fontWeight: 600 }}>
                    ⚠ This department already has a {departments.find((d) => d.id === departmentId)?.department_code} Lead
                    {departments.find((d) => d.id === departmentId)?.hod_name
                      ? ` (${departments.find((d) => d.id === departmentId)?.hod_name})`
                      : ''}
                    . Creating this user replaces them.
                  </div>
                )}
            </div>
          )}

          {err && (
            <div style={{ fontSize: 11, color: '#E5484D' }} role="alert">
              {err}
            </div>
          )}
        </div>
        <div
          style={{
            padding: '14px 24px 18px',
            borderTop: '1px solid #ECEEF8',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button className="btn bs" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn bp"
            onClick={submit}
            type="button"
            disabled={busy || !canSubmit}
          >
            {busy ? 'Inviting…' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Undelivered-invite modal ───────────────────────────────────────────────
// Only shown when the backend couldn't email the invite: the admin becomes the
// delivery mechanism, so the temp password needs copying before this closes. A
// delivered invite gets a toast instead — nothing to interact with.
function InviteResultModal({
  result,
  onClose,
}: {
  result: InviteUserResponse;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(result.temp_password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  // A .txt the admin can hand over / keep until the user is onboarded. The
  // email address is in the file too — a bare password in Downloads is useless
  // a week later.
  const download = () =>
    downloadText(
      `centriyon-temp-password-${result.email.replace(/[^\w.@-]/g, '_')}.txt`,
      [
        'Centriyon — Temporary password',
        '',
        `Account:            ${result.email}`,
        `Temporary password: ${result.temp_password}`,
        '',
      ].join('\n'),
    );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 440, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>User invited</div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6 }}>
          Share this temporary password with <strong>{result.email}</strong>. They’ll set their own
          on first login.
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 11,
            color: '#B45309',
            background: 'rgba(245,158,11,.1)',
            borderRadius: 8,
            padding: '8px 10px',
          }}
        >
          ⚠ {result.email_message ?? 'The invite email could not be sent.'} It won&apos;t be shown
          again.
        </div>
        <div
          style={{
            marginTop: 12,
            padding: 16,
            borderRadius: 12,
            background: '#F2F3FA',
            border: '1px solid #E2E4F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <code
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#1A1D2E',
              fontFamily: "'DM Mono', monospace",
              letterSpacing: '.5px',
              wordBreak: 'break-all',
            }}
          >
            {result.temp_password}
          </code>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button className="btn bp bsm" onClick={copy} type="button">
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="btn bs bsm" onClick={download} type="button">
              Download
            </button>
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn bp" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Temp password (expanded row) ───────────────────────────────────────────
// Only rendered while the invite is still open: the backend drops its readable
// copy the moment the user sets their own password, so an active user has
// nothing to show here. Revealing is a deliberate click, not a field on the
// list, so a live credential is only fetched when the admin asks for it.
function TempPasswordControls({ user }: { user: AdminUserRow }) {
  const { toast } = useToast();
  const [password, setPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState<'reveal' | 'regen' | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const reveal = async () => {
    setBusy('reveal');
    setError('');
    try {
      const res = await adminConsole.getTempPassword(user.user_id);
      setPassword(res.temp_password);
    } catch (e) {
      // A row that went stale (they activated since it loaded) 409s, and the
      // backend's `detail` already says exactly that — show it as-is.
      setError(e instanceof Error ? e.message : 'Could not read the temporary password.');
    } finally {
      setBusy(null);
    }
  };

  const regenerate = async () => {
    setConfirming(false);
    setBusy('regen');
    setError('');
    try {
      const res = await adminConsole.regenerateTempPassword(user.user_id);
      setPassword(res.temp_password);
      toast({
        title: 'Temporary password regenerated',
        description: res.email_sent
          ? (res.email_message ?? `The new password was emailed to ${user.email}.`)
          : `${res.email_message ?? 'The email could not be sent.'} Copy it below and pass it on.`,
        variant: res.email_sent ? 'success' : 'default',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not regenerate the temporary password.');
    } finally {
      setBusy(null);
    }
  };

  const copy = () => {
    if (!password) return;
    navigator.clipboard?.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>Temporary password</span>
      {password ? (
        <>
          <code
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#1A1D2E',
              fontFamily: "'DM Mono', monospace",
              letterSpacing: '.5px',
              background: '#F2F3FA',
              border: '1px solid #E2E4F0',
              borderRadius: 6,
              padding: '5px 9px',
              wordBreak: 'break-all',
            }}
          >
            {password}
          </code>
          <button
            className="btn bs bsm"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copy();
            }}
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </>
      ) : (
        user.has_temp_password && (
          <button
            className="btn bs bsm"
            type="button"
            disabled={busy !== null}
            onClick={(e) => {
              e.stopPropagation();
              reveal();
            }}
          >
            {busy === 'reveal' ? 'Showing…' : 'Show'}
          </button>
        )
      )}
      <button
        className="btn bs bsm"
        type="button"
        disabled={busy !== null}
        onClick={(e) => {
          e.stopPropagation();
          setConfirming(true);
        }}
      >
        {busy === 'regen' ? 'Regenerating…' : 'Regenerate'}
      </button>
      {error && (
        <span style={{ fontSize: 10, color: '#E5484D' }} role="alert">
          {error}
        </span>
      )}
      {confirming && (
        <RegenerateConfirmModal
          email={user.email}
          onCancel={() => setConfirming(false)}
          onConfirm={regenerate}
        />
      )}
    </div>
  );
}

// Regenerating invalidates a password the user may already be holding, so it
// gets a confirmation — in the page's own modal shell rather than the browser's
// window.confirm, which can't be styled and reads as a security warning.
function RegenerateConfirmModal({
  email,
  onCancel,
  onConfirm,
}: {
  email: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content"
        style={{ width: 420, padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D2E' }}>
          Regenerate temporary password?
        </div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 8, lineHeight: 1.6 }}>
          A new temporary password will be issued for <strong>{email}</strong> and emailed to
          them. Their current one stops working immediately.
        </div>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn bs" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn bp" type="button" onClick={onConfirm}>
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [view, setView] = useState<View>('users');

  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<BackendRole | null>(null);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const { toast } = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  // Only set when the invite email failed and the temp password needs handing
  // over in person; a successful invite just toasts.
  const [inviteResult, setInviteResult] = useState<InviteUserResponse | null>(null);

  // Active departments, fetched once per page load and shared by the invite
  // modal and every expanded-row department dropdown (no per-row fetching).
  const [departments, setDepartments] = useState<Department[]>([]);

  const fetchUsers = () => {
    setLoading(true);
    setError('');
    adminConsole
      .listUsers()
      .then((res) => {
        // Accept either a raw array or a `{ users: [...] }` wrapper.
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.users)
            ? res.users
            : [];
        setUsers(list.map(normalizeUser));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
    // Departments — load once, keep only active ones. Tolerate either a raw
    // array or a `{ departments: [...] }` wrapper.
    adminConsole
      .listDepartments()
      .then((res) => {
        const list = Array.isArray(res)
          ? res
          : Array.isArray(res?.departments)
            ? res.departments
            : [];
        setDepartments(list.filter((d) => d.is_active !== false));
      })
      .catch(() => setDepartments([]));
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const u of users) c[u.role] = (c[u.role] ?? 0) + 1;
    return c;
  }, [users]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: users.length };
    for (const u of users) c[u.status] = (c[u.status] ?? 0) + 1;
    return c;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (roleFilter && u.role !== roleFilter) return false;
      if (q && !`${u.full_name} ${u.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, statusFilter, roleFilter, search]);

  const changeRole = async (u: AdminUserRow, role: BackendRole) => {
    setRowBusy(u.user_id);
    try {
      await admin.updateUserRole(u.user_id, role);
      fetchUsers();
    } catch {
      /* surfaced via refetch / no-op */
    } finally {
      setRowBusy(null);
    }
  };

  const changeStatus = async (u: AdminUserRow, status: UserStatus) => {
    setRowBusy(u.user_id);
    try {
      await admin.updateUserStatus(u.user_id, status);
      fetchUsers();
    } finally {
      setRowBusy(null);
    }
  };

  const changeDepartment = async (u: AdminUserRow, departmentId: string) => {
    if (!departmentId || departmentId === u.department_id) return;
    setRowBusy(u.user_id);
    try {
      await adminConsole.updateUserDepartment(u.user_id, departmentId);
      fetchUsers();
    } catch {
      /* surfaced via refetch / no-op */
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#1A1D2E' }}>Users &amp; Roles</h2>
          <p style={{ fontSize: 12, color: '#5A6080', marginTop: 2 }}>
            Manage who has access to Centriyon and what they can do.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn bs"
            type="button"
            onClick={() => setView(view === 'users' ? 'matrix' : 'users')}
          >
            {view === 'users' ? 'Permission matrix' : 'View users'}
          </button>
          <button className="btn bp" type="button" onClick={() => setInviteOpen(true)}>
            + Invite user
          </button>
        </div>
      </div>

      <RoleCards
        counts={counts}
        active={roleFilter}
        onPick={(r) => setRoleFilter((prev) => (prev === r ? null : r))}
      />

      {view === 'users' ? (
        <UsersView
          loading={loading}
          error={error}
          rows={filtered}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          statusCounts={statusCounts}
          search={search}
          setSearch={setSearch}
          expanded={expanded}
          setExpanded={setExpanded}
          meId={me?.user_id}
          rowBusy={rowBusy}
          departments={departments}
          onChangeRole={changeRole}
          onChangeStatus={changeStatus}
          onChangeDepartment={changeDepartment}
        />
      ) : (
        <PermissionMatrixView highlight={roleFilter} />
      )}

      {inviteOpen && (
        <InviteModal
          departments={departments}
          onClose={() => setInviteOpen(false)}
          onInvited={(res) => {
            setInviteOpen(false);
            // A delivered invite leaves nothing to interact with — a toast says
            // it and gets out of the way. The modal is only for the case where
            // the admin has to hand the password over themselves.
            if (res.email_sent) {
              toast({
                title: 'User invited',
                description: res.email_message ?? `Invite sent to ${res.email}.`,
                variant: 'success',
              });
            } else {
              setInviteResult(res);
            }
            fetchUsers();
          }}
        />
      )}
      {inviteResult && (
        <InviteResultModal result={inviteResult} onClose={() => setInviteResult(null)} />
      )}
    </div>
  );
}

// ── Users table ────────────────────────────────────────────────────────────
function UsersView(props: {
  loading: boolean;
  error: string;
  rows: AdminUserRow[];
  statusFilter: StatusFilter;
  setStatusFilter: (s: StatusFilter) => void;
  statusCounts: Record<string, number>;
  search: string;
  setSearch: (s: string) => void;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  meId?: string;
  rowBusy: string | null;
  departments: Department[];
  onChangeRole: (u: AdminUserRow, role: BackendRole) => void;
  onChangeStatus: (u: AdminUserRow, status: UserStatus) => void;
  onChangeDepartment: (u: AdminUserRow, departmentId: string) => void;
}) {
  const {
    loading,
    error,
    rows,
    statusFilter,
    setStatusFilter,
    statusCounts,
    search,
    setSearch,
    expanded,
    setExpanded,
    meId,
    rowBusy,
    departments,
    onChangeRole,
    onChangeStatus,
    onChangeDepartment,
  } = props;

  return (
    <>
      {/* Filters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <div className="tabs" style={{ marginBottom: 0 }}>
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              className={`tab ${statusFilter === t.key ? 'act' : ''}`}
              onClick={() => setStatusFilter(t.key)}
            >
              {t.label} {statusCounts[t.key] ?? 0}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', width: 240 }}>
          <input
            className="inp"
            placeholder="Search name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30 }}
          />
          <svg
            viewBox="0 0 13 13"
            width="13"
            height="13"
            fill="none"
            style={{ position: 'absolute', left: 11, top: 11, color: '#9BA3C4' }}
          >
            <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="uhead">
          <div>
            <span className="uhead-title">Team members</span>
            <span className="uhead-count">{rows.length}</span>
          </div>
          <span style={{ fontSize: 11, color: '#9BA3C4' }}>Click a row to manage</span>
        </div>
        {loading ? (
          <Spinner />
        ) : error ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#5A6080' }}>
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D2E' }}>No users match these filters</div>
            <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 4 }}>
              Try a different status tab or clear your search.
            </div>
          </div>
        ) : (
          <table className="utable">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Status</th>
                <th>Onboarding</th>
                <th>Last active</th>
                <th style={{ textAlign: 'right' }}>Reports</th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const meta = ROLE_DISPLAY[u.role];
                const isOpen = expanded === u.user_id;
                const isSelf = meId === u.user_id;
                return (
                  <RowGroup key={u.user_id}>
                    <tr
                      className="urow"
                      style={{ cursor: 'pointer', background: isOpen ? '#FAFBFE' : undefined }}
                      onClick={() => setExpanded(isOpen ? null : u.user_id)}
                    >
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            className="av av-ring"
                            style={{
                              background: gradientFor(u.user_id),
                              width: 38,
                              height: 38,
                              fontSize: 12,
                            }}
                          >
                            {initialsOf(u.full_name)}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#1A1D2E', fontSize: 12.5 }}>{u.full_name}</div>
                            <div style={{ fontSize: 11, color: '#9BA3C4', marginTop: 1 }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${meta.badgeClass}`}>● {roleLabel(u.role, u.department_code)}</span>
                      </td>
                      <td>
                        {u.department_name ? (
                          <span>
                            <span style={{ fontWeight: 600 }}>{u.department_name}</span>
                            {u.department_code && (
                              <span style={{ color: '#9BA3C4', marginLeft: 6 }}>
                                ({u.department_code})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: '#C4C9DD' }}>—</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={u.status} />
                      </td>
                      <td>
                        {u.onboarding_completed == null ? (
                          <span style={{ color: '#C4C9DD' }}>—</span>
                        ) : u.onboarding_completed ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#16A34A' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A' }} />
                            Complete
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#B45309' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F59E0B' }} />
                            Pending
                          </span>
                        )}
                      </td>
                      <td style={{ color: '#5A6080' }}>
                        {u.last_active ? (
                          relativeTime(u.last_active)
                        ) : (
                          <span style={{ color: '#C4C9DD' }}>Never</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: u.reports_count ? '#1A1D2E' : '#C4C9DD' }}>
                        {u.reports_count ?? 0}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`uchev ${isOpen ? 'open' : ''}`}>
                          <svg
                            viewBox="0 0 12 12"
                            width="11"
                            height="11"
                            fill="none"
                            style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: '.15s' }}
                          >
                            <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ background: '#FAFBFE', padding: '14px 16px', borderBottom: '1px solid #F4F5FB' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                            {SHOW_CHANGE_ROLE && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
                                Change role
                              </span>
                              <select
                                className="inp sel"
                                style={{ width: 180, padding: '6px 28px 6px 10px' }}
                                value={ASSIGNABLE_ROLES.includes(u.role) ? u.role : ''}
                                disabled={isSelf || rowBusy === u.user_id}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => onChangeRole(u, e.target.value as BackendRole)}
                              >
                                {u.role === 'admin' && <option value="">Admin (locked)</option>}
                                {ASSIGNABLE_ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_DISPLAY[r].label}
                                  </option>
                                ))}
                              </select>
                              {isSelf && (
                                <span style={{ fontSize: 10, color: '#9BA3C4' }}>
                                  You can’t change your own role
                                </span>
                              )}
                            </div>
                            )}

                            {/* Change department — for department_user and hod. They
                                must always belong to a department, so there's no
                                "none" option. */}
                            {(u.role === 'department_user' || u.role === 'hod') && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
                                  Change department
                                </span>
                                <select
                                  className="inp sel"
                                  style={{ width: 200, padding: '6px 28px 6px 10px' }}
                                  value={u.department_id ?? ''}
                                  disabled={isSelf || rowBusy === u.user_id || departments.length === 0}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => onChangeDepartment(u, e.target.value)}
                                >
                                  {/* Surface the current department even if it's
                                      inactive / missing from the active list. */}
                                  {u.department_id &&
                                    !departments.some((d) => d.id === u.department_id) && (
                                      <option value={u.department_id}>
                                        {u.department_name ?? 'Current department'}
                                        {u.department_code ? ` (${u.department_code})` : ''}
                                      </option>
                                    )}
                                  {!u.department_id && <option value="">Select a department</option>}
                                  {departments.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.department_name} ({d.department_code})
                                    </option>
                                  ))}
                                </select>
                                {isSelf && (
                                  <span style={{ fontSize: 10, color: '#9BA3C4' }}>
                                    You can’t change your own department
                                  </span>
                                )}
                              </div>
                            )}

                            {SHOW_SUSPEND_USER && (u.status !== 'suspended' ? (
                              <button
                                className="btn bs bsm"
                                disabled={isSelf || rowBusy === u.user_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeStatus(u, 'suspended');
                                }}
                              >
                                Suspend user
                              </button>
                            ) : (
                              <button
                                className="btn bs bsm"
                                disabled={rowBusy === u.user_id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onChangeStatus(u, 'active');
                                }}
                              >
                                Reactivate user
                              </button>
                            ))}

                            {/* Until they activate. `has_temp_password` alone
                                isn't enough: an invite created before the
                                backend had an encryption key has nothing
                                stored, and regenerating is the way out. */}
                            {(u.status === 'invited' || u.has_temp_password) && (
                              <TempPasswordControls user={u} />
                            )}

                            {u.status === 'invited' && u.invite_link && (
                              <button
                                className="btn bs bsm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard?.writeText(u.invite_link as string);
                                }}
                              >
                                Copy invite link
                              </button>
                            )}

                            {/* With role + suspend hidden, an active admin/PM with no temp
                                password has nothing left here — say so rather than opening
                                a blank strip. */}
                            {!SHOW_CHANGE_ROLE &&
                              !SHOW_SUSPEND_USER &&
                              u.role !== 'department_user' &&
                              u.role !== 'hod' &&
                              u.status !== 'invited' &&
                              !u.has_temp_password && (
                                <span style={{ fontSize: 11, color: '#9BA3C4' }}>
                                  No actions available for this user.
                                </span>
                              )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </RowGroup>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// Fragment wrapper so each user maps to two <tr> rows without key warnings.
function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Permission matrix ──────────────────────────────────────────────────────
function PermissionMatrixView({ highlight }: { highlight: BackendRole | null }) {
  const [matrix, setMatrix] = useState<PermissionMatrix>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adminConsole
      .getPermissions()
      .then((res) => {
        if (alive) setMatrix(res ?? {});
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load permissions.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const isChecked = (role: BackendRole, cap: string) =>
    role === 'admin' ? true : !!matrix[role]?.[cap];

  const toggle = (role: BackendRole, cap: string) => {
    if (role === 'admin') return; // locked
    const next = !isChecked(role, cap);
    setMatrix((prev) => ({
      ...prev,
      [role]: { ...(prev[role] ?? {}), [cap]: next },
    }));
    const k = `${role}:${cap}`;
    clearTimeout(timers.current[k]);
    timers.current[k] = setTimeout(() => {
      adminConsole
        .savePermissions({ role, capability: cap, enabled: next })
        .catch(() => {
          /* keep optimistic state; backend remains source of truth on reload */
        });
    }, 500);
  };

  const cols = ROLE_ORDER;

  if (loading) {
    return (
      <div className="card">
        <Spinner />
      </div>
    );
  }
  if (error) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center', fontSize: 12, color: '#5A6080' }}>
        {error}
      </div>
    );
  }

  const cellBox = (checked: boolean, locked: boolean, accent: string) => (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 6,
        background: checked ? (locked ? '#E8EAF5' : accent) : '#fff',
        border: checked ? 'none' : '1.5px solid #E2E4F0',
        color: checked ? (locked ? '#5A6080' : '#fff') : '#C4C9DD',
        fontSize: 12,
        cursor: locked ? 'default' : 'pointer',
      }}
    >
      {checked ? '✓' : '✕'}
    </span>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #ECEEF8' }}>
            <th
              style={{
                textAlign: 'left',
                padding: '14px 16px',
                fontSize: 10,
                fontWeight: 700,
                color: '#9BA3C4',
                textTransform: 'uppercase',
                letterSpacing: '.5px',
              }}
            >
              Capability
            </th>
            {cols.map((role) => (
              <th
                key={role}
                style={{
                  padding: '14px 8px',
                  textAlign: 'center',
                  background: highlight === role ? 'rgba(64,64,200,.05)' : undefined,
                }}
              >
                <span className={`badge ${ROLE_DISPLAY[role].badgeClass}`}>
                  ● {ROLE_DISPLAY[role].label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAPABILITY_GROUPS.map((group) => (
            <RowGroup key={group.section}>
              <tr>
                <td
                  colSpan={1 + cols.length}
                  style={{
                    padding: '12px 16px 6px',
                    fontSize: 9,
                    fontWeight: 700,
                    color: '#9BA3C4',
                    textTransform: 'uppercase',
                    letterSpacing: '.6px',
                    background: '#FAFBFE',
                  }}
                >
                  {group.section}
                </td>
              </tr>
              {group.caps.map((cap) => (
                <tr key={cap.key} style={{ borderTop: '1px solid #F4F5FB' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#1A1D2E' }}>{cap.label}</td>
                  {cols.map((role) => {
                    const locked = role === 'admin';
                    const checked = isChecked(role, cap.key);
                    return (
                      <td
                        key={role}
                        style={{
                          textAlign: 'center',
                          padding: '8px',
                          background: highlight === role ? 'rgba(64,64,200,.04)' : undefined,
                        }}
                        onClick={() => !locked && toggle(role, cap.key)}
                      >
                        {cellBox(checked, locked, ROLE_DISPLAY[role].dot === '#0D9488' ? '#0D9488' : PRIMARY)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </RowGroup>
          ))}
        </tbody>
      </table>
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #ECEEF8',
          fontSize: 11,
          color: '#9BA3C4',
          background: '#FAFBFE',
        }}
      >
        🔒 Admin retains all capabilities and can’t be restricted. Changes apply to every user with
        that role.
      </div>
    </div>
  );
}
