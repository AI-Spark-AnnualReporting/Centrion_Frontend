import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { earnings, agentRuns, ApiError } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { EarningsProducedSection, EarningsApproveBlocker, EarningsExportFormat } from '@/types/earnings';
import { byDisplayOrder } from '@/components/quarterly/sectionState';
import { earningsSectionState, isHiddenWhenOmitted, isCoverMode } from './preview-helpers';
import { SectionRail } from '@/components/earnings/SectionRail';
import { EditableProse } from '@/components/earnings/EditableProse';
import { GenerateProgress } from '@/components/earnings/GenerateProgress';
import { PublishBar } from '@/components/earnings/PublishBar';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { INK, MUTED, FAINT } from '@/components/earnings/tokens';

const POLL_INTERVAL_MS = 3000;

// Pull a readable message out of an ApiError body (FastAPI `detail`).
function apiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string' && detail) return detail;
    return err.message || fallback;
  }
  return err instanceof Error ? err.message : fallback;
}

// Read an approve 409 blocker list defensively from the ApiError body.
function readBlockers(body: unknown): EarningsApproveBlocker[] {
  const rec = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const detail = rec.detail;
  const arr: unknown[] = Array.isArray(rec.blockers)
    ? (rec.blockers as unknown[])
    : Array.isArray(detail)
      ? (detail as unknown[])
      : Array.isArray((detail as Record<string, unknown>)?.blockers)
        ? ((detail as Record<string, unknown>).blockers as unknown[])
        : [];
  if (arr.length === 0) {
    // A plain string detail becomes a single blocker.
    if (typeof detail === 'string' && detail) return [{ section_code: null, message: detail }];
    return [];
  }
  return arr
    .map((b): EarningsApproveBlocker | null => {
      if (typeof b === 'string') return { section_code: null, message: b };
      if (b && typeof b === 'object') {
        const o = b as Record<string, unknown>;
        const msg = o.message ?? o.reason ?? o.detail;
        if (typeof msg === 'string') {
          return { section_code: typeof o.section_code === 'string' ? o.section_code : null, message: msg };
        }
      }
      return null;
    })
    .filter((b): b is EarningsApproveBlocker => b !== null);
}

export default function EarningsPreviewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Endpoints are report-scoped (no company_id); read defensively so a null user
  // never crashes the page.
  void (user?.company_id ?? null);

  const [sections, setSections] = useState<EarningsProducedSection[]>([]);
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [runInfo, setRunInfo] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [blockers, setBlockers] = useState<EarningsApproveBlocker[] | null>(null);

  const applyResponse = useCallback(
    (res: { sections: EarningsProducedSection[]; cover_template_key: string | null; locked: boolean }) => {
      const sorted = res.sections.slice().sort(byDisplayOrder);
      setSections(sorted);
      setCoverTemplateKey(res.cover_template_key);
      setLocked(res.locked);
      setActiveCode((cur) => cur ?? sorted[0]?.section_code ?? null);
    },
    [],
  );

  // ── Load produced sections ─────────────────────────────────────────────────
  useEffect(() => {
    if (!reportId) {
      setError('Missing report id.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    earnings
      .getEarningsSections(reportId)
      .then((res) => {
        if (!cancelled) applyResponse(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load the report.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, retryKey, applyResponse]);

  // ── Poll while a produce run is active ──────────────────────────────────────
  useEffect(() => {
    if (!runInfo || !reportId) return;
    let cancelled = false;
    const tick = async () => {
      const run = await agentRuns.getByPollUrl(runInfo.poll_url).catch(() => null);
      const res = await earnings.getEarningsSections(reportId).catch(() => null);
      if (cancelled) return;
      if (res) applyResponse(res);
      const status = run?.status;
      if (status === 'completed' || status === 'failed') {
        setRunInfo(null);
        if (status === 'failed') setError('Generation failed. Please try again.');
      }
    };
    const id = setInterval(tick, POLL_INTERVAL_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runInfo, reportId, applyResponse]);

  // ── Generate (produce all) ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!reportId) return;
    setError(null);
    try {
      const handle = await earnings.produceEarningsReport(reportId);
      setRunInfo(handle);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, 'Could not start generation.'));
    }
  };

  // ── Inline edit (optimistic + rollback) ─────────────────────────────────────
  const handleSaveSection = useCallback(
    async (code: string, content: string) => {
      if (!reportId) return;
      const prev = sections.find((s) => s.section_code === code) ?? null;
      setSections((list) =>
        list.map((s) => (s.section_code === code ? { ...s, content, edited: true } : s)),
      );
      try {
        const updated = await earnings.patchEarningsSectionContent(reportId, code, { content });
        // Preserve client-only inclusion; take the server's authoritative content + flags.
        setSections((list) =>
          list.map((s) => (s.section_code === code ? { ...updated, included: s.included, edited: true } : s)),
        );
      } catch (err) {
        setSections((list) => list.map((s) => (s.section_code === code && prev ? prev : s)));
        throw err;
      }
    },
    [reportId, sections],
  );

  // ── Regenerate one section (warn if edited) ─────────────────────────────────
  const handleRegenerate = useCallback(
    async (code: string) => {
      if (!reportId) return;
      const s = sections.find((x) => x.section_code === code) ?? null;
      if (
        s?.edited &&
        !window.confirm('This section was edited. Regenerating will replace your changes. Continue?')
      ) {
        return;
      }
      setSections((list) => list.map((x) => (x.section_code === code ? { ...x, status: 'drafting' } : x)));
      try {
        const updated = await earnings.produceEarningsSection(reportId, code);
        setSections((list) =>
          list.map((x) => (x.section_code === code ? { ...updated, included: x.included } : x)),
        );
      } catch (err) {
        setSections((list) =>
          list.map((x) => (x.section_code === code ? { ...x, status: s?.status ?? 'produced' } : x)),
        );
        setError(apiErrorMessage(err, 'Could not regenerate the section.'));
      }
    },
    [reportId, sections],
  );

  const acknowledgeFlag = useCallback((code: string) => {
    setSections((list) =>
      list.map((s) => (s.section_code === code ? { ...s, grounding_acknowledged: true } : s)),
    );
  }, []);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = useCallback(
    async (format: EarningsExportFormat) => {
      if (!reportId) return;
      await earnings.downloadEarningsExport(reportId, format);
    },
    [reportId],
  );

  // ── Approve & lock ──────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!reportId) return;
    // Client-side gate: an unacknowledged grounding flag blocks approval.
    const flagged = sections.filter((s) => s.grounding_flag && !s.grounding_acknowledged);
    if (flagged.length > 0) {
      setBlockers(
        flagged.map((s) => ({
          section_code: s.section_code,
          message: `${s.title} has an unacknowledged figure flag`,
        })),
      );
      return;
    }
    setApproving(true);
    setBlockers(null);
    setError(null);
    try {
      await earnings.approveEarningsReport(reportId);
      setLocked(true);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        const list = readBlockers(err.body);
        setBlockers(list.length ? list : [{ section_code: null, message: 'This report cannot be approved yet.' }]);
      } else {
        setError(apiErrorMessage(err, 'Failed to approve the report.'));
      }
    } finally {
      setApproving(false);
    }
  };

  const selectSection = (code: string) => {
    setActiveCode(code);
    document.getElementById(`earnings-sec-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <EarningsStepper activeStep={4} reportId={reportId} />
        <div className="card" style={{ padding: 0 }}>
          <Spinner pad={80} />
        </div>
      </div>
    );
  }

  if (error && sections.length === 0) {
    return (
      <div>
        <EarningsStepper activeStep={4} reportId={reportId} />
        <div
          className="card"
          role="alert"
          style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
        >
          <span style={{ fontSize: 13, color: '#DC2626' }}>{error}</span>
          <button className="btn bs bsm" onClick={() => setRetryKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Sections that vanish entirely when omitted by design (quote/trend) — no
  // card, no rail entry, no gating on a section that will never produce
  // content. Returning null from the leaf renderer alone isn't enough; the
  // outer numbered card would still render around an empty body.
  const visibleSections = sections.filter(
    (s) => !isHiddenWhenOmitted(s) || earningsSectionState(s) !== 'omitted',
  );
  const included = visibleSections.filter((s) => s.included);
  // "Has this report been generated at all" — not "is every section fully
  // produced". Once real content exists anywhere (excluding the cover, which
  // is template-driven and doesn't indicate the narrative pipeline ran), the
  // report counts as generated and the banner never comes back, even if an
  // individual section is still gap-flagged (needs_input) or its status field
  // was reset by the outline-save bug (content-first via earningsSectionState,
  // so real content still reads 'produced' regardless of that corruption).
  // Per-section gaps stay visible inline on each section, just not as a
  // blanket "generate everything" prompt.
  const substantiveIncluded = included.filter((s) => !isCoverMode(s));
  const needsGenerate =
    substantiveIncluded.length > 0 && !substantiveIncluded.some((s) => earningsSectionState(s) === 'produced');
  const generating = runInfo !== null;

  return (
    <div>
      <EarningsStepper activeStep={4} reportId={reportId} />
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Preview your earnings report
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED, maxWidth: 620 }}>
          This is the assembled report, generated from your extracted data. Edit any section inline,
          then export or approve.
        </p>
      </div>

      {error && sections.length > 0 && (
        <div className="card" role="alert" style={{ padding: '12px 16px', marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: '#DC2626' }}>{error}</span>
        </div>
      )}

      {visibleSections.length === 0 ? (
        <div
          className="card"
          style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}
        >
          No sections to preview yet.
          <div style={{ marginTop: 16 }}>
            <button className="btn bs" onClick={() => navigate(`/earnings/${reportId}/outline`)}>
              ← Back to outline
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0, 1fr) 290px', gap: 18, alignItems: 'start' }}>
          {/* Left — section rail */}
          <SectionRail sections={visibleSections} activeCode={activeCode} onSelect={selectSection} />

          {/* Center — generate state or the assembled document */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {generating ? (
              <GenerateProgress sections={sections} />
            ) : (
              <>
                {needsGenerate && (
                  <div
                    className="card"
                    style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                  >
                    <span style={{ fontSize: 13, color: INK }}>
                      Some sections aren't produced yet. Generate the report to assemble them.
                    </span>
                    <button className="btn bp" onClick={handleGenerate}>
                      Generate report
                    </button>
                  </div>
                )}
                {visibleSections.map((s, i) => (
                  <div key={s.section_code} id={`earnings-sec-${s.section_code}`} className="card" style={{ padding: '18px 22px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: FAINT, fontVariantNumeric: 'tabular-nums' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <h2 style={{ fontSize: 16, fontWeight: 800, color: INK, margin: 0 }}>{s.title}</h2>
                    </div>
                    <EditableProse
                      section={s}
                      coverTemplateKey={coverTemplateKey}
                      locked={locked}
                      onSave={(content) => handleSaveSection(s.section_code, content)}
                      onRegenerate={() => handleRegenerate(s.section_code)}
                      onAcknowledgeFlag={() => acknowledgeFlag(s.section_code)}
                    />
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Right — publish bar */}
          <PublishBar
            locked={locked}
            blockers={blockers}
            approving={approving}
            onApprove={handleApprove}
            onExport={handleExport}
          />
        </div>
      )}
    </div>
  );
}
