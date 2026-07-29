import { useState } from 'react';
import { team, type TeamMember } from '@/lib/api';
import { downloadText } from '@/lib/utils';

// Backend `position_type` enum — only these five values are accepted by the
// API. Anything else returns 422, so the form must never send a stale value.
export type PositionType =
  | 'executive'
  | 'board_member'
  | 'investor_contact'
  | 'esg_lead'
  | 'other';

export const POSITION_LABELS: Record<PositionType, string> = {
  executive: 'Executive',
  board_member: 'Board Member',
  investor_contact: 'Investor',
  esg_lead: 'ESG Lead',
  other: 'Other',
};

export const POSITION_OPTIONS: Array<{ value: PositionType; label: string }> = [
  { value: 'executive', label: POSITION_LABELS.executive },
  { value: 'board_member', label: POSITION_LABELS.board_member },
  { value: 'investor_contact', label: POSITION_LABELS.investor_contact },
  { value: 'esg_lead', label: POSITION_LABELS.esg_lead },
  { value: 'other', label: POSITION_LABELS.other },
];

interface AddPersonDialogProps {
  companyId: string;
  companyName: string;
  onClose: () => void;
  onAdded: (member: TeamMember) => void;
}

export default function AddPersonDialog({
  companyId,
  companyName,
  onClose,
  onAdded,
}: AddPersonDialogProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [positionType, setPositionType] = useState<PositionType>('executive');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only set when the backend couldn't email the invite — then the admin has
  // to pass the password on, so the dialog stays open to show it.
  const [undelivered, setUndelivered] = useState<{
    message: string;
    tempPassword: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit =
    firstName.trim().length > 0 &&
    companyName.trim().length > 0 &&
    positionType.length > 0 &&
    /\S+@\S+\.\S+/.test(email.trim());

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    try {
      // No temp_password: the backend generates one and emails it.
      const res = await team.create(companyId, {
        email: email.trim(),
        full_name: fullName,
        position_type: positionType,
        bio: bio.trim() || undefined,
        // External meeting guests (consultants, investors, board members) are
        // view-only participants — provision them as IR, never department_user.
        role: 'ir',
      });
      const member: TeamMember = res.member ?? {
        id: '',
        email: email.trim(),
        full_name: fullName,
        position_type: positionType,
        status: 'pending',
      };
      onAdded(member);
      if (res.email_sent === false && res.temp_password) {
        setUndelivered({
          message: res.email_message ?? 'The invite email could not be sent.',
          tempPassword: res.temp_password,
        });
        setSubmitting(false);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add person.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
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
            onClick={onClose}
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
        {undelivered ? (
          <div style={{ padding: '4px 24px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              role="alert"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#B45309',
                background: 'rgba(245,158,11,.1)',
                border: '1px solid rgba(245,158,11,.28)',
                padding: '8px 12px',
                borderRadius: 8,
              }}
            >
              {undelivered.message} It won&apos;t be shown again.
            </div>
            <div
              style={{
                padding: 14,
                borderRadius: 10,
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
                  fontSize: 15,
                  fontWeight: 700,
                  color: '#1A1D2E',
                  fontFamily: "'DM Mono', ui-monospace, monospace",
                  letterSpacing: '.5px',
                  wordBreak: 'break-all',
                }}
              >
                {undelivered.tempPassword}
              </code>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(undelivered.tempPassword).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1800);
                    });
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                    background: '#4040C8',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadText(
                      `centriyon-temp-password-${email.trim().replace(/[^\w.@-]/g, '_')}.txt`,
                      [
                        'Centriyon — Temporary password',
                        '',
                        `Account:            ${email.trim()}`,
                        `Temporary password: ${undelivered.tempPassword}`,
                        '',
                      ].join('\n'),
                    )
                  }
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#4040C8',
                    background: '#fff',
                    border: '1.5px solid #E2E4F0',
                    borderRadius: 6,
                    cursor: 'pointer',
                  }}
                >
                  Download
                </button>
              </div>
            </div>
          </div>
        ) : (
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
              <span className="fl-label">
                First Name <span style={{ color: '#E5484D' }}>*</span>
              </span>
              <input
                className="inp"
                placeholder="Ahmad"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>
            <div>
              <span className="fl-label">Last Name</span>
              <input
                className="inp"
                placeholder="Al-Rashid"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>
          <div>
            <span className="fl-label">
              Role <span style={{ color: '#E5484D' }}>*</span>
            </span>
            <select
              className="inp sel"
              value={positionType}
              onChange={(e) => setPositionType(e.target.value as PositionType)}
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
            <span className="fl-label">
              Organisation <span style={{ color: '#E5484D' }}>*</span>
            </span>
            <input
              className="inp"
              value={companyName}
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
            <span className="fl-label">
              Email <span style={{ color: '#E5484D' }}>*</span>
            </span>
            <input
              className="inp"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div>
            <span className="fl-label">Bio / Notes</span>
            <textarea
              className="inp"
              rows={3}
              placeholder="Background, expertise, committee memberships..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
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
        )}
        <div
          style={{
            padding: '14px 24px 18px',
            borderTop: '1px solid #ECEEF8',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          {!undelivered && (
            <button
              type="button"
              onClick={onClose}
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
          )}
          <button
            type="button"
            onClick={undelivered ? onClose : handleSubmit}
            disabled={!undelivered && (!canSubmit || submitting)}
            style={{
              padding: '9px 18px',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
              background: '#4040C8',
              border: 'none',
              borderRadius: 10,
              cursor: !undelivered && (!canSubmit || submitting) ? 'not-allowed' : 'pointer',
              opacity: !undelivered && (!canSubmit || submitting) ? 0.55 : 1,
              boxShadow: '0 3px 10px rgba(64,64,200,.25)',
            }}
          >
            {undelivered ? 'Done' : submitting ? 'Adding…' : 'Add Person'}
          </button>
        </div>
      </div>
    </div>
  );
}
