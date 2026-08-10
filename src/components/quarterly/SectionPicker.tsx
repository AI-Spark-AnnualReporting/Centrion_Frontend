// One searchable list of every section a figure can go in.
//
// This replaced a two-step group → section pair of <select>s. With 53 sections the
// two-step version meant knowing which of ten groups a section lives in before you
// could look for it, on every row of a list that runs to a couple of hundred on a
// first upload. Typing three letters is the whole interaction now.
//
// Hand-rolled rather than shadcn's Command: ui/command.tsx exists in the repo but
// is imported by nothing, so adopting it here would be taking on an untested
// dependency for one control.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MetricSectionGroup } from '@/types/quarterly';

const ACCENT = '#4040C8';
const MUTED = '#6B7280';
const DARK = '#1F2340';

export interface FlatSection {
  section_code: string;
  title: string;
  group: string;
}

// The grouped payload flattened once, so filtering is a single pass over an array
// rather than a nested walk per keystroke.
export function flattenSections(groups: MetricSectionGroup[]): FlatSection[] {
  return groups.flatMap((g) =>
    g.sections.map((s) => ({ section_code: s.section_code, title: s.title, group: g.group })),
  );
}

export function SectionPicker({
  sections,
  value,
  onChange,
  ariaLabel,
  invalid,
}: {
  sections: FlatSection[];
  value: string;
  onChange: (code: string) => void;
  ariaLabel: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Flip upward when there is no room below. No portal — a portal would escape the
  // scrolling body this sits in and the list would detach from its row on scroll.
  const [up, setUp] = useState(false);

  const selected = useMemo(
    () => sections.find((s) => s.section_code === value) ?? null,
    [sections, value],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    // Title, group AND code: users search by what they see, but a code is what
    // support tickets quote.
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.group.toLowerCase().includes(q) ||
        s.section_code.toLowerCase().includes(q),
    );
  }, [sections, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    // mousedown, not click: a click listener fires after the input has already
    // blurred and re-rendered, which swallows the first click on another row.
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    // Feature-tested: scrollIntoView is absent in jsdom, and keyboard navigation
    // failing to scroll is a far smaller problem than the whole picker throwing.
    if (typeof el?.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    const box = wrapRef.current?.getBoundingClientRect();
    setUp(!!box && window.innerHeight - box.bottom < 240);
    setOpen(true);
    setActive(0);
  };

  const choose = (s: FlatSection) => {
    onChange(s.section_code);
    setOpen(false);
    setQuery('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return Math.max(0, Math.min(matches.length - 1, next));
      });
    } else if (e.key === 'Enter') {
      if (open && matches[active]) {
        e.preventDefault();
        choose(matches[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        className="inp"
        // The chosen title shows when closed; typing replaces it while open, so the
        // field never looks empty on a row that is actually filled in.
        value={open ? query : (selected?.title ?? '')}
        placeholder={selected ? selected.title : 'Search sections…'}
        onFocus={openList}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) openList();
        }}
        onKeyDown={onKey}
        style={{
          width: '100%',
          fontSize: 12.5,
          borderColor: invalid ? '#F0A9A9' : undefined,
          background: invalid ? '#FFF7F7' : undefined,
        }}
      />
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            zIndex: 40,
            left: 0,
            right: 0,
            [up ? 'bottom' : 'top']: 'calc(100% + 4px)',
            maxHeight: 230,
            overflowY: 'auto',
            margin: 0,
            padding: 4,
            listStyle: 'none',
            background: '#fff',
            border: '1px solid #E5E7EF',
            borderRadius: 10,
            boxShadow: '0 12px 32px rgba(20,22,40,.16)',
          }}
        >
          {matches.length === 0 && (
            <li style={{ padding: '10px 10px', fontSize: 12, color: MUTED }}>
              No section matches “{query}”.
            </li>
          )}
          {matches.map((s, i) => (
            <li
              key={s.section_code}
              role="option"
              aria-selected={s.section_code === value}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                // Down, not click: click lands after blur has already closed us.
                e.preventDefault();
                choose(s);
              }}
              style={{
                padding: '7px 9px',
                borderRadius: 7,
                cursor: 'pointer',
                background: i === active ? 'rgba(64,64,200,.08)' : 'transparent',
              }}
            >
              <div style={{ fontSize: 12.5, color: DARK, fontWeight: s.section_code === value ? 700 : 500 }}>
                {s.title}
              </div>
              <div style={{ fontSize: 10.5, color: i === active ? ACCENT : '#9BA3C4' }}>{s.group}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
