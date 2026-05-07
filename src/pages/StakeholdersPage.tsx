import { useEffect, useMemo, useState } from 'react';
import { team, type TeamMember } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// Backend `position_type` enum, kept verbatim so the value posted to the
// API is always one of the seven the server accepts.
type PositionType =
  | 'executive'
  | 'board_member'
  | 'investor'
  | 'esg_lead'
  | 'finance'
  | 'operations'
  | 'CTO'
  | 'CEO'
  | 'other';

const POSITION_LABELS: Record<PositionType, string> = {
  executive: 'Executive',
  board_member: 'Board Member',
  investor: 'Investor',
  esg_lead: 'ESG Lead',
  finance: 'Finance',
  operations: 'Operations',
  CTO: 'CTO',
  CEO: 'CEO',
  other: 'Other',
};

// Reuses the existing .b-* badge classes from index.css so colours stay
// consistent with the rest of the app.
const POSITION_BADGE_CLASS: Record<PositionType, string> = {
  executive: 'b-pp',
  board_member: 'b-bl',
  investor: 'b-tl',
  esg_lead: 'b-gn',
  finance: 'b-am',
  operations: 'b-bl',
  CTO: 'b-pp',
  CEO: 'b-pp',
  other: 'b-gy',
};

const POSITION_OPTIONS: Array<{ value: PositionType; label: string }> = [
  { value: 'executive', label: POSITION_LABELS.executive },
  { value: 'board_member', label: POSITION_LABELS.board_member },
  { value: 'investor', label: POSITION_LABELS.investor },
  { value: 'CTO', label: POSITION_LABELS.CTO },
  { value: 'CEO', label: POSITION_LABELS.CEO },
  { value: 'other', label: POSITION_LABELS.other },
];

type TabKey = 'board' | 'investor' | 'executive' | 'other';

const TAB_LABELS: Record<TabKey, string> = {
  board: 'Board Members',
  investor: 'Investors',
  executive: 'Executives',
  other: 'Other',
};

const PLACEHOLDER_LABELS: Record<TabKey, string> = {
  board: 'Add Board Member',
  investor: 'Add Investor',
  executive: 'Add Executive',
  other: 'Add Person',
};

const TAB_POSITIONS: Record<TabKey, PositionType[]> = {
  board: ['board_member'],
  investor: ['investor'],
  executive: ['executive', 'CTO', 'CEO'],
  other: ['esg_lead', 'finance', 'operations', 'other'],
};

const TAB_DEFAULT_POSITION: Record<TabKey, PositionType> = {
  board: 'board_member',
  investor: 'investor',
  executive: 'executive',
  other: 'other',
};

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  positionType: PositionType;
  bio: string;
  status: 'active' | 'inactive' | 'pending';
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#3535B5,#4747CC)',
  'linear-gradient(135deg,#059669,#10B981)',
  'linear-gradient(135deg,#7C3AED,#8B5CF6)',
  'linear-gradient(135deg,#0891B2,#06B6D4)',
  'linear-gradient(135deg,#EA580C,#F97316)',
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function gradientFor(id: string): string {
  return AVATAR_GRADIENTS[hashString(id) % AVATAR_GRADIENTS.length];
}

function initialsOf(p: Person): string {
  const first = p.firstName?.[0] ?? '';
  const last = p.lastName?.[0] ?? '';
  return (first + last).toUpperCase() || '?';
}

function fullName(p: Person): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ');
}

// Split full_name on the first whitespace run. Single-word names land in
// firstName so initialsOf() / display still work.
function splitFullName(s: string): { firstName: string; lastName: string } {
  const trimmed = (s ?? '').trim();
  if (!trimmed) return { firstName: '', lastName: '' };
  const idx = trimmed.search(/\s/);
  if (idx === -1) return { firstName: trimmed, lastName: '' };
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx + 1).trim(),
  };
}

// Cast the backend's free-form position_type string onto the closed enum.
// Unknown values land in 'other' so they still render under the Management
// tab instead of silently disappearing.
function toPositionType(raw: unknown): PositionType {
  if (typeof raw !== 'string') return 'other';
  return raw in POSITION_LABELS ? (raw as PositionType) : 'other';
}

function teamMemberToPerson(m: TeamMember): Person {
  const { firstName, lastName } = splitFullName(m.full_name);
  return {
    id: m.id,
    firstName,
    lastName,
    role: m.title ?? '',
    email: m.email ?? '',
    positionType: toPositionType(m.position_type),
    bio: m.bio ?? '',
    status:
      m.status === 'inactive'
        ? 'inactive'
        : m.status === 'pending'
          ? 'pending'
          : 'active',
  };
}

// Which tab a given position type lives under. Used after a successful
// create to switch to the right tab so the new card is immediately visible.
function tabForPosition(p: PositionType): TabKey {
  if (p === 'board_member') return 'board';
  if (p === 'investor') return 'investor';
  if (p === 'executive' || p === 'CTO' || p === 'CEO') return 'executive';
  return 'other';
}

// 12-char password using the browser CSPRNG. Backend forces rotation on
// first login (must_change_password=TRUE), so this just needs to be hard
// enough to discourage guessing while the new user logs in.
function generateTempPassword(): string {
  const chars =
    'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len = 12;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join('');
  }
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

interface PersonFormState {
  firstName: string;
  lastName: string;
  role: string;
  organisation: string;
  email: string;
  positionType: PositionType;
  bio: string;
}

const EMPTY_FORM: PersonFormState = {
  firstName: '',
  lastName: '',
  role: '',
  organisation: '',
  email: '',
  positionType: 'board_member',
  bio: '',
};

interface CreatedCredential {
  fullName: string;
  email: string;
  tempPassword: string;
}

export default function StakeholdersPage() {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;
  const companyName = user?.company_name ?? '';

  const [people, setPeople] = useState<Person[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('board');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PersonFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState<boolean>(!!companyId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Surfaces the temp password back to the admin after a successful create
  // so they can copy it and pass it on. Cleared when the admin dismisses
  // the banner.
  const [createdCredential, setCreatedCredential] =
    useState<CreatedCredential | null>(null);

  const fetchPeople = async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await team.list(id);
      setPeople(data.map(teamMemberToPerson));
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load team.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setPeople([]);
      return;
    }
    void fetchPeople(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const visiblePeople = useMemo(() => {
    const allowed = TAB_POSITIONS[activeTab];
    return people.filter((p) => allowed.includes(p.positionType));
  }, [people, activeTab]);

  const openAddModal = (defaultTab?: TabKey) => {
    setSubmitError(null);
    const tab = defaultTab ?? activeTab;
    setForm({
      ...EMPTY_FORM,
      organisation: companyName,
      positionType: TAB_DEFAULT_POSITION[tab],
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
  };

  const updateForm = <K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.organisation.trim().length > 0 &&
    form.positionType.length > 0 &&
    /\S+@\S+\.\S+/.test(form.email.trim());

  const handleSubmit = async () => {
    if (!canSubmit || submitting || !companyId) return;
    const fullNameValue = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    const tempPassword = generateTempPassword();
    setSubmitting(true);
    setSubmitError(null);
    try {
      await team.create(companyId, {
        email: form.email.trim(),
        full_name: fullNameValue,
        temp_password: tempPassword,
        title: form.role.trim() || undefined,
        position_type: form.positionType,
        bio: form.bio.trim() || undefined,
        // Backend default is "department_user"; making it explicit means we
        // don't accidentally promote anyone to admin/PM via the form.
        role: 'department_user',
      });
      // Refetch instead of trusting the create response shape — the OpenAPI
      // says it returns a string, which gives us no guarantee of full row
      // fields. The list endpoint is the source of truth.
      await fetchPeople(companyId);
      setActiveTab(tabForPosition(form.positionType));
      setModalOpen(false);
      setCreatedCredential({
        fullName: fullNameValue,
        email: form.email.trim(),
        tempPassword,
      });
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to create person.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div
        style={{
          marginBottom: 14,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1A1D2E' }}>
            Leadership
          </h2>
          <p style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}>
            Board members, institutional investors &amp; key stakeholders
          </p>
        </div>
        <button
          type="button"
          onClick={() => openAddModal()}
          disabled={!companyId}
          style={{
            padding: '9px 18px',
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 10,
            border: 'none',
            background: '#4040C8',
            color: '#fff',
            cursor: companyId ? 'pointer' : 'not-allowed',
            opacity: companyId ? 1 : 0.55,
            boxShadow: '0 3px 10px rgba(64,64,200,.25)',
          }}
        >
          + Add Person
        </button>
      </div>

      {createdCredential && (
        <CredentialBanner
          credential={createdCredential}
          onDismiss={() => setCreatedCredential(null)}
        />
      )}

      {loadError && !loading && (
        <div
          role="alert"
          style={{
            marginBottom: 14,
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(229,72,77,.08)',
            border: '1px solid rgba(229,72,77,.25)',
            color: '#B33A3E',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {loadError}
        </div>
      )}

      <div className="tabs">
        {(['board', 'investor', 'executive', 'other'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`tab ${activeTab === t ? 'act' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <PeopleSkeleton />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
            marginBottom: 18,
          }}
        >
          {visiblePeople.map((p) => (
            <div
              key={p.id}
              className="person-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: 18,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: gradientFor(p.id),
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {initialsOf(p)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: '#1A1D2E',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fullName(p)}
                    </div>
                    {p.role && (
                      <div
                        style={{ fontSize: 11, color: '#5A6080', marginTop: 2 }}
                      >
                        {p.role}
                      </div>
                    )}
                    {companyName && (
                      <div
                        style={{ fontSize: 10, color: '#9BA3C4', marginTop: 2 }}
                      >
                        {companyName}
                      </div>
                    )}
                  </div>
                </div>
                <span
                  className={
                    p.status === 'active'
                      ? 'b-gn'
                      : p.status === 'pending'
                        ? 'b-am'
                        : 'b-gy'
                  }
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {p.status === 'active'
                    ? 'Active'
                    : p.status === 'pending'
                      ? 'Pending'
                      : 'Inactive'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginTop: 'auto',
                }}
              >
                <span
                  className={POSITION_BADGE_CLASS[p.positionType]}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 999,
                  }}
                >
                  {POSITION_LABELS[p.positionType]}
                </span>
                {p.email && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#9BA3C4',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                    title={p.email}
                  >
                    {p.email}
                  </div>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => openAddModal(activeTab)}
            disabled={!companyId}
            aria-label={PLACEHOLDER_LABELS[activeTab]}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 168,
              padding: 18,
              border: '1.5px dashed #C7CBE0',
              borderRadius: 14,
              background: 'transparent',
              color: '#9BA3C4',
              fontSize: 12,
              fontWeight: 600,
              cursor: companyId ? 'pointer' : 'not-allowed',
              transition: '.15s',
            }}
            onMouseEnter={(e) => {
              if (!companyId) return;
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = '#4040C8';
              el.style.color = '#4040C8';
              el.style.background = 'rgba(64,64,200,.04)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.borderColor = '#C7CBE0';
              el.style.color = '#9BA3C4';
              el.style.background = 'transparent';
            }}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 4v14M4 11h14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span>{PLACEHOLDER_LABELS[activeTab]}</span>
          </button>
        </div>
      )}

      {modalOpen && (
        <AddPersonModal
          form={form}
          canSubmit={canSubmit}
          submitting={submitting}
          error={submitError}
          onChange={updateForm}
          onCancel={closeModal}
          onSubmit={() => void handleSubmit()}
        />
      )}
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14,
        marginBottom: 18,
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: '#fff',
            borderRadius: 14,
            border: '1px solid #E2E4F0',
            padding: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            minHeight: 168,
          }}
        >
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="skel" style={{ width: 44, height: 44, borderRadius: 10 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="skel" style={{ height: 12, width: '70%' }} />
              <div className="skel" style={{ height: 10, width: '50%' }} />
              <div className="skel" style={{ height: 9, width: '40%' }} />
            </div>
          </div>
          <div className="skel" style={{ height: 11, width: '60%' }} />
        </div>
      ))}
    </div>
  );
}

interface CredentialBannerProps {
  credential: CreatedCredential;
  onDismiss: () => void;
}

function CredentialBanner({ credential, onDismiss }: CredentialBannerProps) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(credential.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers / non-https contexts — silently ignore; the value is
      // visible in the banner so the admin can copy by hand.
    }
  };
  return (
    <div
      role="status"
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        borderRadius: 10,
        background: 'rgba(34,197,94,.08)',
        border: '1px solid rgba(34,197,94,.25)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>
          {credential.fullName} added — share their temp password
        </div>
        <div style={{ fontSize: 11, color: '#166534', marginTop: 3 }}>
          {credential.email}. They&apos;ll be required to change it on first login.
        </div>
      </div>
      <code
        style={{
          fontFamily: "'DM Mono', ui-monospace, monospace",
          fontSize: 12,
          fontWeight: 700,
          color: '#1A1D2E',
          background: '#fff',
          border: '1px solid #BBE5C5',
          padding: '5px 10px',
          borderRadius: 6,
          letterSpacing: '.5px',
        }}
      >
        {credential.tempPassword}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 700,
          color: '#fff',
          background: '#16A34A',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          border: '1px solid #BBE5C5',
          background: '#fff',
          color: '#16A34A',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M2 2l6 6M8 2l-6 6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

interface AddPersonModalProps {
  form: PersonFormState;
  canSubmit: boolean;
  submitting: boolean;
  error: string | null;
  onChange: <K extends keyof PersonFormState>(
    key: K,
    value: PersonFormState[K],
  ) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function AddPersonModal({
  form,
  canSubmit,
  submitting,
  error,
  onChange,
  onCancel,
  onSubmit,
}: AddPersonModalProps) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content"
        style={{ width: 460, padding: 0 }}
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
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: '#1A1D2E',
              letterSpacing: '-.3px',
            }}
          >
            Add Person
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1.5px solid #E2E4F0',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: '#5A6080',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 2l7 7M9 2l-7 7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div
          style={{
            padding: '4px 24px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span className="fl-label">First Name <span style={{ color: '#E5484D' }}>*</span></span>
              <input
                className="inp"
                placeholder="Ahmad"
                value={form.firstName}
                onChange={(e) => onChange('firstName', e.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>
            <div>
              <span className="fl-label">Last Name</span>
              <input
                className="inp"
                placeholder="Al-Rashid"
                value={form.lastName}
                onChange={(e) => onChange('lastName', e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div>
            <span className="fl-label">Role / Title <span style={{ color: '#E5484D' }}>*</span></span>
            <select
              className="inp sel"
              value={form.positionType}
              onChange={(e) =>
                onChange('positionType', e.target.value as PositionType)
              }
              disabled={submitting}
            >
              {POSITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="fl-label">Organisation <span style={{ color: '#E5484D' }}>*</span></span>
            <input
              className="inp"
              value={form.organisation}
              readOnly
              tabIndex={-1}
              title="Locked to your company"
              style={{
                background: '#F5F6FB',
                color: '#5A6080',
                cursor: 'not-allowed',
              }}
            />
          </div>
          <div>
            <span className="fl-label">Email <span style={{ color: '#E5484D' }}>*</span></span>
            <input
              className="inp"
              type="email"
              placeholder="name@example.com"
              value={form.email}
              onChange={(e) => onChange('email', e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <span className="fl-label">Bio / Notes</span>
            <textarea
              className="inp"
              rows={3}
              placeholder="Background, expertise, committee memberships..."
              value={form.bio}
              onChange={(e) => onChange('bio', e.target.value)}
              disabled={submitting}
              style={{ resize: 'vertical', minHeight: 72, fontFamily: 'inherit' }}
            />
          </div>
          {error && (
            <div
              role="alert"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#B33A3E',
                background: 'rgba(229,72,77,.08)',
                border: '1px solid rgba(229,72,77,.25)',
                padding: '8px 12px',
                borderRadius: 8,
              }}
            >
              {error}
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
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '9px 18px',
              fontSize: 12,
              fontWeight: 600,
              color: '#5A6080',
              background: '#fff',
              border: '1.5px solid #E2E4F0',
              borderRadius: 10,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            style={{
              padding: '9px 18px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: '#4040C8',
              border: 'none',
              borderRadius: 10,
              cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer',
              opacity: !canSubmit || submitting ? 0.55 : 1,
              boxShadow: '0 3px 10px rgba(64,64,200,.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {submitting && (
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="3" strokeOpacity="0.3" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {submitting ? 'Adding…' : 'Add Person'}
          </button>
        </div>
      </div>
    </div>
  );
}
