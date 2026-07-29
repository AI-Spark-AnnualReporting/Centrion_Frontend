import { useEffect, useMemo, useState } from 'react';
import { meetings as meetingsApi, team, type TeamMember } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type {
  CreateMeetingBody,
  Meeting,
  MeetingPlatform,
  MeetingType,
} from '@/types/meeting';
import AddPersonDialog from '@/components/AddPersonDialog';

const TYPE_OPTIONS: { value: MeetingType; label: string }[] = [
  { value: 'investor_call', label: 'Investor Call' },
  { value: 'esg_briefing', label: 'ESG Briefing' },
  { value: 'one_on_one', label: '1-on-1' },
  { value: 'board_meeting', label: 'Board Meeting' },
  { value: 'roadshow', label: 'Roadshow' },
];

const PLATFORM_OPTIONS: { value: MeetingPlatform; label: string }[] = [
  { value: 'zoom', label: 'Zoom' },
  { value: 'teams', label: 'Microsoft Teams' },
  { value: 'google_meet', label: 'Google Meet' },
  { value: 'in_person', label: 'In-person' },
];

interface ModalState {
  title: string;
  date: string;
  time: string;
  type: MeetingType;
  platform: MeetingPlatform;
  participants: string[];
  agenda: string;
  linkOrLocation: string;
}

const EMPTY_FORM: ModalState = {
  title: '',
  date: '',
  time: '',
  type: 'investor_call',
  platform: 'zoom',
  participants: [],
  agenda: '',
  linkOrLocation: '',
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ScheduleMeetingModal({
  onClose,
  onCreated,
  initialDate,
  companyId,
  companyName,
}: {
  onClose: () => void;
  onCreated: (meeting: Meeting) => void;
  initialDate?: Date | null;
  companyId: string | null;
  companyName: string;
}) {
  const { toast } = useToast();
  const todayIso = useMemo(() => toIsoDate(new Date()), []);
  const [form, setForm] = useState<ModalState>(() => {
    if (initialDate && toIsoDate(initialDate) >= todayIso) {
      return { ...EMPTY_FORM, date: toIsoDate(initialDate) };
    }
    return EMPTY_FORM;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamList, setTeamList] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [participantQuery, setParticipantQuery] = useState('');
  const [participantFocus, setParticipantFocus] = useState(false);

  const update = <K extends keyof ModalState>(key: K, value: ModalState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const fetchTeam = async () => {
    if (!companyId) return;
    setTeamLoading(true);
    setTeamError(null);
    try {
      const data = await team.list(companyId);
      setTeamList(data);
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Failed to load team.');
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    void fetchTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const addParticipant = (email: string) => {
    if (!email) return;
    setForm((f) =>
      f.participants.includes(email)
        ? f
        : { ...f, participants: [...f.participants, email] },
    );
    setParticipantQuery('');
  };

  const removeParticipant = (email: string) => {
    setForm((f) => ({
      ...f,
      participants: f.participants.filter((p) => p !== email),
    }));
  };

  const teamByEmail = useMemo(() => {
    const map = new Map<string, TeamMember>();
    for (const m of teamList) if (m.email) map.set(m.email, m);
    return map;
  }, [teamList]);

  const participantSuggestions = useMemo(() => {
    const q = participantQuery.trim().toLowerCase();
    return teamList
      .filter((m) => !!m.email && !form.participants.includes(m.email))
      .filter((m) => {
        if (!q) return true;
        return (
          (m.full_name ?? '').toLowerCase().includes(q) ||
          (m.email ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [teamList, form.participants, participantQuery]);

  const initialsFor = (m: TeamMember | undefined, email: string): string => {
    const name = m?.full_name?.trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      const first = parts[0]?.[0] ?? '';
      const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
      return (first + last).toUpperCase() || '?';
    }
    return (email[0] ?? '?').toUpperCase();
  };

  const submit = async () => {
    if (!form.title.trim() || !form.date || !form.time) {
      setError('Title, date, and time are required.');
      return;
    }
    if (form.date < todayIso) {
      setError('Meeting date cannot be in the past.');
      return;
    }
    const body: CreateMeetingBody = {
      title: form.title.trim(),
      meeting_date: form.date,
      // Backend expects HH:mm:ss; <input type="time"> emits HH:mm.
      meeting_time: form.time.length === 5 ? `${form.time}:00` : form.time,
      meeting_type: form.type,
      platform: form.platform,
      participants: form.participants,
      agenda: form.agenda.trim(),
      link_or_location: form.linkOrLocation.trim() || undefined,
    };
    setSubmitting(true);
    setError(null);
    try {
      const res = await meetingsApi.create(body);
      onCreated(res.meeting);
      // The modal closes on success, so the invite outcome has to land in a
      // toast. Shown even when the send succeeded — the message is where the
      // backend reports participants it couldn't reach.
      toast({
        title: 'Meeting scheduled',
        description: res.email_message ?? undefined,
        variant: res.email_sent === false ? 'destructive' : undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule meeting.');
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ width: 480, padding: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #ECEEF8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1A1D2E', letterSpacing: '-.3px' }}>Schedule Meeting</div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              border: '1.5px solid #E2E4F0', background: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#5A6080', transition: '.15s',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M2 2l7 7M9 2l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <span className="fl-label">Meeting Title</span>
            <input
              className="inp"
              placeholder="e.g. Q2 Investor Call"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span className="fl-label">Date</span>
              <input className="inp" type="date" min={todayIso} value={form.date} onChange={(e) => update('date', e.target.value)} />
            </div>
            <div>
              <span className="fl-label">Time</span>
              <input className="inp" type="time" value={form.time} onChange={(e) => update('time', e.target.value)} />
            </div>
          </div>
          <div>
            <span className="fl-label">Type</span>
            <select
              className="inp sel"
              value={form.type}
              onChange={(e) => update('type', e.target.value as MeetingType)}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <span className="fl-label">Platform</span>
            <select
              className="inp sel"
              value={form.platform}
              onChange={(e) => update('platform', e.target.value as MeetingPlatform)}
            >
              {PLATFORM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span className="fl-label" style={{ marginBottom: 0 }}>
                Participants
              </span>
              <button
                type="button"
                onClick={() => setAddPersonOpen(true)}
                disabled={!companyId}
                title="Add new person"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#4040C8',
                  background: 'rgba(64,64,200,.08)',
                  border: '1px solid rgba(64,64,200,.2)',
                  borderRadius: 8,
                  padding: '3px 9px',
                  cursor: companyId ? 'pointer' : 'not-allowed',
                  opacity: companyId ? 1 : 0.5,
                }}
              >
                <svg width="9" height="9" viewBox="0 0 11 11" fill="none">
                  <path
                    d="M5.5 1v9M1 5.5h9"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
                Add Person
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <div
                onClick={(e) => {
                  const input = (e.currentTarget as HTMLDivElement).querySelector(
                    'input',
                  ) as HTMLInputElement | null;
                  input?.focus();
                }}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 38,
                  padding: '6px 8px',
                  border: '1px solid #E2E4F0',
                  borderRadius: 10,
                  background: '#fff',
                  cursor: 'text',
                }}
              >
                {form.participants.map((email) => {
                  const m = teamByEmail.get(email);
                  const label = m?.full_name || email;
                  const org = m?.title || m?.position_type || '';
                  return (
                    <span
                      key={email}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 8px 3px 3px',
                        borderRadius: 999,
                        border: '1px solid #DEE0EE',
                        background: '#F5F6FB',
                        fontSize: 12,
                        color: '#1A1D2E',
                        maxWidth: '100%',
                      }}
                    >
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: '#1F4936',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {initialsFor(m, email)}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 200,
                        }}
                      >
                        {label}
                        {org ? (
                          <span style={{ color: '#5A6080', fontWeight: 500 }}>
                            {' '}
                            ({org})
                          </span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          removeParticipant(email);
                        }}
                        aria-label={`Remove ${label}`}
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: '50%',
                          border: 'none',
                          background: 'transparent',
                          color: '#5A6080',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <svg width="8" height="8" viewBox="0 0 11 11" fill="none">
                          <path
                            d="M2 2l7 7M9 2l-7 7"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </span>
                  );
                })}
                <input
                  value={participantQuery}
                  onChange={(e) => setParticipantQuery(e.target.value)}
                  onFocus={() => setParticipantFocus(true)}
                  onBlur={() => {
                    // Delay to allow click on suggestion to register before
                    // the dropdown unmounts.
                    setTimeout(() => setParticipantFocus(false), 150);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Backspace' &&
                      participantQuery === '' &&
                      form.participants.length > 0
                    ) {
                      removeParticipant(
                        form.participants[form.participants.length - 1],
                      );
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (participantSuggestions[0]?.email) {
                        addParticipant(participantSuggestions[0].email);
                      } else {
                        const trimmed = participantQuery.trim();
                        if (/\S+@\S+\.\S+/.test(trimmed)) {
                          addParticipant(trimmed);
                        }
                      }
                    }
                  }}
                  placeholder={
                    form.participants.length === 0 ? 'Type an email address…' : ''
                  }
                  style={{
                    flex: 1,
                    minWidth: 140,
                    border: 'none',
                    outline: 'none',
                    fontSize: 12,
                    background: 'transparent',
                    padding: '4px 2px',
                    fontFamily: 'inherit',
                    color: '#1A1D2E',
                  }}
                />
              </div>
              {participantFocus &&
                (teamLoading ||
                  teamError ||
                  participantSuggestions.length > 0 ||
                  participantQuery.trim().length > 0) && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      maxHeight: 240,
                      overflowY: 'auto',
                      background: '#fff',
                      border: '1px solid #E2E4F0',
                      borderRadius: 10,
                      boxShadow: '0 8px 24px rgba(20,24,60,.12)',
                      zIndex: 50,
                      padding: 4,
                    }}
                  >
                    {teamLoading ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#9BA3C4',
                          padding: '10px 12px',
                        }}
                      >
                        Loading team…
                      </div>
                    ) : teamError ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#DC2626',
                          padding: '10px 12px',
                        }}
                      >
                        {teamError}
                      </div>
                    ) : participantSuggestions.length === 0 ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: '#9BA3C4',
                          padding: '10px 12px',
                        }}
                      >
                        {/* Enter only adds a match or a valid address, so a
                            typed name would otherwise vanish with no reason
                            given. */}
                        {!participantQuery.trim()
                          ? 'No more people to add.'
                          : /\S+@\S+\.\S+/.test(participantQuery.trim())
                            ? 'Press Enter to invite this address.'
                            : 'No matches. Participants are invited by email — type a full address.'}
                      </div>
                    ) : (
                      participantSuggestions.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addParticipant(m.email);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = '#F5F6FB')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = 'transparent')
                          }
                        >
                          <span
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: '50%',
                              background: '#1F4936',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {initialsFor(m, m.email)}
                          </span>
                          <span
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: '#1A1D2E',
                                lineHeight: 1.2,
                              }}
                            >
                              {m.full_name || m.email}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                color: '#5A6080',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.email}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
            </div>
          </div>
          <div>
            <span className="fl-label">
              {form.platform === 'in_person' ? 'Location' : 'Meeting URL'}
            </span>
            <input
              className="inp"
              type={form.platform === 'in_person' ? 'text' : 'url'}
              placeholder={
                form.platform === 'in_person'
                  ? 'Venue / address'
                  : 'https://zoom.us/j/…'
              }
              value={form.linkOrLocation}
              onChange={(e) => update('linkOrLocation', e.target.value)}
            />
          </div>
          <div>
            <span className="fl-label">Agenda</span>
            <textarea
              className="inp"
              rows={3}
              placeholder="Meeting agenda items..."
              style={{ resize: 'vertical' }}
              value={form.agenda}
              onChange={(e) => update('agenda', e.target.value)}
            />
          </div>
          {error && (
            <div style={{ fontSize: 11, color: '#DC2626', background: 'rgba(239,68,68,.08)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,.2)' }}>
              {error}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px 18px', borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn bs" onClick={onClose} style={{ padding: '9px 18px' }} disabled={submitting}>Cancel</button>
          <button className="btn bp" onClick={submit} style={{ padding: '9px 20px', opacity: submitting ? 0.7 : 1 }} disabled={submitting}>
            {submitting ? 'Scheduling…' : 'Schedule'}
          </button>
        </div>
      </div>
      {addPersonOpen && companyId && (
        <AddPersonDialog
          companyId={companyId}
          companyName={companyName}
          onClose={() => setAddPersonOpen(false)}
          onAdded={(member) => {
            void fetchTeam();
            if (member.email) {
              setForm((f) =>
                f.participants.includes(member.email)
                  ? f
                  : { ...f, participants: [...f.participants, member.email] },
              );
            }
          }}
        />
      )}
    </div>
  );
}
