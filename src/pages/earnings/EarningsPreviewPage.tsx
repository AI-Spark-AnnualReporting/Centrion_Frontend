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
import type { EarningsFigureSection, EarningsSourceLine, EarningsProducedSection } from '@/types/earnings';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { FigureChecklist } from '@/components/earnings/FigureChecklist';
import { FigureDialog } from '@/components/earnings/FigureDialog';
import { FigureLedger } from '@/components/earnings/FigureLedger';
import { PreviewRail, COVER_CODE } from '@/components/earnings/PreviewRail';
import type { RailItem } from '@/components/earnings/PreviewRail';
import { NarrativePane } from '@/components/earnings/NarrativePane';
import { EditableProse } from '@/components/earnings/EditableProse';
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
  // Reopened briefs — a section with figures quotes its brief until you ask again.
  const [editingBrief, setEditingBrief] = useState<Record<string, boolean>>({});
  // What the last ask actually added, so "it did nothing" is never the impression.
  const [searchNote, setSearchNote] = useState<Record<string, string>>({});

  // The report's own line labels, used as the material for the reading state.
  const [scanLabels, setScanLabels] = useState<string[]>([]);
  const [lineCount, setLineCount] = useState(0);

  const [activeCode, setActiveCode] = useState<string | null>(null);
  // The content column is its own scrollport now, so switching sections has to put
  // it back to the top -- otherwise the next section opens halfway down.
  const paneRef = useRef<HTMLDivElement | null>(null);

  const [picking, setPicking] = useState<EarningsFigureSection | null>(null);
  const [pickLines, setPickLines] = useState<EarningsSourceLine[] | null>(null);
  const [pickBusy, setPickBusy] = useState(false);

  // The narrative half of the report. The figure-free ones were produced while
  // the user watched the loading screen after the Outline, so most of these
  // arrive already written.
  const [produced, setProduced] = useState<EarningsProducedSection[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [runErrors, setRunErrors] = useState<Record<string, string>>({});

  const [produceRun, setProduceRun] = useState<{ run_id: string; poll_url: string } | null>(null);
  const [continueError, setContinueError] = useState<string | null>(null);
  const { state: producePoll, restart: restartProduce } = usePipelinePoll(
    produceRun?.run_id ?? null,
    produceRun?.poll_url ?? null,
  );

  const load = useCallback(async () => {
    if (!reportId) return;
    try {
      const [res, prod] = await Promise.all([
        earnings.getEarningsFigureSections(reportId),
        // Never fatal on its own: a report whose narrative sections fail to load
        // is still a report whose figures can be chosen.
        earnings.getEarningsSections(reportId, true).catch(() => ({ sections: [] })),
      ]);
      setSections(res.sections);
      setProduced(prod.sections ?? []);
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
    setSearchNote((p) => ({ ...p, [code]: '' }));
    try {
      const before = sections?.find((s) => s.section_code === code)?.total ?? 0;
      const res = await earnings.searchSectionFigures(reportId, code, prompts[code] ?? '');
      replaceSection(code, res.figures);
      setJustLanded((p) => ({ ...p, [code]: true }));
      setEditingBrief((p) => ({ ...p, [code]: false }));
      // Asking again adds, so nothing new looks identical to nothing happening.
      setSearchNote((p) => ({
        ...p,
        [code]: res.found
          ? before
            ? `Added ${res.found} more.`
            : ''
          : res.note ??
            (before
              ? 'Nothing new for those words — everything else is already in a section.'
              : 'No lines matched. Try describing the figures differently.'),
      }));
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

  // Every section, financial and narrative, in report order. The rail reads this;
  // the pane below renders whichever one is active.
  const narrative = useMemo(
    () =>
      produced.filter(
        (p) =>
          p.mode !== 'table' &&
          p.mode !== 'kpi' &&
          p.section_code !== 's01_cover' &&
          p.section_code !== 's02_toc',
      ),
    [produced],
  );

  const railItems: RailItem[] = useMemo(() => {
    const fin: RailItem[] = (sections ?? []).map((s) => ({
      code: s.section_code,
      title: s.title,
      kind: 'financial',
      figures: s.total,
    }));
    const nar: RailItem[] = narrative.map((p) => ({
      code: p.section_code,
      title: p.title || p.section_code,
      kind: 'narrative',
      written: !!(p.content || '').trim(),
    }));
    return [...fin, ...nar];
  }, [sections, narrative]);

  // What a figure-grounded section is waiting on, named so the user can go and do
  // it rather than being told no.
  const emptySections = useMemo(
    () =>
      (sections ?? [])
        .filter((s) => s.total === 0)
        .map((s) => ({ section_code: s.section_code, title: s.title })),
    [sections],
  );

  const activeNarrative = useMemo(
    () => narrative.find((p) => p.section_code === activeCode) ?? null,
    [narrative, activeCode],
  );

  // Editing a produced section in place. Optimistic, because it is the user's own
  // words going back on their own screen.
  const saveNarrative = async (code: string, content: string) => {
    if (!reportId) return;
    setProduced((prev) =>
      prev.map((p) => (p.section_code === code ? { ...p, content } : p)),
    );
    try {
      await earnings.patchEarningsSectionContent(reportId, code, { content });
    } catch (e) {
      setRunErrors((p) => ({
        ...p,
        [code]:
          e instanceof ApiError ? e.message : "That edit didn't save. Try again.",
      }));
    }
  };

  const runSection = async (code: string, regenerate: boolean) => {
    if (!reportId) return;
    setRunning(code);
    setRunErrors((p) => ({ ...p, [code]: '' }));
    try {
      const sec = await earnings.runEarningsSection(reportId, code, regenerate);
      setProduced((prev) =>
        prev.map((p) => (p.section_code === code ? { ...p, ...sec } : p)),
      );
      // A section can come back with no usable content -- the backend rejects
      // prose carrying a number that is not among the figures. That is not an
      // error to apologise for, it is a reason, so say it and leave Run there.
      if (!(sec.content || '').trim()) {
        setRunErrors((p) => ({
          ...p,
          [code]:
            (sec as { error?: string }).error ||
            'It came back empty. Adding figures to the sections above usually fixes it.',
        }));
      }
    } catch (e) {
      setRunErrors((p) => ({
        ...p,
        [code]:
          e instanceof ApiError
            ? e.message
            : "That didn't reach the server. Check your connection and try again.",
      }));
    } finally {
      setRunning(null);
    }
  };

  useEffect(() => {
    if (paneRef.current) paneRef.current.scrollTop = 0;
  }, [activeCode]);


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
          onDone={() => navigate(`/earnings/${reportId}/report`)}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <EarningsStepper activeStep={3} reportId={reportId} />

      <header style={{ padding: '22px 28px 16px', flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: 0, letterSpacing: '-.3px' }}>
          Report preview
        </h1>
        <p style={{ fontSize: 12, color: MUTED, margin: '4px 0 0' }}>
          Pick a section on the left. Tell the financial ones what belongs in them; read and
          edit the written ones.
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

      {sections === null ? (
        // A load that failed has already said so above; a spinner underneath it
        // would claim something is still coming.
        loadError ? null : (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Spinner />
          </div>
        )
      ) : sections.length === 0 ? (
        // Reachable only by unticking every section that carries figures. It is a
        // choice, not a fault, so it says what is true and offers the way back
        // rather than looking like a screen that failed to load.
        <div className="card" style={{ padding: '44px 28px', textAlign: 'center' }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>
            No sections to fill in
          </div>
          <p
            style={{
              fontSize: 13,
              color: MUTED,
              lineHeight: 1.6,
              margin: '8px auto 18px',
              maxWidth: 420,
            }}
          >
            Your report has no sections that carry figures. Add one on the Outline and
            it will appear here.
          </p>
          <button
            type="button"
            className="btn bp"
            onClick={() => navigate(`/earnings/${reportId}/outline`)}
          >
            Choose sections
          </button>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: '280px 1fr',
            gap: 16,
            padding: '0 28px 16px',
            alignItems: 'stretch',
          }}
        >
            <PreviewRail
              items={railItems}
              activeCode={activeCode}
              onSelect={setActiveCode}
              onAddSection={() => navigate(`/earnings/${reportId}/outline`)}
            />

          {/* Its own scrollport, so choosing a section never moves the rail or the
              footer. */}
          <div
            ref={paneRef}
            style={{
              minWidth: 0,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {activeCode === COVER_CODE && (
              // The rail always offers this row, so it must always render
              // something. It rendered nothing at all -- both section lookups
              // missed and the column came up blank.
              <section className="card" style={{ padding: '24px 28px' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0 }}>
                  Cover &amp; colours
                </h2>
                <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: '8px 0 18px', maxWidth: 520 }}>
                  The front page of the report and the colour it is printed in. Choose it
                  whenever you like — it changes nothing about the figures or the writing.
                </p>
                <button
                  type="button"
                  className="btn bp"
                  onClick={() => navigate(`/earnings/${reportId}/report`)}
                >
                  Choose cover &amp; colours →
                </button>
                <p style={{ fontSize: 11, color: FAINT, margin: '10px 0 0' }}>
                  Opens on the Report screen, where you can see it applied.
                </p>
              </section>
            )}

            {activeNarrative && (
              <section className="card" style={{ padding: '18px 22px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, color: INK, margin: 0 }}>
                    {activeNarrative.title || activeNarrative.section_code}
                  </h2>
                  <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase', color: FAINT }}>
                    {activeNarrative.source_type ?? 'Written'}
                  </span>
                </div>
                <NarrativePane
                  section={activeNarrative}
                  emptySections={emptySections}
                  running={running === activeNarrative.section_code}
                  runError={runErrors[activeNarrative.section_code] || null}
                  onRun={(regen) => void runSection(activeNarrative.section_code, regen)}
                  onJumpTo={setActiveCode}
                >
                  <EditableProse
                    section={activeNarrative}
                    coverTemplateKey={null}
                    locked={false}
                    onSave={(content) => saveNarrative(activeNarrative.section_code, content)}
                  />
                </NarrativePane>
              </section>
            )}

            {(sections ?? []).filter((s) => s.section_code === activeCode).map((s) => {
              const isSearching = searching === s.section_code;
              const has = s.total > 0;
              // The brief is an input while the section is empty and a record of
              // what was asked for once it is not. One search per section.
              const collapsed = has && !isSearching && !editingBrief[s.section_code];
              return (
                <section
                  key={s.section_code}
                  className="card"
                  style={{
                    padding: '15px 18px 16px',
                    position: 'relative',
                    overflow: 'hidden',
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
                    onExpand={() =>
                      setEditingBrief((p) => ({ ...p, [s.section_code]: true }))
                    }
                  />

                  {isSearching && (
                    <FigureSearchState lineCount={lineCount} labels={scanLabels} />
                  )}

                  {!isSearching && !sectionError[s.section_code]
                    && searchNote[s.section_code] && (
                    <div
                      style={{
                        fontSize: 11.5,
                        color: MUTED,
                        marginTop: 9,
                      }}
                    >
                      {searchNote[s.section_code]}
                    </div>
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
          flexShrink: 0,
          background: '#fff',
          borderTop: `1px solid ${BORDER_SOFT}`,
          padding: '12px 28px',
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
