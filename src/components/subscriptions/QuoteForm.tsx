// The client admin's "Contact us — Enterprise" popup (Get a quote): the
// Enterprise contact details on top, then what they need — the same Modules,
// Users and Departments cards as the plan editor — a duration they'd like and
// a note. Centriyon turns it into a plan just for this company, sets the
// price, and it then shows on the Subscription page as "Made for you".
// One open quote at a time (the server says so if one is open).
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useState } from 'react';
import { subscriptions } from '@/lib/api';
import { DepartmentsCard, EMPTY_LIMITS, ModulesCard, UsersCard } from '@/components/subscriptions/PlanFields';
import type { LicensableModule } from '@/types/license';
import type { PaidDuration, PlanContact, PlanLimits } from '@/types/subscription';
import './subscriptions.css';

function ContactLine({ contact }: { contact: PlanContact | null }) {
  const parts: string[] = [];
  if (contact?.person) parts.push(`👤 ${contact.person}`);
  if (contact?.email) parts.push(`✉ ${contact.email}`);
  if (contact?.phone) parts.push(`☎ ${contact.phone}`);
  if (parts.length === 0) return null;
  return <div className="sub-quote-contact">{parts.map((part) => <span key={part}>{part}</span>)}</div>;
}

/** Just the plan limits out of a bigger object (e.g. the current subscription). */
function limitsOf(source?: PlanLimits): PlanLimits {
  if (!source) return EMPTY_LIMITS;
  return {
    modules: source.modules,
    report_limits: source.report_limits,
    max_pms: source.max_pms,
    max_ir_users: source.max_ir_users,
    department_sizes: source.department_sizes,
  };
}

export function QuoteForm({ catalogue, contact, startFrom, onSent, onCancel }: {
  catalogue: LicensableModule[];
  contact: PlanContact | null;     // the Enterprise card's details
  startFrom?: PlanLimits;          // the current plan, so they only change what they need
  onSent: () => void;
  onCancel: () => void;
}) {
  const [limits, setLimits] = useState<PlanLimits>(() => limitsOf(startFrom));
  const [duration, setDuration] = useState<PaidDuration>('yearly');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    setSending(true);
    setError('');
    try {
      await subscriptions.requestQuote({ ...limits, duration, note: note.trim() || null });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card" style={{ padding: '20px 24px', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Contact us — Enterprise</div>
      <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 3 }}>
        Tell us what you need; Centriyon prepares a plan just for your company and sends you a price.
      </div>
      <ContactLine contact={contact} />

      <div className="sub-quote-cards">
        <ModulesCard value={limits} catalogue={catalogue} onChange={setLimits} />
        <UsersCard value={limits} onChange={setLimits} />
        <DepartmentsCard value={limits} onChange={setLimits} flex={false} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, marginTop: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Duration you&apos;d like
          <select className="inp" style={{ marginTop: 5 }} value={duration} onChange={(e) => setDuration(e.target.value as PaidDuration)}>
            <option value="quarterly">Quarterly</option>
            <option value="half_year">Half year</option>
            <option value="yearly">1 year</option>
          </select>
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Anything else? (optional)
          <textarea className="inp" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} style={{ marginTop: 5 }} />
        </label>
      </div>
      {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 10 }}>{error}</div>}

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn bs" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn bp" disabled={sending || limits.modules.length === 0} onClick={send}>
          {sending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </div>
  );
}
