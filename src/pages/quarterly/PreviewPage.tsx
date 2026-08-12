import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import { SectionRefineChat } from '@/components/quarterly/SectionRefineChat';
import SectionAnalysis, { ReadingBand } from '@/components/quarterly/SectionAnalysis';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import { CoverTemplatePicker } from '@/components/quarterly/CoverTemplatePicker';
import type { ProducedSection, CoverTemplate, ColorPalette, BrandColors, CoverSelectionPayload, MetricsMode } from '@/types/quarterly';
import {
  isCoverSection,
  sectionState,
  isProducing,
  wantsInput,
  neededInput,
  sourceTypeLabel,
  seedFromOutline,
  byDisplayOrder,
  isTableOfContentsSection,
  isFinancialTable,
} from '@/components/quarterly/sectionState';

// ─── colours (match Coverage / Gaps / Outline conventions) ────────────────────
const ACCENT = '#4040C8';
const ACCENT_LIGHT = 'rgba(64,64,200,.07)';
const ACCENT_RING = 'rgba(64,64,200,.35)';
const GREEN = '#10B981';
const GREEN_LIGHT = '#D1FAE5';
const AMBER = '#D97706';
const AMBER_LIGHT = '#FEF3C7';
const MUTED = '#6B7280';
const DARK = '#1F2340';
const MONO = "'DM Mono', 'Courier New', monospace";

const pad2 = (n: number) => String(n).padStart(2, '0');

function SourceTypeBadge({ section }: { section: ProducedSection }) {
  return (
    <span
      style={{
        flexShrink: 0,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        color: '#5A6080',
        background: '#F1F2F8',
        border: '1px solid #E4E6F1',
        borderRadius: 999,
        padding: '3px 9px',
      }}
    >
      {sourceTypeLabel(section)}
    </span>
  );
}

// ─── page shell ───────────────────────────────────────────────────────────────
function Shell({
  reportId,
  metricsMode,
  children,
}: {
  reportId?: string;
  // Custom reports have an extra Financial Data step in the indicator. Unknown
  // until the outline loads, which is why it's nullable rather than defaulted.
  metricsMode?: MetricsMode | null;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        // See OutlinePage: the 48px double-counted the stepper rendered inside.
        height: '100%',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {reportId && (
        <QuarterlyReportStepper step="preview" reportId={reportId} metricsMode={metricsMode} />
      )}
      {children}
    </div>
  );
}

// ─── left-rail row with tri-state status dot ──────────────────────────────────
function RailItem({
  section,
  index,
  isCurrent,
  onClick,
}: {
  section: ProducedSection;
  index: number;
  isCurrent: boolean;
  onClick: () => void;
}) {
  const state = sectionState(section);
  // A section still in the production queue spins like one being drafted, because
  // that is what it is — waiting, not missing.
  const drafting = section.status === 'drafting' || state === 'pending';
  const produced = state === 'produced';
  const needs = wantsInput(state); // needs_input + no-data both want the user's input

  // dot: green produced · amber needs-input · accent(spin) waiting/drafting · grey empty
  const dotBg = produced ? GREEN_LIGHT : needs ? AMBER_LIGHT : drafting ? ACCENT : '#F1F2F6';
  const dotColor = produced ? GREEN : needs ? AMBER : drafting ? '#fff' : MUTED;
  const dotBorder = produced ? '#A7F3D0' : needs ? '#FDE68A' : drafting ? ACCENT : '#E5E7EF';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: isCurrent ? ACCENT_LIGHT : 'transparent',
        border: isCurrent ? `1.5px solid ${ACCENT_RING}` : '1.5px solid transparent',
        transition: 'background 0.15s, border-color 0.15s',
        marginBottom: 2,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          background: dotBg,
          color: dotColor,
          border: `1px solid ${dotBorder}`,
        }}
      >
        {produced ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 6.2L5 8.7l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : drafting ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.35" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          String(index + 1)
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: isCurrent ? 700 : 500,
            color: isCurrent ? DARK : '#374151',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {section.title}
        </div>
      </div>

      {needs && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: AMBER, flexShrink: 0 }} title="Needs input" />
      )}
    </div>
  );
}

// ─── status pill (main panel header) ──────────────────────────────────────────
function StatusPill({ section }: { section: ProducedSection }) {
  const state = sectionState(section);
  const drafting = section.status === 'drafting';
  const cfg = state === 'pending'
    ? { label: 'Waiting…', color: ACCENT, bg: '#EEEEFF', tick: false }
    : drafting
    ? { label: 'Composing…', color: ACCENT, bg: '#EEEEFF', tick: false }
    : state === 'produced'
      ? { label: 'Produced', color: GREEN, bg: GREEN_LIGHT, tick: true }
      : wantsInput(state)
        ? { label: 'Needs input', color: AMBER, bg: AMBER_LIGHT, tick: false }
        : { label: 'No data', color: '#9BA3C4', bg: '#F2F3FA', tick: false };
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px',
        borderRadius: 20, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg,
      }}
    >
      {cfg.tick ? (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M2.5 6.2L5 8.7l4.5-5" stroke={cfg.color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color }} />
      )}
      {cfg.label}
    </span>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
export default function PreviewPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [sections, setSections] = useState<ProducedSection[]>([]);
  // Read by the production poll. A ref rather than the state itself so patching one
  // section does not tear down and restart the interval on every tick.
  const sectionsRef = useRef<ProducedSection[]>([]);
  sectionsRef.current = sections;
  // Batch production runs in the background after the outline is locked and takes
  // minutes on a large report, so Preview is routinely opened while it is still
  // working. Declared here because the poll effect below reads it.
  const producing = isProducing(sections);
  // Only for the step indicator — Custom reports have an extra Financial Data step.
  const [metricsMode, setMetricsMode] = useState<MetricsMode | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // per-section working state
  const [inputText, setInputText] = useState<Record<string, string>>({});
  const [sectionFile, setSectionFile] = useState<Record<string, File | null>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Document extraction in flight (per section) — extract-to-field before save.
  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // inline edit (produced sections — figures and prose are both editable)
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // ── Cover design + brand color (Part 6) ──
  const [coverTemplates, setCoverTemplates] = useState<CoverTemplate[]>([]);
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null);
  const [brand, setBrand] = useState<BrandColors | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverApplying, setCoverApplying] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  // Real company + period for the cover (no placeholders).
  const companyName = user?.company_name ?? null;
  const [coverMeta, setCoverMeta] = useState<{ period: string | null; title: string | null; preparedOn: string | null }>({
    period: null,
    title: null,
    preparedOn: null,
  });

  // Load cover templates + palettes + the current selection, and the real
  // period/title for the cover (best-effort from the preview header).
  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    quarterlyReports
      .getCoverTemplates(companyId, reportId)
      .then((res) => {
        if (cancelled) return;
        const list = res.cover_templates ?? [];
        setCoverTemplates(list);
        if (res.selected) {
          setCoverTemplateKey(res.selected.cover_template_key);
          setBrand(res.selected.brand);
        } else {
          const def = list.find((t) => t.is_default) ?? list[0];
          if (def) setCoverTemplateKey(def.key);
        }
      })
      .catch(() => {
        /* cover picker simply has nothing to show until the backend lands */
      });
    quarterlyReports
      .getColorPalettes(companyId)
      .then((res) => {
        if (!cancelled) setPalettes(res.color_palettes ?? []);
      })
      .catch(() => {});
    quarterlyReports
      .getPreview(companyId, reportId)
      .then((res) => {
        if (cancelled || !res.generated) return;
        setCoverMeta({
          period: res.header?.period_label ?? null,
          title: res.header?.title ?? null,
          preparedOn: res.header?.prepared_on ?? null,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyId, reportId]);

  const handleCoverApply = useCallback(
    async (payload: CoverSelectionPayload) => {
      if (!companyId || !reportId) return;
      setCoverApplying(true);
      setCoverError(null);
      try {
        const res = await quarterlyReports.selectCoverTemplate(companyId, reportId, payload);
        // Prefer the payload the user actually picked — the PATCH response shape
        // may not echo cover_template_key/brand, which would reset to the default.
        setCoverTemplateKey(res?.cover_template_key ?? payload.cover_template_key);
        setBrand(res?.brand ?? payload.brand);
        setPickerOpen(false);
      } catch (err: unknown) {
        setCoverError(err instanceof Error ? err.message : 'Could not save the cover selection.');
      } finally {
        setCoverApplying(false);
      }
    },
    [companyId, reportId],
  );

  // Merge a partial update into one section by code.
  const patchSection = useCallback((code: string, partial: Partial<ProducedSection>) => {
    setSections((prev) => prev.map((s) => (s.section_code === code ? { ...s, ...partial } : s)));
  }, []);

  // ── load: locked outline → seed list → hydrate each section's status/content.
  // Batch production already ran on the processing loader (kicked from the
  // Outline), so sections arrive produced; we only DISPLAY them here. Any section
  // still needing input (needs_input) stays interactive in the panel below.
  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    quarterlyReports
      .getOutline(companyId, reportId)
      .then(async (res) => {
        if (cancelled) return;
        // The Table of Contents is generated from the finished document, so there is
        // nothing to preview or produce for it here. Dropping it from this list is
        // display-only — it stays in the saved outline and in the assembled report.
        const included = (res.sections ?? [])
          .filter((s) => s.included && !s.hidden_duplicate)
          .filter((s) => !isTableOfContentsSection(s.section_code))
          .sort(byDisplayOrder)
          .map(seedFromOutline);
        setSections(included);
        setMetricsMode(res.metrics_mode ?? null);
        setCurrentIndex(0);
        setLoading(false);

        // Hydrate each section's produced status/content (best-effort).
        await Promise.allSettled(
          included.map(async (s) => {
            const one = await quarterlyReports.getSection(companyId, reportId, s.section_code);
            if (!cancelled) patchSection(s.section_code, one);
          }),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : 'Failed to load the report sections.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, reportId, retryKey, patchSection]);

  // ── while batch production is still running, re-read the sections it hasn't
  // reached yet. Production is kicked from the Outline and runs in the background;
  // on a 49-section report it takes minutes, so Preview is routinely opened partway
  // through. Without this the page shows whatever was true at load and never moves.
  //
  // Only the pending ones are re-fetched — a produced section will not change under
  // us, and re-reading forty of them every few seconds to learn nothing is waste.
  useEffect(() => {
    if (!companyId || !reportId || !producing) return;
    let cancelled = false;

    const id = window.setInterval(async () => {
      const waiting = sectionsRef.current.filter((s) => sectionState(s) === 'pending');
      if (!waiting.length) return;
      const results = await Promise.allSettled(
        waiting.map((s) => quarterlyReports.getSection(companyId, reportId, s.section_code)),
      );
      if (cancelled) return;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') patchSection(waiting[i].section_code, r.value);
      });
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [companyId, reportId, producing, patchSection]);

  // ── produce a single section (manual): needs_input / no-data (empty) sections
  // let the user PROVIDE the content as text (a document is extracted into the
  // field first, see handleExtract). Saved via produce — Template sections keep
  // it verbatim, AI-written use it as a steer. Produced sections are edited
  // in-place instead (see handleSaveContent), not re-produced.
  const handleProduce = useCallback(
    async (section: ProducedSection) => {
      if (!companyId || !reportId) return;
      const code = section.section_code;
      const text = (inputText[code] ?? '').trim();
      if (!text) return; // uploaded docs are extracted into the field first
      setBusy((b) => ({ ...b, [code]: true }));
      setErrors((e) => ({ ...e, [code]: '' }));
      try {
        const res = await quarterlyReports.produceSection(companyId, reportId, code, { user_input: text });
        patchSection(code, res);
        setInputText((m) => ({ ...m, [code]: '' }));
        setSectionFile((m) => ({ ...m, [code]: null }));
      } catch (err: unknown) {
        setErrors((e) => ({ ...e, [code]: err instanceof Error ? err.message : 'Could not save this section.' }));
      } finally {
        setBusy((b) => ({ ...b, [code]: false }));
      }
    },
    [companyId, reportId, inputText, patchSection],
  );

  // "Saved ✓" flash auto-clears.
  useEffect(() => {
    if (!savedCode) return;
    const t = setTimeout(() => setSavedCode(null), 2000);
    return () => clearTimeout(t);
  }, [savedCode]);

  // ── inline edit a produced section's content (figures or prose) in place.
  const handleSaveContent = useCallback(
    async (code: string, content: string) => {
      if (!companyId || !reportId) return;
      const prev = sections.find((s) => s.section_code === code)?.content ?? null;
      setSavingCode(code);
      setEditError(null);
      patchSection(code, { content }); // optimistic
      try {
        const res = await quarterlyReports.saveSectionContent(companyId, reportId, code, { content });
        patchSection(code, { content: res.section?.content ?? content }); // authoritative
        setEditingCode(null);
        setSavedCode(code);
      } catch (err: unknown) {
        patchSection(code, { content: prev }); // revert
        setEditError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      } finally {
        setSavingCode(null);
      }
    },
    [companyId, reportId, sections, patchSection],
  );

  // ── document upload for a section awaiting input.
  //   • Financial (table/kpi) sections: one-step /upload — the backend structures
  //     the document's tables into the standard section table (no textarea review,
  //     the table IS the content), so it patches straight to the produced section.
  //   • Other sections: extract-only — pull the document's text into the input
  //     field for the user to review/edit, then Save persists it as content.
  const handleExtract = useCallback(
    async (section: ProducedSection, file: File | null) => {
      if (!companyId || !reportId) return;
      const code = section.section_code;
      setSectionFile((m) => ({ ...m, [code]: file }));
      if (!file) return;
      setExtracting((x) => ({ ...x, [code]: true }));
      setErrors((e) => ({ ...e, [code]: '' }));
      try {
        if (section.mode === 'table' || section.mode === 'kpi') {
          const res = await quarterlyReports.uploadSectionDocument(companyId, reportId, code, file);
          patchSection(code, res);
          setInputText((m) => ({ ...m, [code]: '' }));
        } else {
          const res = await quarterlyReports.extractSectionDocument(companyId, reportId, code, file);
          const extracted = res.text ?? res.extracted_text ?? '';
          setInputText((m) => ({ ...m, [code]: extracted }));
        }
      } catch (err: unknown) {
        setErrors((e) => ({ ...e, [code]: err instanceof Error ? err.message : 'Could not extract text from this document.' }));
      } finally {
        // The file has been consumed (into the field, or into the produced table) —
        // clear the chip either way.
        setSectionFile((m) => ({ ...m, [code]: null }));
        setExtracting((x) => ({ ...x, [code]: false }));
      }
    },
    [companyId, reportId, patchSection],
  );

  const handleRefined = useCallback(
    (updated: ProducedSection) => {
      patchSection(updated.section_code, updated);
    },
    [patchSection],
  );

  const total = sections.length;
  const section = sections[currentIndex] ?? null;

  // Export enabled when every section is produced, has no data, or was skipped —
  // i.e. nothing is still waiting on the user (needs_input, unfilled).
  const allResolved =
    total > 0 &&
    !producing &&
    sections.every((s) => sectionState(s) !== 'needs_input' || skipped.has(s.section_code));
  const doneCount = sections.filter((s) => sectionState(s) === 'produced').length;

  // ── loading / error / empty ──
  if (loading) {
    return (
      <Shell reportId={reportId} metricsMode={metricsMode}>
        <Spinner pad={80} />
      </Shell>
    );
  }
  if (fetchError) {
    return (
      <Shell reportId={reportId} metricsMode={metricsMode}>
        <div style={{ padding: '24px 28px' }}>
          <div style={{ padding: '16px 20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 13, color: '#DC2626' }}>{fetchError}</span>
            <button className="bs" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setRetryKey((k) => k + 1)}>
              Retry
            </button>
          </div>
        </div>
      </Shell>
    );
  }
  if (total === 0) {
    return (
      <Shell reportId={reportId} metricsMode={metricsMode}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: DARK, margin: '0 0 8px' }}>No sections to produce</h2>
          <p style={{ fontSize: 13, color: MUTED, marginBottom: 22 }}>Lock an outline first to generate the report.</p>
          <button className="btn bp" style={{ padding: '10px 20px' }} onClick={() => navigate(`/quarterly-report/${reportId}/outline`)}>
            ← Back to outline
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell reportId={reportId} metricsMode={metricsMode}>
      {/* Header */}
      <div style={{ padding: '22px 28px 16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: '0 0 4px', lineHeight: 1.2 }}>Report preview</h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>
          Each section is produced from your figures and inputs. Refine AI-written sections, or supply what a section still needs.
        </p>
      </div>

      {/* Two-column body */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, padding: '0 28px 16px', alignItems: 'stretch' }}>
        {/* LEFT rail */}
        <div className="card" style={{ padding: '14px 10px 10px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 6px', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: MUTED, textTransform: 'uppercase' }}>
              Sections
            </span>
            <span
              style={{
                fontSize: 11, fontWeight: 700, fontFamily: MONO,
                color: allResolved ? GREEN : ACCENT,
                background: allResolved ? GREEN_LIGHT : ACCENT_LIGHT,
                padding: '2px 8px', borderRadius: 10,
              }}
            >
              {doneCount}/{total}
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 }}>
            {sections.map((s, i) => (
              <RailItem
                key={s.section_code}
                section={s}
                index={i}
                isCurrent={i === currentIndex}
                onClick={() => setCurrentIndex(i)}
              />
            ))}
          </div>
        </div>

        {/* RIGHT — selected section. The brand color drives report-content accents
            via --brand-primary; body text stays dark. */}
        <div
          style={{
            minHeight: 0,
            overflowY: 'auto',
            ['--brand-primary' as string]: brand?.primary ?? '#4040C8',
            ['--brand-secondary' as string]: brand?.secondary ?? '#4040C8',
          }}
        >
          {section && (
            <div className="card" style={{ padding: '24px 28px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: '#fff', background: ACCENT, padding: '3px 7px', borderRadius: 6 }}>
                  {pad2(currentIndex + 1)}
                </span>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: DARK, flex: 1, minWidth: 0 }}>{section.title}</h2>
                <SourceTypeBadge section={section} />
                {isCoverSection(section) && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    style={{
                      fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8,
                      color: '#fff', background: ACCENT, border: 'none', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                    Choose cover design & colors
                  </button>
                )}
                {!isCoverSection(section) && <StatusPill section={section} />}
              </div>

              {isCoverSection(section) ? (
                <CoverRenderer
                  companyName={companyName}
                  period={coverMeta.period}
                  title={coverMeta.title}
                  preparedOn={coverMeta.preparedOn}
                  brand={brand}
                  templateKey={coverTemplateKey}
                />
              ) : (
                <SectionPanel
                  section={section}
                  busy={!!busy[section.section_code]}
                  extracting={!!extracting[section.section_code]}
                  error={errors[section.section_code] || null}
                  inputValue={inputText[section.section_code] ?? ''}
                  onInputChange={(v) => setInputText((m) => ({ ...m, [section.section_code]: v }))}
                  file={sectionFile[section.section_code] ?? null}
                  onFileChange={(f) => handleExtract(section, f)}
                  onProduce={() => handleProduce(section)}
                  onSkip={() => setSkipped((s) => new Set(s).add(section.section_code))}
                  skipped={skipped.has(section.section_code)}
                  companyId={companyId}
                  reportId={reportId ?? null}
                  onRefined={handleRefined}
                  editing={editingCode === section.section_code}
                  saving={savingCode === section.section_code}
                  saved={savedCode === section.section_code}
                  editError={editingCode === section.section_code ? editError : null}
                  onStartEdit={() => { setEditError(null); setEditingCode(section.section_code); }}
                  onCancelEdit={() => { setEditError(null); setEditingCode(null); }}
                  onSaveContent={(content) => handleSaveContent(section.section_code, content)}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {pickerOpen && (
        <CoverTemplatePicker
          templates={coverTemplates}
          palettes={palettes}
          initialTemplateKey={coverTemplateKey}
          initialBrand={brand}
          applying={coverApplying}
          error={coverError}
          onApply={handleCoverApply}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Footer */}
      <div style={{ flexShrink: 0, background: '#fff', borderTop: '1px solid #E5E7EF', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <button className="btn bs" style={{ fontSize: 13, padding: '10px 18px' }} onClick={() => navigate(`/quarterly-report/${reportId}/outline`)}>
          ← Back
        </button>
        <span
          style={{ fontSize: 13, color: allResolved ? GREEN : producing ? ACCENT : MUTED, fontWeight: 600 }}
          aria-live="polite"
        >
          {producing
            ? `Producing sections… ${doneCount} of ${total} done`
            : `${doneCount} of ${total} produced`}
        </span>
        <button
          className="bp"
          style={{ fontSize: 14, padding: '10px 22px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => navigate(`/quarterly-report/${reportId}/report`)}
        >
          Continue to report
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
            <path d="M8 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </Shell>
  );
}

// Per-section supporting-document picker (label-wrapped input; no ref needed).
function FileField({ file, onFileChange, disabled }: { file: File | null; onFileChange: (f: File | null) => void; disabled?: boolean }) {
  if (file) {
    return (
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5EF', background: 'rgba(64,64,200,.04)' }}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
          <path d="M12 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6z" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M12 2v4h4" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: DARK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
        <button type="button" onClick={() => onFileChange(null)} aria-label="Remove file" style={{ background: 'transparent', border: 0, cursor: 'pointer', color: MUTED, lineHeight: 0, padding: 0 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
    );
  }
  return (
    <label
      style={{
        marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px',
        borderRadius: 8, border: '1.5px dashed #C9CDE4', background: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12.5, fontWeight: 600, color: '#5A6080',
      }}
    >
      <input
        type="file"
        style={{ display: 'none' }}
        disabled={disabled}
        onChange={(e) => { onFileChange(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
      />
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <path d="M10 4v8M6 8l4-4 4 4" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 14v1a2 2 0 002 2h8a2 2 0 002-2v-1" stroke="#9BA3C4" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Attach a supporting document
    </label>
  );
}

// ─── selected-section body (produced content / needs-input / empty / refine) ──
function SectionPanel({
  section,
  busy,
  extracting,
  error,
  inputValue,
  onInputChange,
  file,
  onFileChange,
  onProduce,
  onSkip,
  skipped,
  companyId,
  reportId,
  onRefined,
  editing,
  saving,
  saved,
  editError,
  onStartEdit,
  onCancelEdit,
  onSaveContent,
}: {
  section: ProducedSection;
  busy: boolean;
  extracting: boolean;
  error: string | null;
  inputValue: string;
  onInputChange: (v: string) => void;
  file: File | null;
  onFileChange: (f: File | null) => void;
  onProduce: () => void;
  onSkip: () => void;
  skipped: boolean;
  companyId: string | null;
  reportId: string | null;
  onRefined: (s: ProducedSection) => void;
  editing: boolean;
  saving: boolean;
  saved: boolean;
  editError: string | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveContent: (content: string) => void;
}) {
  const state = sectionState(section);
  const [analysing, setAnalysing] = useState(false);
  // Input-seeking states (needs_input / empty) stay in their own panel while
  // saving (button shows "Saving…") — only a fresh produce shows the full
  // "Composing…" spinner.
  const drafting =
    (section.status === 'drafting' || busy || state === 'pending')
    && state !== 'produced' && !wantsInput(state);
  const canRefine = state === 'produced' && section.mode === 'generate';

  // 1) Composing (produce in-flight)
  if (drafting) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '28px 4px', color: ACCENT }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
          <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {state === 'pending' && !busy
            ? 'Waiting to be produced — this section has not been reached yet.'
            : 'Composing this section…'}
        </span>
      </div>
    );
  }

  // 2) Produced → real content, editable in place (figures and prose alike).
  //    No Regenerate — the user edits the produced content directly instead.
  if (state === 'produced') {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginBottom: 12 }}>
          {saved && (
            <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6.2L5 8.7l4.5-5" stroke={GREEN} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Saved
            </span>
          )}
          {!editing && (
            <button
              type="button"
              onClick={onStartEdit}
              aria-label={`Edit ${section.title}`}
              title="Edit section"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid #E4E6F1', background: '#fff', color: MUTED, cursor: 'pointer' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
        {/* The reading band travels over the table while the analyser works, so it
            wraps the content — and sits OUTSIDE the table's own overflow-x
            scroller, which would otherwise clip a vertically-moving band. */}
        <div style={{ position: 'relative', overflow: analysing ? 'hidden' : undefined }}>
          <EditableSectionContent
            section={section}
            editing={editing}
            saving={saving}
            error={editing ? editError : null}
            onSave={onSaveContent}
            onCancel={onCancelEdit}
          />
          {analysing && <ReadingBand />}
        </div>
        {!editing && companyId && reportId && isFinancialTable(section) && (
          <SectionAnalysis
            key={section.section_code}
            companyId={companyId}
            reportId={reportId}
            section={section}
            onBusyChange={setAnalysing}
          />
        )}
        {canRefine && !editing && companyId && reportId && (
          <SectionRefineChat companyId={companyId} reportId={reportId} sectionCode={section.section_code} onRefined={onRefined} />
        )}
      </>
    );
  }

  // 3) Needs input OR no-data (empty) → both let the user supply content: a text
  //    field + a document upload (whose text is extracted into the field). Upload
  //    → extract → review/edit → Save.
  const need = neededInput(section);
  const isEmpty = state === 'empty';
  const canProduce = !busy && !extracting && !!inputValue.trim();
  return (
    <div>
      <div style={{ background: AMBER_LIGHT, border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: AMBER, marginBottom: 3 }}>
          {isEmpty ? 'No data found for this section' : 'This section needs your input'}
        </div>
        <div style={{ fontSize: 13, color: '#92610A' }}>
          {isEmpty ? 'Add content below — type it in, or upload a document to pull its text.' : `Needs: ${need}`}
        </div>
      </div>

      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#3A3F5C', marginBottom: 6 }}>
        {isEmpty ? 'Section content' : need}
      </label>
      <textarea
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder={`Type or paste ${isEmpty ? 'the section content' : need.toLowerCase()}…`}
        rows={5}
        disabled={extracting}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 8, border: `1.5px solid ${error ? '#FECACA' : '#E5E7EF'}`,
          fontSize: 13, lineHeight: 1.6, color: DARK, background: extracting ? '#F8F9FC' : '#fff', resize: 'vertical',
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color .15s',
        }}
        onFocus={(e) => { if (!error) e.currentTarget.style.borderColor = ACCENT; }}
        onBlur={(e) => { if (!error) e.currentTarget.style.borderColor = '#E5E7EF'; }}
      />

      <FileField file={file} onFileChange={onFileChange} disabled={busy || extracting} />

      {extracting && (
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, color: ACCENT }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
            <circle cx="12" cy="12" r="10" stroke={ACCENT} strokeWidth="3" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" />
          </svg>
          Extracting text from document…
        </div>
      )}

      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#DC2626' }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={onSkip}
          style={{ background: 'none', border: 'none', fontSize: 13, color: MUTED, cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          {skipped ? 'Skipped — will be flagged' : 'Skip for now'}
        </button>
        <button
          className="btn bp"
          onClick={onProduce}
          disabled={!canProduce}
          style={{ fontSize: 13, padding: '10px 22px', opacity: canProduce ? 1 : 0.55 }}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
