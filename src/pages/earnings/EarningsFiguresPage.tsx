// Step 3 — Figures.
//
// A user-metrics quarterly report is built from the company's own workbook, so
// its lines carry the workbook's labels and nothing canonical. There is no
// registry to match them against, and 933 of them is far too many to read.
//
// So the user says what they want in a section, in their own words, and the model
// is asked FOR THAT SECTION with those words in the call. Nothing runs until they
// ask — a section they never touch stays empty and costs nothing.
//
// The figures themselves render as a statement extract rather than a list: the
// form these numbers take in the document they came from. See FigureLedger.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { earnings, ApiError } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { EarningsFigureSection, EarningsSourceLine } from '@/types/earnings';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { FigureChecklist } from '@/components/earnings/FigureChecklist';
import { FigureDialog } from '@/components/earnings/FigureDialog';
import { FigureLedger } from '@/components/earnings/FigureLedger';
import { FiguresRail } from '@/components/earnings/FiguresRail';
import { SectionBrief } from '@/components/earnings/SectionBrief';
import { FigureSearchState, FigureSearchSweep } from '@/components/earnings/FigureSearchState';
import { INK, MUTED, FAINT, ACCENT, DANGER, BORDER_SOFT } from '@/components/earnings/tokens';
import { usePipelinePoll } from '@/hooks/use-pipeline-poll';
import AiLoadingScreen from '@/pages/onboarding/AiLoadingScreen';
import { GeneratingScreen } from '@/components/reports/GeneratingScreen';
import { computeProgress } from '@/components/reports/QuarterlyGeneratingScreen';

const PRODUCE_MILESTONES = [
  'Composing narrative sections',
  'Filling the report tables',
  'Applying your tone and voice',
  'Checking every number against your figures',
];
const PRODUCE_TIPS = [
  'Every number is read from the figures you chose — nothing is invented.',
  'A section with no figures is left out rather than padded.',
];

export default function EarningsFiguresPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();

  const [sections, setSections] = useState<EarningsFigureSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<Record<string, string>>({});
  // Which sections just landed, so the ledger staggers in once and not on every
  // unrelated re-render.
  const [justLanded, setJustLanded] = useState<Record<string, boolean>>({});

  // The report's own line labels, used as the material for the reading state.
  const [scanLabels, setScanLabels] = useState<string[]>([]);
  const [lineCount, setLineCount] = useState(0);

  const [activeCode, setActiveCode] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const [picking, setPicking] = useState<EarningsFigureSection | null>(null);
  const [pickLines, setPickLines] = useState<EarningsSourceLine[] | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  const [produceRun, setProduceRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [continueError, setContinueError] = useState<string | null>(null);
  const { state: producePoll, restart: restartProduce } = usePipelinePoll(
    produceRun?.run_id ?? null,
    produceRun?.poll_url ?? null,
  );

  const load = useCallback(async () => {
    if (!reportId) return;
    try {
      const res = await earnings.getEarningsFigureSections(reportId);
      setSections(res.sections);
      setPrompts(Object.fromEntries(res.sections.map((s) => [s.section_code, s.prompt ?? ''])));
      setActiveCode((prev) => prev ?? res.sections[0]?.section_code ?? null);
      setLoadError(null);
    } catch (e) {
      setLoadError(
        e instanceof ApiError ? e.message : "Couldn't load this report's sections. Try reloading.",
      );
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fetched once, quietly, purely so the reading state can stream real labels
  // rather than a generic busy string. Failure costs nothing visible.
  useEffect(() => {
    if (!reportId) return;
    let alive = true;
    earnings
      .getEarningsSourceLines(reportId)
      .then((res) => {
        if (!alive) return;
        setLineCount(res.lines.length);
        setScanLabels(res.lines.map((l) => l.display_label).filter(Boolean));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [reportId]);

  // Which section the reader is on, for the rail. Purely an enhancement — where
  // IntersectionObserver is missing (jsdom, older browsers) the rail still works,
  // it just stops following the scroll.
  useEffect(() => {
    if (!sections?.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const code = seen?.target.getAttribute('data-code');
        if (code) setActiveCode(code);
      },
      { rootMargin: '-96px 0px -60% 0px' },
    );
    Object.values(cardRefs.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [sections]);

  const replaceSection = (code: string, figures: EarningsFigureSection['figures']) =>
    setSections((prev) =>
      (prev ?? []).map((s) =>
        s.section_code === code ? { ...s, figures, total: figures.length } : s,
      ),
    );

  const search = async (code: string) => {
    if (!reportId) return;
    setSearching(code);
    setSectionError((p) => ({ ...p, [code]: '' }));
    try {
      const res = await earnings.searchSectionFigures(reportId, code, prompts[code] ?? '');
      replaceSection(code, res.figures);
      setJustLanded((p) => ({ ...p, [code]: true }));
    } catch (e) {
      setSectionError((p) => ({
        ...p,
        [code]:
          e instanceof ApiError
            ? e.message
            : "That search didn't reach the server. Check your connection and try again.",
      }));
    } finally {
      setSearching(null);
    }
  };

  const removeFigure = async (section: EarningsFigureSection, figureId: string) => {
    if (!reportId) return;
    const before = section.figures;
    const keep = before.filter((f) => f.id !== figureId);
    replaceSection(section.section_code, keep);
    setJustLanded((p) => ({ ...p, [section.section_code]: false }));
    try {
      const res = await earnings.setSectionFigures(
        reportId,
        section.section_code,
        keep.map((f) => f.id),
      );
      replaceSection(section.section_code, res.figures);
    } catch {
      replaceSection(section.section_code, before); // put it back rather than lie
    }
  };

  const openPicker = async (section: EarningsFigureSection) => {
    if (!reportId) return;
    setPicking(section);
    setPickLines(null);
    try {
      const res = await earnings.getEarningsSourceLines(reportId, section.section_code);
      setPickLines(res.lines);
    } catch {
      setPickLines([]);
    }
  };

  const savePicked = async (lineIds: string[]) => {
    if (!reportId || !picking) return;
    setPickBusy(true);
    try {
      const res = await earnings.setSectionFigures(reportId, picking.section_code, lineIds);
      replaceSection(picking.section_code, res.figures);
      setJustLanded((p) => ({ ...p, [picking.section_code]: false }));
      setPicking(null);
    } finally {
      setPickBusy(false);
    }
  };

  const handleContinue = async () => {
    if (!reportId) return;
    setContinueError(null);
    try {
      const handle = await earnings.produceEarningsReport(reportId);
      setProduceRun({ run_id: handle.run_id, poll_url: handle.poll_url });
    } catch (e) {
      setContinueError(
        e instanceof ApiError ? e.message : "Couldn't start generating. Try again in a moment.",
      );
    }
  };

  const jumpTo = (code: string) => {
    setActiveCode(code);
    cardRefs.current[code]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const emptyCount = useMemo(
    () => (sections ?? []).filter((s) => s.total === 0).length,
    [sections],
  );

  // Producing takes over the page, the same handoff the outline used to own.
  if (produceRun) {
    const phase = producePoll.phase === 'idle' ? 'running' : producePoll.phase;
    if (phase === 'failed' || phase === 'timeout') {
      return (
        <GeneratingScreen
          phase={phase}
          errorMessage={phase === 'failed' ? producePoll.run?.error_message ?? null : null}
          onCancel={() => setProduceRun(null)}
          onRetry={() => {
            setProduceRun(null);
            void handleContinue();
          }}
          onKeepWaiting={restartProduce}
        />
      );
    }
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 1400 }}>
        <AiLoadingScreen
          title="Composing your report"
          subtitle="Writing each section from the figures you chose."
          milestones={PRODUCE_MILESTONES}
          tips={PRODUCE_TIPS}
          controlledProgress={computeProgress(
            phase === 'completed' ? 'completed' : 'running',
            producePoll.nodes,
          )}
          done={phase === 'completed'}
          onDone={() => navigate(`/earnings/${reportId}/preview`)}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 22px 44px' }}>
      <EarningsStepper activeStep={3} reportId={reportId} />

      <header style={{ margin: '20px 0 18px', maxWidth: 640 }}>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-.3px' }}>
          Choose your figures
        </h1>
        <p style={{ fontSize: 13, color: MUTED, margin: '5px 0 0', lineHeight: 1.55 }}>
          Tell each section what belongs in it, in your own words, and search once. We
          read your report's own lines and bring back the ones that match — then you add
          or remove any of them by hand. A line only goes to one section, unless you put
          it in another yourself.
        </p>
      </header>

      {loadError && (
        <div
          role="alert"
          style={{ color: DANGER, fontSize: 13, fontWeight: 700, marginBottom: 14 }}
        >
          {loadError}
        </div>
      )}

      {sections === null && !loadError ? (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 18,
            alignItems: 'start',
          }}
          className="fig-grid"
        >
          <div className="fig-rail">
            <FiguresRail
              sections={sections ?? []}
              activeCode={activeCode}
              onSelect={jumpTo}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {(sections ?? []).map((s) => {
              const isSearching = searching === s.section_code;
              const has = s.total > 0;
              // The brief is an input while the section is empty and a record of
              // what was asked for once it is not. One search per section.
              const collapsed = has && !isSearching;
              return (
                <section
                  key={s.section_code}
                  data-code={s.section_code}
                  ref={(el) => {
                    cardRefs.current[s.section_code] = el;
                  }}
                  className="card"
                  style={{
                    padding: '15px 18px 16px',
                    position: 'relative',
                    overflow: 'hidden',
                    scrollMarginTop: 14,
                  }}
                >
                  {isSearching && <FigureSearchSweep />}

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 10,
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: INK,
                        margin: 0,
                        letterSpacing: '-.1px',
                      }}
                    >
                      {s.title}
                    </h2>
                    {has ? (
                      <span
                        className={justLanded[s.section_code] ? 'analysis-pop' : undefined}
                        style={{
                          flexShrink: 0,
                          padding: '2px 9px',
                          borderRadius: 20,
                          background: '#EEEEFF',
                          color: ACCENT,
                          fontFamily: "'DM Mono', monospace",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {s.total}
                      </span>
                    ) : (
                      <span style={{ flexShrink: 0, fontSize: 11.5, color: FAINT }}>
                        Tell us what belongs here
                      </span>
                    )}
                  </div>

                  <SectionBrief
                    sectionTitle={s.title}
                    value={prompts[s.section_code] ?? ''}
                    onChange={(v) => setPrompts((p) => ({ ...p, [s.section_code]: v }))}
                    onSearch={() => void search(s.section_code)}
                    searching={isSearching}
                    collapsed={collapsed}
                  />

                  {isSearching && (
                    <FigureSearchState lineCount={lineCount} labels={scanLabels} />
                  )}

                  {sectionError[s.section_code] && (
                    <div
                      role="alert"
                      style={{
                        fontSize: 12,
                        color: DANGER,
                        fontWeight: 700,
                        marginTop: 10,
                      }}
                    >
                      {sectionError[s.section_code]}
                    </div>
                  )}

                  {!isSearching && (
                    <div>
                      {justLanded[s.section_code] && has && (
                        <div className="analysis-rule" style={{ marginTop: 14, maxWidth: 64 }} />
                      )}
                      <FigureLedger
                        figures={s.figures}
                        onRemove={(id) => void removeFigure(s, id)}
                        animate={!!justLanded[s.section_code]}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn bs bsm"
                      onClick={() => void openPicker(s)}
                    >
                      Add figure
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 14,
          marginTop: 20,
          paddingTop: 16,
          borderTop: `1px solid ${BORDER_SOFT}`,
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          className="btn bs"
          onClick={() => navigate(`/earnings/${reportId}/outline`)}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {emptyCount > 0 && (
            <span style={{ fontSize: 12, color: MUTED }}>
              {emptyCount} {emptyCount === 1 ? 'section has' : 'sections have'} no figures and
              will be left out
            </span>
          )}
          {continueError && (
            <span role="alert" style={{ fontSize: 12, color: DANGER, fontWeight: 700 }}>
              {continueError}
            </span>
          )}
          <button type="button" className="btn bp" onClick={() => void handleContinue()}>
            Continue →
          </button>
        </div>
      </div>

      {picking && (
        <FigureDialog title={`Add a figure to ${picking.title}`} onClose={() => setPicking(null)}>
          {pickLines === null ? (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <Spinner />
            </div>
          ) : (
            <FigureChecklist
              lines={pickLines}
              sectionTitle={picking.title}
              busy={pickBusy}
              onSave={savePicked}
            />
          )}
        </FigureDialog>
      )}
    </div>
  );
}
