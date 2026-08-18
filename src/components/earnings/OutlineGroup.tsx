import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import type { EarningsOutlineSection } from '@/types/earnings';
import { OutlineSectionCard } from './OutlineSectionCard';
import { MUTED } from './tokens';

// Drag wiring passed from the page for the reorderable "included" group. Absent
// for the read-only "available" group.
export interface OutlineDragHandlers {
  dragOver: (index: number) => (e: DragEvent) => void;
  drop: (index: number) => (e: DragEvent) => void;
  dragStart: (index: number) => (e: DragEvent) => void;
  dragEnd: () => void;
  gripKeyDown: (index: number) => (e: KeyboardEvent) => void;
}

// One outline group card: "Report sections" (included, reorderable) or
// "Available to add" (optional, not included). `startNumber` continues the row
// numbering across groups.
export function OutlineGroup({
  title,
  subtitle,
  sections,
  group,
  startNumber = 0,
  emptyText,
  onToggle,
  drag,
  renderFigures,
}: {
  title: string;
  subtitle?: string;
  sections: EarningsOutlineSection[];
  group: 'included' | 'available';
  startNumber?: number;
  emptyText?: string;
  onToggle: (code: string) => void;
  drag?: OutlineDragHandlers;
  // Supplied by the page for sections that carry figures. Returning null keeps
  // the row exactly as it was, so prose sections show no affordance at all.
  renderFigures?: (section: EarningsOutlineSection) => {
    open: boolean;
    onToggle: () => void;
    panel: ReactNode;
  } | null;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="ch">
        <span className="ct">{title}</span>
        {subtitle && (
          <span style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginLeft: 10 }}>
            {subtitle}
          </span>
        )}
      </div>
      <div className="cb" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.length === 0 ? (
          <div style={{ fontSize: 12.5, color: MUTED, padding: '6px 2px' }}>
            {emptyText ?? 'Nothing here.'}
          </div>
        ) : (
          sections.map((s, i) => {
            const figures = renderFigures?.(s) ?? null;
            return (
            <div
              key={s.section_code}
              onDragOver={drag ? drag.dragOver(i) : undefined}
              onDrop={drag ? drag.drop(i) : undefined}
            >
              <OutlineSectionCard
                section={s}
                number={startNumber + i + 1}
                group={group}
                onToggle={() => onToggle(s.section_code)}
                dragHandleProps={
                  drag
                    ? {
                        draggable: true,
                        onDragStart: drag.dragStart(i),
                        onDragEnd: drag.dragEnd,
                        onKeyDown: drag.gripKeyDown(i),
                      }
                    : undefined
                }
                figuresOpen={figures?.open}
                onToggleFigures={figures?.onToggle}
                figuresPanel={figures?.panel}
              />
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
