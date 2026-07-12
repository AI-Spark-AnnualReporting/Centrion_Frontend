import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { quarterlyReports } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import { QuarterlyReportStepper } from '@/components/quarterly/QuarterlyReportStepper';
import { CoverRenderer } from '@/components/quarterly/CoverRenderer';
import { CoverTemplatePicker } from '@/components/quarterly/CoverTemplatePicker';
import { DownloadMenu } from '@/components/quarterly/DownloadMenu';
import { EditableSectionContent } from '@/components/quarterly/EditableSectionContent';
import { isCoverSection } from '@/components/quarterly/sectionState';
import type {
  ProducedSection,
  AssembledSection,
  CoverTemplate,
  ColorPalette,
  BrandColors,
  CoverSelectionPayload,
} from '@/types/quarterly';

const ACCENT = '#4040C8';
const GREEN = '#10B981';
const MUTED = '#6B7280';
const DARK = '#1F2340';
const MONO = "'DM Mono', 'Courier New', monospace";
const BRAND = 'var(--brand-primary, #4040C8)';
const pad2 = (n: number) => String(n).padStart(2, '0');
// One shared document width so the cover page and section pages line up.
const DOC_WIDTH = 820;

// The exact cover/brand nesting in the /assemble response isn't fixed, so read it
// defensively across the likely shapes (cover.* / selected.* / top-level).
function pick(o: unknown, key: string): unknown {
  return o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined;
}
function asStr(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
function asBrand(v: unknown): BrandColors | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (o && typeof o.primary === 'string' && typeof o.secondary === 'string') {
    return { primary: o.primary, secondary: o.secondary, palette_key: typeof o.palette_key === 'string' ? o.palette_key : '' };
  }
  return null;
}
function readCoverSelection(res: unknown): { key: string | null; brand: BrandColors | null } {
  const cover = pick(res, 'cover') ?? pick(res, 'selected') ?? pick(res, 'cover_template');
  const key =
    asStr(pick(res, 'cover_template_key')) ??
    asStr(pick(cover, 'cover_template_key')) ??
    asStr(pick(cover, 'key')) ??
    asStr(pick(cover, 'template_key'));
  const brand = asBrand(pick(res, 'brand')) ?? asBrand(pick(cover, 'brand'));
  return { key, brand };
}

// The assemble endpoint returns produced sections only. Map to a ProducedSection
// shape so the shared renderers/editor work unchanged.
function toProduced(s: AssembledSection): ProducedSection {
  // /assemble may return table content as a parsed object; normalise to a string
  // so the renderers/editor (which expect a JSON string or prose) work.
  const raw = s.content as unknown;
  const content = raw == null ? null : typeof raw === 'string' ? raw : JSON.stringify(raw);
  return {
    section_code: s.section_code,
    title: s.title,
    display_order: s.display_order ?? 0,
    source_type: s.source_type ?? '',
    mode: s.mode,
    status: 'done',
    content,
    feeder_status: 'ready',
  };
}

export default function AssembledReportPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [sections, setSections] = useState<ProducedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // cover + brand
  const [brand, setBrand] = useState<BrandColors | null>(null);
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null);
  const [coverMeta, setCoverMeta] = useState<{ company: string | null; period: string | null; title: string | null; preparedOn: string | null }>({
    company: null, period: null, title: null, preparedOn: null,
  });

  // picker catalogue
  const [coverTemplates, setCoverTemplates] = useState<CoverTemplate[]>([]);
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverApplying, setCoverApplying] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  // inline edit
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const companyName = coverMeta.company ?? user?.company_name ?? null;

  // ── load: assembled report + picker catalogue ──
  useEffect(() => {
    if (!companyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);

    quarterlyReports
      .getAssembled(companyId, reportId)
      .then((res) => {
        if (cancelled) return;
        const list = (res.sections ?? [])
          .slice()
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .map(toProduced);
        setSections(list);
        const { key, brand: coverBrand } = readCoverSelection(res);
        if (coverBrand) setBrand(coverBrand);
        if (key) setCoverTemplateKey(key);
        setCoverMeta({
          company: res.header?.company_name ?? null,
          period: res.header?.period_label ?? null,
          title: res.header?.title ?? null,
          preparedOn: res.header?.prepared_on ?? null,
        });
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : 'Failed to assemble the report.');
          setLoading(false);
        }
      });

    quarterlyReports.getCoverTemplates(companyId, reportId).then((res) => {
      if (cancelled) return;
      const t = res.cover_templates ?? [];
      setCoverTemplates(t);
      setCoverTemplateKey((prev) => prev ?? (t.find((x) => x.is_default) ?? t[0])?.key ?? null);
    }).catch(() => {});
    quarterlyReports.getColorPalettes(companyId).then((res) => {
      if (!cancelled) setPalettes(res.color_palettes ?? []);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [companyId, reportId, retryKey]);

  // "Saved ✓" flash auto-clears.
  useEffect(() => {
    if (!savedCode) return;
    const t = setTimeout(() => setSavedCode(null), 2000);
    return () => clearTimeout(t);
  }, [savedCode]);

  const patchContent = useCallback((code: string, content: string | null) => {
    setSections((prev) => prev.map((s) => (s.section_code === code ? { ...s, content } : s)));
  }, []);

  const handleSave = useCallback(
    async (code: string, content: string) => {
      if (!companyId || !reportId) return;
      const prev = sections.find((s) => s.section_code === code)?.content ?? null;
      setSavingCode(code);
      setEditError(null);
      patchContent(code, content); // optimistic
      try {
        const res = await quarterlyReports.saveSectionContent(companyId, reportId, code, { content });
        patchContent(code, res.section?.content ?? content); // authoritative
        setEditingCode(null);
        setSavedCode(code);
      } catch (err: unknown) {
        patchContent(code, prev); // revert
        setEditError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      } finally {
        setSavingCode(null);
      }
    },
    [companyId, reportId, sections, patchContent],
  );

  const handleCoverApply = useCallback(
    async (payload: CoverSelectionPayload) => {
      if (!companyId || !reportId) return;
      setCoverApplying(true);
      setCoverError(null);
      try {
        const res = await quarterlyReports.selectCoverTemplate(companyId, reportId, payload);
        // Prefer the payload the user picked — the PATCH response may not echo
        // cover_template_key/brand, which would reset the cover to the default.
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

  const bodySections = sections.filter((s) => !isCoverSection(s));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 48px)', background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
      {reportId && <QuarterlyReportStepper activeStep={5} reportId={reportId} />}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 28px 14px', flexShrink: 0, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: 0, lineHeight: 1.2 }}>Assembled report</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: MUTED }}>Cover first, then every section. Click the pencil to edit any section; changes save automatically.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{ fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 8, color: DARK, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}
          >
            Choose cover design & colors
          </button>
          <DownloadMenu companyId={companyId} reportId={reportId ?? null} title={coverMeta.title ?? undefined} label="Export" />
        </div>
      </div>

      {/* Document body — brand vars drive accents; body stays dark. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          background: '#F4F5FB',
          padding: '20px 28px 40px',
          ['--brand-primary' as string]: brand?.primary ?? '#4040C8',
          ['--brand-secondary' as string]: brand?.secondary ?? '#4040C8',
        }}
      >
        {loading ? (
          <Spinner pad={80} />
        ) : fetchError ? (
          <div style={{ maxWidth: 760, margin: '0 auto', padding: '16px 20px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <span style={{ fontSize: 13, color: '#DC2626' }}>{fetchError}</span>
            <button className="bs" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => setRetryKey((k) => k + 1)}>Retry</button>
          </div>
        ) : (
          <div style={{ maxWidth: DOC_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Cover — page 1 */}
            <CoverRenderer
              companyName={companyName}
              period={coverMeta.period}
              title={coverMeta.title}
              preparedOn={coverMeta.preparedOn}
              brand={brand}
              templateKey={coverTemplateKey}
              maxWidth={DOC_WIDTH}
            />

            {/* Sections */}
            <div className="card" style={{ padding: '32px 40px', maxWidth: DOC_WIDTH }}>
              {bodySections.map((s, i) => {
                const isEditing = editingCode === s.section_code;
                return (
                  <section key={s.section_code} style={{ marginBottom: 34 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: BRAND }}>{pad2(i + 1)}</span>
                      <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: BRAND, flex: 1, minWidth: 0, lineHeight: 1.25 }}>{s.title}</h2>
                      {savedCode === s.section_code && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: GREEN, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2L5 8.7l4.5-5" stroke={GREEN} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Saved
                        </span>
                      )}
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => { setEditError(null); setEditingCode(s.section_code); }}
                          aria-label={`Edit ${s.title}`}
                          title="Edit section"
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid #E4E6F1', background: '#fff', color: MUTED, cursor: 'pointer', flexShrink: 0 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <EditableSectionContent
                      section={s}
                      editing={isEditing}
                      saving={savingCode === s.section_code}
                      error={isEditing ? editError : null}
                      onSave={(content) => handleSave(s.section_code, content)}
                      onCancel={() => { setEditError(null); setEditingCode(null); }}
                    />
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, background: '#fff', borderTop: '1px solid #E5E7EF', padding: '12px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <button className="btn bs" style={{ fontSize: 13, padding: '10px 18px' }} onClick={() => navigate(`/quarterly-report/${reportId}/preview`)}>
          ← Back
        </button>
        <span style={{ fontSize: 12, color: MUTED }}>Cover + {bodySections.length} sections</span>
        <DownloadMenu companyId={companyId} reportId={reportId ?? null} title={coverMeta.title ?? undefined} label="Export" />
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
    </div>
  );
}
