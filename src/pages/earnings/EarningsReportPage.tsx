import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { earnings, agentRuns, ApiError } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { EarningsProducedSection, EarningsApproveBlocker, EarningsExportFormat, EarningsReportSummary } from '@/types/earnings';
import { byDisplayOrder } from '@/components/quarterly/sectionState';
import { earningsSectionState, isHiddenWhenOmitted, isCoverMode } from './preview-helpers';
import { isTableOfContentsSection } from './helpers';
import { EditableProse } from '@/components/earnings/EditableProse';
import { GenerateProgress } from '@/components/earnings/GenerateProgress';
import { PublishBar } from '@/components/earnings/PublishBar';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { ReportHubPanel } from '@/components/communications/ReportHubPanel';
import type { CoverTemplate, ColorPalette, BrandColors, CoverSelectionPayload } from '@/types/quarterly';
import { INK, MUTED, FAINT, BRAND } from '@/components/earnings/tokens';

const POLL_INTERVAL_MS = 3000;

// ApiError.message already carries the backend's `detail` (or a generic
// message for 429/5xx infra failures) — read it rather than re-parsing
// `err.body.detail` directly, which would bypass that sanitization.
function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message || fallback : fallback;
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

// A report is done-and-locked once it's reached any of these statuses — same
// set the dashboard cards already use to decide "View" vs "Continue".
const FINISHED_STATUSES = ['approved', 'locked', 'published', 'complete', 'completed'];

export default function EarningsReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [sections, setSections] = useState<EarningsProducedSection[]>([]);
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null);
  // GET /sections doesn't carry the report's true approval status at all
  // (confirmed live — it returns only {report_id, sections}); `sectionsLocked`
  // is kept in case a future backend response starts including it, but
  // `reportStatus` (fetched separately below, from the one place status
  // actually lives today) is the real source of truth.
  const [sectionsLocked, setSectionsLocked] = useState(false);
  const [reportStatus, setReportStatus] = useState<EarningsReportSummary | null>(null);
  const locked = sectionsLocked || FINISHED_STATUSES.includes(reportStatus?.status ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [runInfo, setRunInfo] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [blockers, setBlockers] = useState<EarningsApproveBlocker[] | null>(null);

  // ── Cover design + brand color (mirrors the quarterly picker) ──
  const [coverTemplates, setCoverTemplates] = useState<CoverTemplate[]>([]);
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [brand, setBrand] = useState<BrandColors | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverApplying, setCoverApplying] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const applyResponse = useCallback(
    (res: { sections: EarningsProducedSection[]; cover_template_key: string | null; locked: boolean }) => {
      // Table of Contents is dropped from the earnings UI entirely — never
      // shown on Preview even if a report's backend data already has it.
      const sorted = res.sections
        .filter((s) => !isTableOfContentsSection(s.section_code))
        .sort(byDisplayOrder);
      setSections(sorted);
      setCoverTemplateKey(res.cover_template_key);
      setSectionsLocked(res.locked);
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
      // included_only → the preview shows only the user's selected sections.
      .getEarningsSections(reportId, true)
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

  // ── Load the report's real status (approved/locked/etc.) ────────────────────
  // Refetched on retryKey too, in case the same bump that reloads sections
  // should also pick up an approval that just landed.
  useEffect(() => {
    if (!reportId || !companyId) return;
    let cancelled = false;
    earnings
      .getEarningsReportSummary(companyId, reportId)
      .then((summary) => {
        if (!cancelled) setReportStatus(summary);
      })
      .catch(() => {
        /* status just won't upgrade past whatever sectionsLocked already says */
      });
    return () => {
      cancelled = true;
    };
  }, [reportId, companyId, retryKey]);

  // ── Poll while a produce run is active ──────────────────────────────────────
  useEffect(() => {
    if (!runInfo || !reportId) return;
    let cancelled = false;
    const tick = async () => {
      const run = await agentRuns.getByPollUrl(runInfo.poll_url).catch(() => null);
      const res = await earnings.getEarningsSections(reportId, true).catch(() => null);
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

  // ── Load cover templates + palettes + the saved selection (pre-select) ──────
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    earnings
      .getEarningsCoverTemplates()
      .then((res) => {
        if (!cancelled) setCoverTemplates(res.cover_templates ?? []);
      })
      .catch(() => {
        /* picker simply has nothing to show until the backend lands */
      });
    earnings
      .getEarningsColorPalettes()
      .then((res) => {
        if (!cancelled) setPalettes(res.color_palettes ?? []);
      })
      .catch(() => {});
    earnings
      .getEarningsCoverSelection(reportId)
      .then((res) => {
        if (cancelled) return;
        if (res?.cover_template_key) setCoverTemplateKey(res.cover_template_key);
        if (res?.brand) setBrand(res.brand);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const handleCoverApply = useCallback(
    async (payload: CoverSelectionPayload) => {
      if (!reportId) return;
      setCoverApplying(true);
      setCoverError(null);
      try {
        const res = await earnings.saveEarningsCoverSelection(reportId, payload);
        // Prefer the payload the user actually picked — the PATCH response may not
        // echo cover_template_key/brand, which would reset to the default.
        setCoverTemplateKey(res?.cover_template_key ?? payload.cover_template_key);
        setBrand(res?.brand ?? payload.brand);
        setPickerOpen(false);
      } catch (err: unknown) {
        setCoverError(apiErrorMessage(err, 'Could not save the cover selection.'));
      } finally {
        setCoverApplying(false);
      }
    },
    [reportId],
  );

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

  // ── Needs-input: save the user's text (typed or extracted-then-edited) ──────
  // Reuses the section-produce route with user_input — the backend turns it
  // into real, mode-appropriate content and updates the section's feeder.
  // Confirmed live: this response is minimal (section_code/status/content/
  // error only) — no title/mode/source_type — so only the fields it actually
  // carries are merged in; everything else (title, mode, …) keeps its prior,
  // known-good value instead of being overwritten with the normalizer's
  // code-as-title fallback.
  const handleSaveSectionInput = useCallback(
    async (code: string, text: string) => {
      if (!reportId) return;
      const updated = await earnings.produceEarningsSection(reportId, code, { user_input: text });
      setSections((list) =>
        list.map((s) =>
          s.section_code === code
            ? {
                ...s,
                content: updated.content,
                status: updated.status,
                feeder_status: updated.feeder_status,
                feeder_message: updated.feeder_message,
                source_label: updated.source_label,
                source_ref: updated.source_ref,
                confidence: updated.confidence,
                flag: updated.flag,
                edited: true,
              }
            : s,
        ),
      );
    },
    [reportId],
  );

  // Extract text from an uploaded file to prefill the needs-input textarea —
  // never touches section state itself; the form owns the draft until Save.
  const handleExtractSectionInput = useCallback(
    (code: string, file: File) => {
      if (!reportId) return Promise.reject(new Error('Missing report id.'));
      return earnings.extractSectionInput(reportId, code, file);
    },
    [reportId],
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
      setSectionsLocked(true);
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
        <EarningsStepper activeStep={4} reportId={reportId} locked={locked} />
        <div className="card" style={{ padding: 0 }}>
          <Spinner pad={80} />
        </div>
      </div>
    );
  }

  if (error && sections.length === 0) {
    return (
      <div>
        <EarningsStepper activeStep={4} reportId={reportId} locked={locked} />
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

  // Sections that vanish entirely when omitted by design (quote/trend, or a
  // "no data found" boilerplate section) — no card, no rail entry, no gating
  // on a section that will never produce content. Returning null from the
  // leaf renderer alone isn't enough; the outer numbered card would still
  // render around an empty body.
  //
  // A needs_input section stays visible here on purpose: this screen (Report,
  // formerly "Preview" — see "Rename the last two earnings steps") is where
  // its manual text/upload form actually lives. Today's Preview page is a
  // different, unrelated screen (financial figure-picking, inherited from the
  // old Figures step) that was never built to host it — hiding it here would
  // leave no way to ever complete the section.
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
      <EarningsStepper activeStep={4} reportId={reportId} locked={locked} />
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: '0 0 4px' }}>
          Your earnings report
        </h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED, maxWidth: 620 }}>
          The finished report, end to end. Edit any section in place, then export it or send
          it for review.
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 290px', gap: 18, alignItems: 'start' }}>
          {/* Left — generate state or the assembled document. The chosen brand
              color drives report-content accents (cover, headings) via
              --brand-primary; product-UI chrome stays indigo. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              minWidth: 0,
              ['--brand-primary' as string]: brand?.primary ?? '#4040C8',
              ['--brand-secondary' as string]: brand?.secondary ?? '#4040C8',
            }}
          >
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
                      <h2 style={{ fontSize: 16, fontWeight: 800, color: BRAND, margin: 0 }}>{s.title}</h2>
                    </div>
                    <EditableProse
                      section={s}
                      coverTemplateKey={coverTemplateKey}
                      locked={locked}
                      onSave={(content) => handleSaveSection(s.section_code, content)}
                      onSaveInput={(text) => handleSaveSectionInput(s.section_code, text)}
                      onExtractInput={(file) => handleExtractSectionInput(s.section_code, file)}
                      onAcknowledgeFlag={() => acknowledgeFlag(s.section_code)}
                    />
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Right — what you DO with the finished report. It sits beside the
              document rather than under it, so approving and exporting are never
              a scroll away, and on the trailing side so the page opens on the
              report itself rather than on its controls. The section rail is gone:
              this screen is the report read end to end, not a place to jump
              between parts.

              Second in source as well as on screen, so tab order and screen-reader
              order reach the report before the controls that act on it — rather
              than being visually moved with `order`, which leaves the two
              disagreeing. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 12 }}>
            <PublishBar
              locked={locked}
              approvedAt={reportStatus?.approved_at ?? null}
              blockers={blockers}
              approving={approving}
              onApprove={handleApprove}
              onExport={handleExport}
              showApprove={false}
            />
            {reportId && <ReportHubPanel reportId={reportId} showStatus={false} readOnly={locked} />}
          </div>

        </div>
      )}

    </div>
  );
}
