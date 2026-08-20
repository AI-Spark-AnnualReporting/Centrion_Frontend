// The cover design & colours pick, shared by the Review and Report steps —
// both show the title page, and both open the same picker the quarterly
// assembled report uses.
//
// The catalogue and the palettes are company reference data (the quarterly
// endpoints), so one company's reports pick from one list. Only the selection
// itself is board-scoped: GET/PATCH /board/reports/{id}/cover-template.

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { boardReports, quarterlyReports } from '@/lib/api';
import { CoverTemplatePicker } from '@/components/quarterly/CoverTemplatePicker';
import type {
  BrandColors,
  ColorPalette,
  CoverSelectionPayload,
  CoverTemplate,
} from '@/types/quarterly';
import { errorMessage } from './board-helpers';

export function useBoardCover(
  reportId: string,
  /** What `/assemble` says, used until the report has a pick of its own. */
  fallback?: { templateKey?: string | null; brand?: BrandColors | null },
) {
  const { user } = useAuth();
  const companyId = user?.company_id ?? null;

  const [templates, setTemplates] = useState<CoverTemplate[]>([]);
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [key, setKey] = useState<string | null>(null);
  const [brand, setBrand] = useState<BrandColors | null>(null);
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The saved pick, so the picker opens on it rather than blank.
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    boardReports
      .getCoverTemplate(reportId)
      .then((res) => {
        if (cancelled) return;
        if (res?.cover_template_key) setKey(res.cover_template_key);
        if (res?.brand) setBrand(res.brand);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  // A failure here just leaves the picker empty — it never blocks the page.
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    quarterlyReports
      .getCoverTemplates(companyId)
      .then((res) => !cancelled && setTemplates(res.cover_templates ?? []))
      .catch(() => {});
    quarterlyReports
      .getColorPalettes(companyId)
      .then((res) => !cancelled && setPalettes(res.color_palettes ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const apply = useCallback(
    async (payload: CoverSelectionPayload) => {
      setApplying(true);
      setError(null);
      try {
        const res = await boardReports.selectCoverTemplate(reportId, payload);
        // The user's pick wins over the response — as on quarterly, the PATCH
        // may not echo the selection back, which would reset the cover.
        setKey(res?.cover_template_key ?? payload.cover_template_key);
        setBrand(res?.brand ?? payload.brand);
        setOpen(false);
      } catch (err: unknown) {
        setError(errorMessage(err, 'Could not save the cover selection.'));
      } finally {
        setApplying(false);
      }
    },
    [reportId],
  );

  const templateKey = key ?? fallback?.templateKey ?? null;
  const coverBrand = brand ?? fallback?.brand ?? null;

  return {
    templateKey,
    brand: coverBrand,
    companyName: user?.company_name ?? null,
    openPicker: () => {
      setError(null);
      setOpen(true);
    },
    /** Render this anywhere in the page; it's null while the picker is closed. */
    picker: open ? (
      <CoverTemplatePicker
        templates={templates}
        palettes={palettes}
        initialTemplateKey={templateKey}
        initialBrand={coverBrand}
        applying={applying}
        error={error}
        onApply={apply}
        onClose={() => setOpen(false)}
      />
    ) : null,
  };
}
