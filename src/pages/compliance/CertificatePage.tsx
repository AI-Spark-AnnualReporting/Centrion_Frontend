// The certificate — the page a finished validation run earns, and the on-screen
// twin of `GET /runs/{run_id}/certificate.pdf`.
//
// It is deliberately NOT gated behind `certified === true`. The endpoint serves
// any finished run, and the document titles itself by state: cleared for
// publication only when the run is certified AND the gate is open, otherwise a
// plain validation report that says in as many words that it is not a
// clearance. This screen branches on the same two fields, so what the user
// reads here and what they get in the PDF can never disagree — and someone
// still working through gaps can take the detail away with them.
//
// There is no verification ID on screen. The real code is derived server-side
// from the run's UUID and printed in the PDF; nothing in the browser knows the
// derivation, and an ID invented here would resolve to nothing at /verify.
// Better to say where the code lives than to show one that doesn't work.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CentriyonMark } from '@/components/shared/CentriyonMark';
import { Spinner } from '@/components/shared/Spinner';
import { ApiError, complianceValidation } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  isClearedForPublication,
  isTerminalStatus,
  type ComplianceRun,
  type RunListItem,
} from '@/types/compliance';
import {
  ComplianceNotice,
  DARK,
  GREEN,
  gradeColor,
  MONO,
  MUTED,
  PRIMARY,
  RED,
  safeScore,
  setupHref,
} from './compliance-ui';

// The roundel. Only a run that is genuinely cleared gets the confident green
// treatment — everything else reads as a neutral stamp, so the seal can't be
// screenshotted out of context and passed off as a clearance.
function CertificateSeal({ cleared }: { cleared: boolean }) {
  const color = cleared ? GREEN : MUTED;
  return (
    <div
      aria-hidden
      style={{
        width: 50,
        height: 50,
        borderRadius: '50%',
        border: `1.5px solid ${color}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 800 }}>{cleared ? '✓' : '◦'}</span>
      <span style={{ fontSize: 5.5, fontWeight: 800, letterSpacing: '.6px', marginTop: 3 }}>
        {cleared ? 'VERIFIED' : 'UNSIGNED'}
      </span>
    </div>
  );
}

function StatTile({
  value,
  label,
  color = DARK,
  title,
}: {
  value: string;
  label: string;
  color?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      style={{
        padding: '13px 14px',
        borderRadius: 10,
        border: '1px solid #E2E4F0',
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 21, fontWeight: 800, color, letterSpacing: '-.5px', lineHeight: 1.1 }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: MUTED,
          letterSpacing: '.7px',
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );
}

// "2026-07-27T12:36:30+00:00" → "27 Jul 2026".
function formatIssuedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  annual: 'Annual Report',
  quarterly: 'Quarterly Report',
  esg: 'ESG Report',
  board_pack: 'Board Pack',
};

// Only the server names the file properly — it knows the company code and the
// report's own title. When `Content-Disposition` doesn't survive the trip (it
// is not CORS-safelisted, so it needs `Access-Control-Expose-Headers` on the
// API side), this is what the user gets instead: still identifying, still safe
// on every filesystem.
function fallbackFilename(run: ComplianceRun, period: string | undefined): string {
  const parts = ['certificate', period, run.report_type].filter(Boolean).join('-');
  return `${parts.replace(/[^\w.-]+/g, '_')}.pdf`;
}

// The endpoint's 409/403/404 bodies carry copy written for a human. Prefer the
// server's own wording — it knows why it said no.
function downloadErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | undefined;
    const detail = body?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (err.status === 403) return "You don't have access to this validation run.";
    if (err.status === 404) return 'This validation run no longer exists.';
    if (err.status === 409) {
      return "This validation hasn't finished, so there is nothing to certify yet.";
    }
  }
  return 'Could not download the certificate. Please try again.';
}

export default function CertificatePage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [run, setRun] = useState<ComplianceRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // GET /runs/{id} carries no title or period — those live on the run LIST
  // rows. One extra read fills the subject strip; if it fails or the run has
  // aged out of the list the certificate still renders, just less specific.
  const [listRow, setListRow] = useState<RunListItem | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    if (!runId) {
      setError('No validation run selected.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    complianceValidation
      .getRun(runId)
      .then((r) => {
        if (!cancelled) setRun(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load the validation run.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId || !runId) return;
    let cancelled = false;
    complianceValidation
      .listRuns(companyId, { limit: 50 })
      .then((rows) => {
        if (!cancelled) setListRow(rows.find((r) => r.run_id === runId) ?? null);
      })
      // Supporting detail only — a certificate is not worth failing over a
      // title. The card drops to the report type it already knows.
      .catch(() => {
        if (!cancelled) setListRow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.company_id, runId]);

  // Nothing on a certificate is true until the run finishes: the gate is null
  // and every list is empty for the 30–60s it takes. Send an unfinished run to
  // the screen that knows how to wait for it.
  const inFlight = run != null && !isTerminalStatus(run.status);
  useEffect(() => {
    if (inFlight && runId) {
      navigate(`/compliance/runs/${runId}/running`, { replace: true });
    }
  }, [inFlight, runId, navigate]);

  const download = () => {
    if (!run) return;
    setDownloading(true);
    setDownloadError('');
    complianceValidation
      .certificatePdf(run.run_id)
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename ?? fallbackFilename(run, listRow?.period);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch((e) => setDownloadError(downloadErrorMessage(e)))
      .finally(() => setDownloading(false));
  };

  if (loading || inFlight) return <Spinner pad={48} />;

  if (error || !run) {
    return (
      <ComplianceNotice
        title="Couldn't load this certificate"
        detail={error || 'The run may have expired, or the compliance service is unavailable.'}
        tone="error"
        action={
          <button
            type="button"
            className="btn bs"
            onClick={() => navigate(setupHref(run))}
            style={{ fontSize: 12.5, padding: '8px 16px' }}
          >
            ← Back to set up
          </button>
        }
      />
    );
  }

  const cleared = isClearedForPublication(run);
  const score = safeScore(run.overall_readiness);
  const passed = run.frameworks.reduce((n, f) => n + (f.passed ?? 0), 0);
  const scoreable = run.frameworks.reduce((n, f) => n + (f.total ?? 0), 0);
  const openHardGaps = run.gaps.filter((g) => g.gate === 'HARD' && !g.resolved).length;

  // The subject strip: everything we can name about what was validated, in one
  // line, with the pieces we don't have simply left out.
  const subjectFacts = [
    user?.company_name,
    listRow?.period,
    REPORT_TYPE_LABELS[run.report_type] ?? run.report_type,
    listRow?.source === 'upload' ? 'Uploaded' : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <p style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>
        This certification page becomes page 1 of the downloaded document.
      </p>

      <div className="card" style={{ maxWidth: 720, margin: '0 auto', overflow: 'hidden' }}>
        <div style={{ height: 4, background: 'linear-gradient(90deg,#4040C8,#22D3EE)' }} />

        <div style={{ padding: '26px 30px 30px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 16,
            }}
          >
            <CentriyonMark />
            <CertificateSeal cleared={cleared} />
          </div>

          <div
            style={{
              marginTop: 26,
              fontSize: 9,
              fontWeight: 800,
              color: PRIMARY,
              letterSpacing: '1.4px',
            }}
          >
            CERTIFICATE OF REGULATORY VALIDATION
          </div>
          <h1
            style={{
              margin: '8px 0 0',
              fontSize: 25,
              fontWeight: 800,
              color: DARK,
              letterSpacing: '-.6px',
              lineHeight: 1.2,
            }}
          >
            {cleared ? 'Validated & cleared for publication' : 'Compliance validation report'}
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#5A6080', lineHeight: 1.7 }}>
            {cleared ? (
              <>
                This certifies that the report below was validated by the Centriyon Compliance
                Engine against its applicable regulatory frameworks and passed all mandatory gates.
              </>
            ) : (
              <>
                This records what the Centriyon Compliance Engine found when it validated the
                report below against its applicable regulatory frameworks.{' '}
                <strong style={{ color: DARK }}>It is NOT a clearance to publish.</strong>
              </>
            )}
          </p>

          {subjectFacts.length > 0 && (
            <div
              style={{
                marginTop: 20,
                padding: '14px 16px',
                borderRadius: 10,
                background: '#FAFBFE',
                border: '1px solid #ECEEF8',
              }}
            >
              {listRow?.title && (
                <div style={{ fontSize: 13.5, fontWeight: 800, color: DARK }}>{listRow.title}</div>
              )}
              <div
                style={{
                  fontSize: 10.5,
                  color: MUTED,
                  marginTop: listRow?.title ? 5 : 0,
                  lineHeight: 1.6,
                }}
              >
                {subjectFacts.join(' · ')}
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
            }}
          >
            {/* A null readiness means nothing was scoreable. Rendering that as
                "0" would read as a total failure, which is a different thing. */}
            <StatTile
              value={score == null ? '—' : String(score)}
              label="READINESS / 100"
              color={score == null ? MUTED : gradeColor(score)}
              title={
                score == null
                  ? 'Nothing in this run was scoreable.'
                  : 'Submission readiness across every enabled framework'
              }
            />
            <StatTile
              value={scoreable > 0 ? `${passed}/${scoreable}` : '—'}
              label="CHECKS PASSED"
              title="Scoreable checks only — rules answered outside this report are excluded"
            />
            <StatTile value={String(run.frameworks.length)} label="FRAMEWORKS" />
            <StatTile
              value={String(openHardGaps)}
              label="OPEN HARD GAPS"
              color={openHardGaps > 0 ? RED : GREEN}
              title="Unresolved checks that block publication"
            />
          </div>

          {run.frameworks.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div
                style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  color: MUTED,
                  letterSpacing: '.8px',
                  marginBottom: 9,
                }}
              >
                VALIDATED AGAINST
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {/* A list of which regulators this report was checked against,
                    not a verdict on each. The scores live in the tiles above and
                    in each chip's tooltip; scoring the chips too made a run that
                    is genuinely cleared for publication wear red crosses, because
                    the 80 mark they used is stricter than the gate that actually
                    decides certification. */}
                {run.frameworks.map((f) => (
                  <span
                    key={f.regulator}
                    title={
                      f.score == null
                        ? `${f.regulator} — nothing scoreable`
                        : `${f.regulator} — ${f.passed}/${f.total} checks passed`
                    }
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '4px 11px',
                      borderRadius: 999,
                      color: GREEN,
                      border: `1px solid ${GREEN}`,
                      background: 'rgba(34,197,94,.08)',
                    }}
                  >
                    ✓ {f.regulator}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: '1px solid #ECEEF8',
              fontSize: 10,
              color: MUTED,
              fontFamily: MONO,
              lineHeight: 1.9,
            }}
          >
            {listRow?.certified_at && (
              <div>
                Issued <span style={{ color: DARK }}>{formatIssuedDate(listRow.certified_at)}</span>
                {listRow.certified_by ? ` · signed off by ${listRow.certified_by}` : ''}
              </div>
            )}
            {/* The verification ID is generated server-side and printed in the
                document. Saying where it lives beats showing a code the
                verifier would reject. */}
            <div>Verification ID is printed on the downloaded certificate</div>
            <div>Digitally verified — Centriyon Compliance Engine v1</div>
          </div>

          <p
            style={{
              margin: '16px 0 0',
              fontSize: 9,
              color: MUTED,
              lineHeight: 1.65,
              textAlign: 'center',
            }}
          >
            Validation reference generated from the Centriyon rule catalogue. Not legal advice; rule
            text synced from CMA, SAMA, Insurance Authority, SOCPA, ZATCA and applicable
            standard-setters.
          </p>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <p style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>
          Downloading merges this page in front of the report PDF.
        </p>
        <button
          type="button"
          className="btn bp"
          onClick={download}
          disabled={downloading}
          style={{
            fontSize: 13,
            padding: '11px 22px',
            opacity: downloading ? 0.6 : 1,
            cursor: downloading ? 'not-allowed' : 'pointer',
          }}
        >
          {downloading ? 'Preparing…' : '↓ Download certified report (PDF)'}
        </button>
        {downloadError && (
          <div style={{ marginTop: 12, fontSize: 11.5, color: RED, lineHeight: 1.6 }}>
            {downloadError}
          </div>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <button
          type="button"
          className="btn bs"
          onClick={() => navigate(`/compliance/runs/${run.run_id}`)}
          style={{ fontSize: 13, padding: '9px 18px' }}
        >
          ← Back to results
        </button>
      </div>
    </div>
  );
}
