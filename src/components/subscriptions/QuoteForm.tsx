// The client admin's "Contact us — Enterprise" popup: name, phone number and a
// message, all required. Sent to Centriyon: every spark_admin gets an in-app
// notification, the Enterprise card's contact email gets an email, and the
// request shows on Spark → Quotes, where a plan is made for this company. The
// plan then shows on the Subscription page as "Made for you".
// One open request at a time (the server says so if one is open).
//
// Plan: Centriton/.claude/plans/cloud-subscriptions-v2-redesign.md

import { useState } from 'react';
import { subscriptions } from '@/lib/api';
import type { PlanContact } from '@/types/subscription';
import './subscriptions.css';

// Same rule as the server: digits, spaces, + ( ) - only, 7–20 characters.
const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

export function isPhoneNumber(text: string): boolean {
  return PHONE_PATTERN.test(text.trim());
}

function ContactLine({ contact }: { contact: PlanContact | null }) {
  const parts: string[] = [];
  if (contact?.person) parts.push(`👤 ${contact.person}`);
  if (contact?.email) parts.push(`✉ ${contact.email}`);
  if (contact?.phone) parts.push(`☎ ${contact.phone}`);
  if (parts.length === 0) return null;
  return <div className="sub-quote-contact">{parts.map((part) => <span key={part}>{part}</span>)}</div>;
}

type Sent = { phone: string } | null;

export function QuoteForm({ enterprisePlanId, contact, defaultName, onSent, onClose }: {
  enterprisePlanId: string;        // the Enterprise card clicked
  contact: PlanContact | null;     // that card's contact details
  defaultName: string;             // the admin's own name
  onSent: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Sent>(null);

  const phoneBad = phoneTouched && phone.trim() !== '' && !isPhoneNumber(phone);
  const ready = name.trim() !== '' && isPhoneNumber(phone) && message.trim() !== '';

  const send = async () => {
    setSending(true);
    setError('');
    try {
      await subscriptions.requestQuote({ plan_id: enterprisePlanId, name: name.trim(), phone: phone.trim(), message: message.trim() });
      setSent({ phone: phone.trim() });
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the request.');
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="card" style={{ padding: '22px 24px', maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
        <div className="sub-done-tick">✓</div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Request sent</div>
        <div style={{ fontSize: 12, color: '#5A6080', marginTop: 6, lineHeight: 1.6 }}>
          Thanks — Centriyon will contact you on {sent.phone}.<br />
          When your plan is ready it shows here as <b>Made for you</b>.
        </div>
        <button type="button" className="btn bp" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '22px 24px', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>Contact us — Enterprise</div>
      <div style={{ fontSize: 12, color: '#9BA3C4', marginTop: 3 }}>
        Leave your details and Centriyon will get back to you with a plan for your company.
      </div>
      <ContactLine contact={contact} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080' }}>
          Name
          <input className="inp" style={{ marginTop: 5 }} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#5A6080', display: 'block' }}>
            Phone number
            <input className={`inp ${phoneBad ? 'inp-error' : ''}`} style={{ marginTop: 5 }} inputMode="tel" maxLength={20}
              aria-invalid={phoneBad} aria-describedby="contact-phone-error"
              placeholder="+966 5x xxx xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhoneTouched(true)} />
          </label>
          <div id="contact-phone-error" role="alert" style={{ fontSize: 10.5, color: '#DC2626', marginTop: 3, minHeight: 14 }}>
            {phoneBad ? 'Enter a valid phone number' : ''}
          </div>
        </div>
      </div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5A6080', marginTop: 4 }}>
        Message
        <textarea className="inp" rows={4} maxLength={2000} style={{ marginTop: 5 }}
          placeholder="What do you need? e.g. modules, how many users and departments…"
          value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 10 }}>{error}</div>}

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #ECEEF8', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn bs" onClick={onClose}>Cancel</button>
        <button type="button" className="btn bp" disabled={sending || !ready} onClick={send}>{sending ? 'Sending…' : 'Send'}</button>
      </div>
    </div>
  );
}
