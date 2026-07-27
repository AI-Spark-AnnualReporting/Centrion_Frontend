// Public certificate verification — the one screen in this app that anyone can
// reach without an account.
//
// That is the entire point of it. Someone holding a printed Centriyon
// certificate — an auditor, a regulator, an investor — types the code off the
// paper and finds out whether it is real. Requiring a login would make the
// certificate unverifiable by exactly the people it is addressed to.
//
// Two ways in, because a printed code and a shared link are different arrivals:
//   /verify        — paste the code
//   /verify/:code  — checks on arrival, for a link or a QR scan
//
// One failure state, deliberately. The API answers an IDENTICAL 404 for a
// malformed code, an unknown code and a run that hasn't finished, so that the
// endpoint can't be walked to discover which runs exist. Distinguishing them on
// screen would leak precisely what the API is refusing to say — so this screen
// says "we can't verify this" and nothing more, and there is no client-side
// format check to give a would-be prober a faster oracle either.

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CentriyonMark } from '@/components/shared/CentriyonMark';
import { Spinner } from '@/components/shared/Spinner';
import { ApiError, publicVerification } from '@/lib/api';
import {
  normalizeVerificationCode,
  type CertificateVerification,
} from '@/types/compliance';

const PRIMARY = '#4040C8';
const DARK = '#1A1D2E';
const MUTED = '#9BA3C4';
const GREEN = '#16A34A';
const AMBER = '#B45309';
const MONO = "'DM Mono', monospace";

const REPORT_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual Report',
  quarterly: 'Quarterly Report',
  esg: 'ESG Report',
  board_pack: 'Board Pack',
};

function formatCertifiedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 8.5, fontWeight: 800, color: MUTED, letterSpacing: '.8px' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginTop: 5 }}>{value}</div>
    </div>
  );
}

// A verified record still has to say what it is. `certified` and the gate are
// separate facts, and a run can be genuine without being cleared to publish —
// so the banner reports the state it found rather than treating any 200 as a
// green light.
function ResultBanner({ result }: { result: CertificateVerification }) {
  const cleared = result.certified && result.publication_gate === 'open';
  const color = cleared ? GREEN : AMBER;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        padding: '14px 16px',
        borderRadius: 10,
        background: cleared ? 'rgba(34,197,94,.08)' : 'rgba(245,158,11,.09)',
        border: `1px solid ${cleared ? 'rgba(34,197,94,.25)' : 'rgba(245,158,11,.28)'}`,
      }}
    >
      <span style={{ fontSize: 20, color, lineHeight: 1 }}>{cleared ? '✓' : '!'}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, color }}>
          {cleared ? 'Genuine certificate' : 'Genuine record — not cleared for publication'}
        </div>
        <div style={{ fontSize: 11.5, color: '#5A6080', marginTop: 3, lineHeight: 1.6 }}>
          {cleared
            ? 'This certificate was issued by the Centriyon Compliance Engine and the report passed all mandatory gates.'
            : 'This validation run exists and the code is genuine, but the report was not cleared for publication.'}
        </div>
      </div>
    </div>
  );
}

export default function VerifyCertificatePage() {
  const { code: codeFromUrl } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [input, setInput] = useState(codeFromUrl ?? '');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CertificateVerification | null>(null);
  // A boolean, not a message: there is only one failure this screen can
  // describe, and no server wording worth surfacing behind it.
  const [notFound, setNotFound] = useState(false);
  // Distinct from `notFound` — the code may well be valid and the network down.
  // Telling someone their genuine certificate is unverifiable because our
  // service is unreachable would be a serious thing to get wrong.
  const [unreachable, setUnreachable] = useState(false);

  const check = useCallback((raw: string) => {
    const code = normalizeVerificationCode(raw);
    if (!code) return;
    setChecking(true);
    setResult(null);
    setNotFound(false);
    setUnreachable(false);
    publicVerification
      .verify(code)
      .then(setResult)
      .catch((e: unknown) => {
        // A 404 is the API's answer about the code. Anything else — a network
        // failure, a 5xx — is an answer about US, and must not be reported as
        // though the certificate were the thing at fault.
        if (e instanceof ApiError && e.status === 404) setNotFound(true);
        else setUnreachable(true);
      })
      .finally(() => setChecking(false));
  }, []);

  // A code in the URL is someone following a link or scanning a QR — they've
  // already done the typing, so check it on arrival.
  useEffect(() => {
    if (codeFromUrl) {
      setInput(codeFromUrl);
      check(codeFromUrl);
    }
  }, [codeFromUrl, check]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeVerificationCode(input);
    if (!code) return;
    // Put the code in the URL so the result is shareable and survives a
    // refresh. The effect above runs the check.
    if (code !== codeFromUrl) navigate(`/verify/${encodeURIComponent(code)}`);
    else check(code);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg,#FAFBFE,#F2F4FC)',
        padding: '48px 20px',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
          <CentriyonMark />
        </div>

        <div className="card" style={{ padding: '28px 30px 30px' }}>
          <div
            style={{ fontSize: 9, fontWeight: 800, color: PRIMARY, letterSpacing: '1.4px' }}
          >
            CERTIFICATE VERIFICATION
          </div>
          <h1
            style={{
              margin: '8px 0 0',
              fontSize: 22,
              fontWeight: 800,
              color: DARK,
              letterSpacing: '-.5px',
            }}
          >
            Check a Centriyon certificate
          </h1>
          <p style={{ margin: '9px 0 0', fontSize: 12, color: '#5A6080', lineHeight: 1.7 }}>
            Enter the verification ID printed on the certificate. No account needed.
          </p>

          <form onSubmit={submit} style={{ marginTop: 20 }}>
            <label
              htmlFor="verification-code"
              style={{
                display: 'block',
                fontSize: 8.5,
                fontWeight: 800,
                color: MUTED,
                letterSpacing: '.8px',
                marginBottom: 7,
              }}
            >
              VERIFICATION ID
            </label>
            <input
              id="verification-code"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="CNT-VAL-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1.5px solid #E2E4F0',
                fontFamily: MONO,
                fontSize: 12.5,
                color: DARK,
                letterSpacing: '.4px',
                outline: 'none',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = PRIMARY;
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#E2E4F0';
              }}
            />
            <p style={{ margin: '7px 0 0', fontSize: 10.5, color: MUTED, lineHeight: 1.6 }}>
              Case doesn't matter, and surrounding spaces are fine — paste it as printed.
            </p>
            <button
              type="submit"
              className="btn bp"
              disabled={checking || !input.trim()}
              style={{
                marginTop: 16,
                fontSize: 13,
                padding: '11px 22px',
                opacity: checking || !input.trim() ? 0.55 : 1,
                cursor: checking || !input.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {checking ? 'Checking…' : 'Verify certificate'}
            </button>
          </form>

          {checking && <Spinner pad={26} />}

          {result && !checking && (
            <div style={{ marginTop: 24 }}>
              <ResultBanner result={result} />

              <div
                style={{
                  marginTop: 16,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 18,
                  padding: '18px 0 0',
                  borderTop: '1px solid #ECEEF8',
                }}
              >
                <Field label="COMPANY" value={result.company_name} />
                <Field
                  label="REPORT"
                  value={REPORT_TYPE_LABELS[result.report_type] ?? result.report_type}
                />
                <Field label="PERIOD" value={result.period} />
                <Field
                  label="READINESS"
                  value={
                    result.overall_readiness == null
                      ? 'Not scored'
                      : `${Math.round(result.overall_readiness)}/100`
                  }
                />
                {result.certified_at && (
                  <Field label="CERTIFIED" value={formatCertifiedAt(result.certified_at)} />
                )}
                <Field
                  label="PUBLICATION GATE"
                  value={
                    result.publication_gate === 'open'
                      ? 'Open'
                      : result.publication_gate === 'blocked'
                        ? 'Blocked'
                        : 'No verdict'
                  }
                />
              </div>

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 14,
                  borderTop: '1px solid #ECEEF8',
                  fontFamily: MONO,
                  fontSize: 10,
                  color: MUTED,
                  wordBreak: 'break-all',
                  lineHeight: 1.8,
                }}
              >
                {result.verification_code}
              </div>
            </div>
          )}

          {notFound && !checking && (
            <div
              style={{
                marginTop: 24,
                padding: '16px 18px',
                borderRadius: 10,
                background: '#FAFBFE',
                border: '1px solid #E2E4F0',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: DARK }}>
                We can't verify this ID
              </div>
              <p style={{ margin: '7px 0 0', fontSize: 11.5, color: '#5A6080', lineHeight: 1.7 }}>
                No Centriyon certificate matches this verification ID. Check it against the printed
                document — the ID runs to the end of the final single character — and try again.
              </p>
            </div>
          )}

          {unreachable && !checking && (
            <div
              style={{
                marginTop: 24,
                padding: '16px 18px',
                borderRadius: 10,
                background: 'rgba(245,158,11,.08)',
                border: '1px solid rgba(245,158,11,.25)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: AMBER }}>
                Couldn't reach the verification service
              </div>
              <p style={{ margin: '7px 0 0', fontSize: 11.5, color: '#5A6080', lineHeight: 1.7 }}>
                This says nothing about the certificate — we simply couldn't check it just now.
                Please try again in a moment.
              </p>
            </div>
          )}
        </div>

        <p
          style={{
            marginTop: 18,
            fontSize: 10,
            color: MUTED,
            textAlign: 'center',
            lineHeight: 1.7,
          }}
        >
          Verification confirms that a certificate was issued by the Centriyon Compliance Engine and
          reports the state of the validation it records. It is not legal advice.
        </p>
      </div>
    </div>
  );
}
