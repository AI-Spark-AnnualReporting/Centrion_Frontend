// spark_admin's "Send offer" popup: who the email goes to (starts with the
// company's admin, can be changed or a second address added), the subject,
// and a preview of the email. The email has no button: the client replies by
// email and Spark then approves the plan.
//
// Plan: Centriton/.claude/plans/quote-offers.md
// Mockup: Centrion_Frontend/.claude/mockups/quote-offer-mockup.html (2 · Send offer)

import { useEffect, useState, type ReactNode } from 'react';
import { FormDialog } from './FormDialog';

const MAX_RECIPIENTS = 5;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const DEFAULT_OFFER_SUBJECT = 'Your Enterprise offer from Centriyon';

/** True for something that looks like an email address. */
export function isEmailAddress(text: string): boolean {
  return EMAIL_PATTERN.test(text.trim());
}

/** The list with one more address (trimmed, no duplicates, at most 5). */
export function addRecipient(list: string[], text: string): string[] {
  const address = text.trim().replace(/,$/, '');
  if (!address || list.includes(address) || list.length >= MAX_RECIPIENTS) return list;
  return [...list, address];
}

export function OfferEmailDialog({ open, companyName, defaultRecipients, preview, sending, error, onSend, onClose }: {
  open: boolean;
  companyName: string;
  defaultRecipients: string[];      // the company's admin emails
  preview: ReactNode;               // what the email says (modules, prices, total)
  sending: boolean;
  error: string;
  onSend: (recipients: string[], subject: string) => void;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<string[]>(defaultRecipients);
  const [typing, setTyping] = useState('');
  const [subject, setSubject] = useState(DEFAULT_OFFER_SUBJECT);

  // Each time it opens: start again from the company's admin.
  useEffect(() => {
    if (!open) return;
    setRecipients(defaultRecipients);
    setTyping('');
    setSubject(DEFAULT_OFFER_SUBJECT);
  }, [open, defaultRecipients]);

  const addTyped = () => {
    setRecipients(addRecipient(recipients, typing));
    setTyping('');
  };
  const remove = (address: string) => setRecipients(recipients.filter((item) => item !== address));

  const wrong = recipients.find((address) => !isEmailAddress(address));
  const canSend = !sending && recipients.length > 0 && !wrong && subject.trim() !== '';

  return (
    <FormDialog open={open} title={`Send the offer to ${companyName}`} onClose={onClose}>
      <div className="card" style={{ padding: '20px 24px', maxWidth: 640, margin: '0 auto' }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Send the offer to {companyName}</div>
        <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 4 }}>
          The client reads it and replies by email. Nothing changes on their side until you approve it.
        </div>

        <label className="sub-mail-label" htmlFor="offer-to">To</label>
        <div className="sub-to-row">
          {recipients.map((address) => (
            <span key={address} className={`sub-mail-chip ${isEmailAddress(address) ? '' : 'bad'}`}>
              {address}
              <button type="button" aria-label={`Remove ${address}`} onClick={() => remove(address)}>✕</button>
            </span>
          ))}
          <input id="offer-to" value={typing} placeholder={recipients.length ? 'Add another email…' : 'name@company.com'}
            onChange={(e) => setTyping(e.target.value)} onBlur={addTyped}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTyped(); } }} />
        </div>
        <div className="sub-mail-hint">Filled in with {companyName}&apos;s admin. Change it, or add a second email (Enter to add, up to {MAX_RECIPIENTS}).</div>
        {wrong && <div className="sub-mail-err" role="alert">{wrong} isn&apos;t an email address.</div>}
        {recipients.length === 0 && <div className="sub-mail-err" role="alert">Add at least one email.</div>}

        <label className="sub-mail-label" htmlFor="offer-subject">Subject</label>
        <input id="offer-subject" className="inp" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%' }} />

        <div className="sub-mail-label">The email</div>
        <div className="sub-mail-preview">{preview}</div>

        {error && <div role="alert" style={{ fontSize: 12, color: '#DC2626', marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn bs" disabled={sending} onClick={onClose}>Back</button>
          <button type="button" className="btn bp" disabled={!canSend} onClick={() => onSend(recipients, subject.trim())}>
            {sending ? 'Sending…' : 'Send offer'}
          </button>
        </div>
      </div>
    </FormDialog>
  );
}
