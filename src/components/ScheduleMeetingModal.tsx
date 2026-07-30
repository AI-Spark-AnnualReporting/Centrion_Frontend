import { useMemo, useState } from 'react';
import { meetings as meetingsApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type {
  CreateMeetingBody,
  Meeting,
  MeetingPlatform,
  MeetingType,
} from '@/types/meeting';
import ParticipantsPicker from '@/components/ParticipantsPicker';

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
  const update = <K extends keyof ModalState>(key: K, value: ModalState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

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
          <ParticipantsPicker
            value={form.participants}
            onChange={(emails) => update('participants', emails)}
            companyId={companyId}
            companyName={companyName}
          />
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
    </div>
  );
}
