// "Select outline" popup on the cycle page. The admin picks where this report's
// sections come from: Previous (the contents page of the annual report the company
// uploaded) or System (the standard sections for its sector and profile).
//
// Picking a card only highlights it and shows every section it holds, so the two can
// be compared. Nothing changes until "Use … outline", which REBUILDS the cycle's
// section list (the parent calls PUT /outline-source). Picking the option already in
// use rebuilds it: that replaced the old "Rebuild from this list" link.
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { sarCycles } from '@/lib/api';
import type { ReportOutlineDetail } from '@/types/company';
import type { OutlinePreviewSection } from '@/types/cycles';
import { Spinner } from '@/components/shared/Spinner';
import { SectionLayerBadge, SectionModeBadge } from './cycle-ui';
import { ChapterToggle, firstNumbers, groupByChapter, useFoldedChapters } from './PreviousOutline';

export type OutlineSource = 'previous' | 'system';

const INK = '#1A1D2E';
const MUTED = '#5A6080';
const FAINT = '#9BA3C4';
const ACCENT = '#4040C8';
const ACCENT_SOFT = '#EEEEFC';
const LINE = '#ECEEF8';
const MONO = "'DM Mono', monospace";

const OPTIONS: { key: OutlineSource; name: string; description: string; icon: string }[] = [
  {
    key: 'previous',
    name: 'Previous',
    description: 'Your own report structure, read from the contents page of the annual report you uploaded.',
    icon: '▤',
  },
  {
    key: 'system',
    name: 'System',
    description: 'Standard sections for your sector and company profile, including CMA requirements.',
    icon: '▦',
  },
];

interface PreviewState {
  loading: boolean;
  error: string;
  sections: OutlinePreviewSection[];
}

const EMPTY_PREVIEW: PreviewState = { loading: true, error: '', sections: [] };

/** True when the uploaded report's contents page gave this company any sections. */
export function hasPreviousOutline(detail: ReportOutlineDetail | null | undefined): boolean {
  const entries = Array.isArray(detail?.entries) ? detail.entries : [];
  return entries.some((e) => e.level === 2);
}

/** The words on the Use button for the highlighted option. */
export function useButtonLabel(draft: OutlineSource | null, current: OutlineSource | null): string {
  if (!draft) return 'Use this outline';
  const name = draft === 'previous' ? 'Previous' : 'System';
  return draft === current ? `Rebuild ${name} outline` : `Use ${name} outline`;
}

export interface SelectOutlineModalProps {
  cycleId: string;
  /** The source the cycle is built from now; null when nobody has picked yet. */
  current: OutlineSource | null;
  /** How many sections the cycle has now, for the "replaces N sections" note. */
  currentCount: number;
  /** The uploaded report's contents page: chapters for Previous, and whether it exists. */
  previousDetail: ReportOutlineDetail | null | undefined;
  onClose: () => void;
  onUse: (source: OutlineSource) => void;
}

export default function SelectOutlineModal({
  cycleId,
  current,
  currentCount,
  previousDetail,
  onClose,
  onUse,
}: SelectOutlineModalProps) {
  const previousAvailable = hasPreviousOutline(previousDetail);
  const [draft, setDraft] = useState<OutlineSource | null>(current);
  const [previews, setPreviews] = useState<Record<OutlineSource, PreviewState>>({
    previous: EMPTY_PREVIEW,
    system: EMPTY_PREVIEW,
  });
  const [reload, setReload] = useState(0);

  // Load both lists when the popup opens, so each card can show its section count
  // and switching between them is instant.
  useEffect(() => {
    let cancelled = false;
    const sources: OutlineSource[] = previousAvailable ? ['previous', 'system'] : ['system'];
    for (const source of sources) {
      setPreviews((p) => ({ ...p, [source]: EMPTY_PREVIEW }));
      sarCycles
        .outlinePreview(cycleId, source)
        .then((res) => {
          if (cancelled) return;
          setPreviews((p) => ({ ...p, [source]: { loading: false, error: '', sections: res.sections ?? [] } }));
        })
        .catch((e) => {
          if (cancelled) return;
          const message = e instanceof Error ? e.message : 'Could not load the sections.';
          setPreviews((p) => ({ ...p, [source]: { loading: false, error: message, sections: [] } }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [cycleId, previousAvailable, reload]);

  // Esc closes. Focus goes back to whatever opened the popup when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const firstCardRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    firstCardRef.current?.focus();
  }, []);

  const draftPreview = draft ? previews[draft] : null;
  const draftCount = draftPreview && !draftPreview.loading ? draftPreview.sections.length : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-outline-title"
        style={{ width: 720 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px 6px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div id="select-outline-title" style={{ fontSize: 16, fontWeight: 800, color: INK }}>
              Select outline
            </div>
            <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>
              Choose where this report&apos;s sections come from.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 28, height: 28, borderRadius: '50%', border: '1.5px solid #E2E4F0', background: '#fff', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div
          role="radiogroup"
          aria-label="Outline"
          style={{ padding: '14px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}
        >
          {OPTIONS.map((option, i) => (
            <OptionCard
              key={option.key}
              buttonRef={i === 0 ? firstCardRef : undefined}
              name={option.name}
              description={
                option.key === 'previous' && !previousAvailable
                  ? "No contents page was found in this company's uploaded annual report."
                  : option.description
              }
              icon={option.icon}
              meta={cardMeta(option.key, previousAvailable, previews[option.key], previousDetail)}
              selected={draft === option.key}
              inUse={current === option.key}
              disabled={option.key === 'previous' && !previousAvailable}
              onSelect={() => setDraft(option.key)}
            />
          ))}
        </div>

        <PreviewList
          source={draft}
          preview={draftPreview}
          previousDetail={previousDetail}
          onRetry={() => setReload((n) => n + 1)}
        />

        {current && draft && (
          <div
            style={{ margin: '0 24px', background: '#FFF6E5', color: '#B45309', borderRadius: 10, padding: '10px 12px', fontSize: 12, lineHeight: 1.5 }}
          >
            {draft === current
              ? `This rebuilds the section list from ${draft === 'previous' ? 'Previous' : 'System'}. Use it if sections were added since.`
              : `This replaces the current ${currentCount} sections${draftCount !== null ? ` with ${draftCount}` : ''}. If any section already has work on it, the switch is refused and nothing changes.`}
          </div>
        )}

        <div style={{ padding: '16px 24px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn bs" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn bp" type="button" disabled={!draft} onClick={() => draft && onUse(draft)}>
            {useButtonLabel(draft, current)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** The small grey line under a card's description: its section count. */
function cardMeta(
  source: OutlineSource,
  previousAvailable: boolean,
  preview: PreviewState,
  previousDetail: ReportOutlineDetail | null | undefined,
): string {
  if (source === 'previous' && !previousAvailable) return 'Not available';
  if (preview.loading) return 'Counting sections…';
  if (preview.error) return 'Sections could not be loaded';
  const count = `${preview.sections.length} sections`;
  if (source !== 'previous') return count;
  const chapters = groupByChapter(preview.sections, previousDetail).filter((g) => g.title !== null).length;
  return chapters > 0 ? `${count} · ${chapters} groups` : count;
}

function OptionCard({
  buttonRef,
  name,
  description,
  icon,
  meta,
  selected,
  inUse,
  disabled,
  onSelect,
}: {
  buttonRef?: React.Ref<HTMLButtonElement>;
  name: string;
  description: string;
  icon: string;
  meta: string;
  selected: boolean;
  inUse: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const card: CSSProperties = {
    position: 'relative',
    textAlign: 'left',
    border: `2px solid ${selected ? ACCENT : LINE}`,
    background: selected ? ACCENT_SOFT : '#fff',
    boxShadow: selected ? `0 0 0 4px ${ACCENT_SOFT}` : undefined,
    borderRadius: 14,
    padding: 16,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    fontFamily: 'inherit',
    transition: 'border-color .15s, background .15s',
  };
  return (
    <button ref={buttonRef} type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect} style={card}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          aria-hidden="true"
          style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: selected ? '#fff' : '#FAFBFE', border: `1px solid ${LINE}`, color: ACCENT, fontSize: 16 }}
        >
          {icon}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `2px solid ${selected ? ACCENT : LINE}`,
            background: selected ? ACCENT : '#fff',
            color: '#fff',
            display: 'grid',
            placeItems: 'center',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {selected ? '✓' : ''}
        </span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>{name}</span>
      <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.45 }}>{description}</span>
      <span style={{ fontSize: 11, color: FAINT, fontFamily: MONO }}>{meta}</span>
      {inUse && (
        <span
          style={{ alignSelf: 'flex-start', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', color: '#15803D', background: '#E8F7EE', borderRadius: 999, padding: '3px 8px' }}
        >
          IN USE NOW
        </span>
      )}
    </button>
  );
}

/** Every section of the highlighted option, scrolling inside the popup. */
function PreviewList({
  source,
  preview,
  previousDetail,
  onRetry,
}: {
  source: OutlineSource | null;
  preview: PreviewState | null;
  previousDetail: ReportOutlineDetail | null | undefined;
  onRetry: () => void;
}) {
  const { isFolded, toggle } = useFoldedChapters();
  const box: CSSProperties = { margin: '0 24px 14px', border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden' };

  if (!source || !preview) {
    return (
      <div style={{ ...box, padding: '24px 14px', textAlign: 'center', fontSize: 12, color: FAINT }}>
        Pick an option above to see every section it contains.
      </div>
    );
  }
  if (preview.loading) {
    return (
      <div style={box}>
        <Spinner pad={24} />
      </div>
    );
  }
  if (preview.error) {
    return (
      <div role="alert" style={{ ...box, padding: '16px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: '#DC2626' }}>{preview.error}</span>
        <button className="btn bs bsm" type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  const groups = source === 'previous' ? groupByChapter(preview.sections, previousDetail) : [{ title: null, items: preview.sections }];
  const starts = firstNumbers(groups);
  const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', padding: '8px 14px', borderTop: '1px solid #F4F5FB', fontSize: 12 };

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: '#FAFBFE', borderBottom: `1px solid ${LINE}`, fontSize: 11.5 }}>
        <b style={{ color: INK }}>Sections in {source === 'previous' ? 'Previous' : 'System'}</b>
        <span style={{ color: FAINT }}>{preview.sections.length} sections</span>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {groups.map((group, gi) => (
          <div key={`${group.title ?? 'flat'}-${gi}`}>
            {group.title !== null && (
              <div style={{ position: 'sticky', top: 0, padding: '8px 14px', background: '#FAFBFE', borderTop: '1px solid #F4F5FB' }}>
                <ChapterToggle
                  title={group.title}
                  count={group.items.length}
                  folded={isFolded(group.title)}
                  onToggle={() => group.title !== null && toggle(group.title)}
                  style={{ fontSize: 10.5, letterSpacing: '.07em' }}
                />
              </div>
            )}
            {(group.title === null || !isFolded(group.title)) && group.items.map((s, i) => (
              <div key={s.section_code} style={{ ...row, paddingInlineStart: group.title !== null ? 26 : 14 }}>
                <span style={{ width: 26, flexShrink: 0, fontFamily: MONO, color: FAINT, fontSize: 11 }}>{starts[gi] + i}</span>
                <span style={{ flex: 1, minWidth: 0, color: INK }}>{s.title}</span>
                {source === 'system' && s.layer && <SectionLayerBadge layer={s.layer} />}
                <SectionModeBadge mode={s.mode} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
