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
import { useRememberStep, reachedStepNumber } from './earnings-resume';
import { earnings, ApiError } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type { EarningsFigureSection, EarningsSourceLine, EarningsProducedSection } from '@/types/earnings';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { FigureChecklist } from '@/components/earnings/FigureChecklist';
import { FigureDialog } from '@/components/earnings/FigureDialog';
import { FigureLedger } from '@/components/earnings/FigureLedger';
import { ConsensusLedger } from '@/components/earnings/ConsensusLedger';
import SectionAnalysis, { ReadingBand } from '@/components/quarterly/SectionAnalysis';
import { PreviewRail, COVER_CODE } from '@/components/earnings/PreviewRail';
import type { RailItem } from '@/components/earnings/PreviewRail';
import { NarrativePane } from '@/components/earnings/NarrativePane';
import { PreviewSkeleton } from '@/components/earnings/PreviewSkeleton';
import { SectionRefineChat } from '@/components/quarterly/SectionRefineChat';
import { EditableProse } from '@/components/earnings/EditableProse';
import { SectionRenderer } from '@/components/earnings/SectionRenderer';
import { isNoDataPlaceholder, noDataMessage } from './preview-helpers';
import { CoverTemplatePicker } from '@/components/quarterly/CoverTemplatePicker';
import type { CoverTemplate, ColorPalette, BrandColors, CoverSelectionPayload } from '@/types/quarterly';
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
  // So reopening this report from the list comes back HERE, rather than to the
  // middle of the flow — see earnings-resume.
  useRememberStep(reportId, 'preview');
  // How far the REPORT has got, so the stepper does not grey out a step this
  // user has already been to — see earnings-resume.
  const reached = reachedStepNumber(reportId, 3);
  const navigate = useNavigate();

  const [sections, setSections] = useState<EarningsFigureSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [sectionError, setSectionError] = useState<Record<string, string>>({});
  // Which sections just landed, so the ledger staggers in once and not on every
  // unrelated re-render.
  // What the last ask actually added, so "it did nothing" is never the impression.

  // The report's own line labels, used as the material for the reading state.

  const [activeCode, setActiveCode] = useState<string | null>(null);
  // Which section the analyser is reading, so its table can dim and take the
  // band travelling down it.
  const [analysing, setAnalysing] = useState<string | null>(null);
  // The content column is its own scrollport now, so switching sections has to put
  // it back to the top -- otherwise the next section opens halfway down.
  const paneRef = useRef<HTMLDivElement | null>(null);

  // Expectations the user has typed but not yet committed, keyed section -> figure
  // -> value. They live here rather than going to the server as they are typed:
  // a consensus table gets a dozen forecasts entered and half of them changed on
  // the way, and none of it is meant until the user finalises the section. Held
  // in state rather than a ref so the count can be shown -- an unsaved number
  // that looks saved is the whole failure mode this replaces.
  const [unsaved, setUnsaved] = useState<Record<string, Record<string, number | null>>>({});

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

  // ── Cover design + brand color (mirrors the quarterly picker) ──
  const [coverTemplateKey, setCoverTemplateKey] = useState<string | null>(null);
  const [coverTemplates, setCoverTemplates] = useState<CoverTemplate[]>([]);
  const [palettes, setPalettes] = useState<ColorPalette[]>([]);
  const [brand, setBrand] = useState<BrandColors | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [coverApplying, setCoverApplying] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
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
      if ('cover_template_key' in prod) setCoverTemplateKey(prod.cover_template_key ?? null);
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
        setCoverError(err instanceof ApiError ? err.message : 'Could not save the cover selection.');
      } finally {
        setCoverApplying(false);
      }
    },
    [reportId],
  );


  // SectionAnalysis reads a produced section's content (to spot a table edited
  // after the analysis was written) and its stored analysis. The figures screen
  // carries neither, so it is stitched from the produced half.
  const analysisSection = (s: EarningsFigureSection) => {
    const p = produced.find((x) => x.section_code === s.section_code);
    return {
      section_code: s.section_code,
      title: s.title,
      content: p?.content ?? null,
      analysis: p?.analysis ?? null,
    } as never;
  };

  const replaceSection = (code: string, figures: EarningsFigureSection['figures']) =>
    setSections((prev) =>
      (prev ?? []).map((s) =>
        s.section_code === code ? { ...s, figures, total: figures.length } : s,
      ),
    );

  // A bookmark, not a lock -- it hides Edit and counts toward the footer tally.
  //
  // It is also the moment this section's typed expectations are written. One
  // request, one moment: the user says the section is done and everything they
  // entered goes in together. Optimistic on the flag, and if the write does not
  // land the flag goes back AND the typed numbers are kept pending, so pressing
  // it again sends them rather than having quietly dropped them.
  const setFinalised = async (code: string, finalised: boolean) => {
    if (!reportId) return;
    const pending = finalised ? unsaved[code] : undefined;
    const apply = (v: boolean) =>
      setSections((prev) =>
        (prev ?? []).map((x) => (x.section_code === code ? { ...x, finalised: v } : x)),
      );
    apply(finalised);
    setSectionError((p) => ({ ...p, [code]: '' }));
    try {
      await earnings.finaliseEarningsSectionFigures(
        reportId, code, finalised,
        pending && Object.keys(pending).length ? pending : undefined,
      );
      if (pending) setUnsaved((p) => ({ ...p, [code]: {} }));
    } catch (e) {
      apply(!finalised);
      setSectionError((p) => ({
        ...p,
        [code]: e instanceof ApiError
          ? `That didn't save — ${e.message}. Your figures are still here; try again.`
          : "That didn't save. Check your connection and try again — your figures are still here.",
      }));
    }
  };

  // Local only. Typing a forecast changes the table and nothing else -- the
  // verdict updates as you type, and the numbers go to the server in one write
  // when the section is finalised. Nothing here can fail, so nothing here can
  // take a number back off the screen after showing it.
  const setExpected = (
    section: EarningsFigureSection,
    figureId: string,
    expected: number | null,
  ) => {
    replaceSection(
      section.section_code,
      section.figures.map((f) =>
        f.id === figureId ? { ...f, expected_value: expected } : f,
      ),
    );
    // Exactly what the user touched, so finalising writes their edits and
    // leaves every other row alone.
    setUnsaved((p) => ({
      ...p,
      [section.section_code]: { ...(p[section.section_code] ?? {}), [figureId]: expected },
    }));
  };

  const removeFigure = async (section: EarningsFigureSection, figureId: string) => {
    if (!reportId) return;
    const before = section.figures;
    const keep = before.filter((f) => f.id !== figureId);
    replaceSection(section.section_code, keep);
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

  // Figures are filed here, but the section never became content -- so it will
  // not appear on the Report screen or in the exported file. Read from `produced`,
  // which this page already loads; no extra request.
  const isStalled = useCallback(
    (code: string, total: number) => {
      if (total <= 0) return false;   // nothing filed yet is the ordinary not-done
      const p = produced.find((x) => x.section_code === code);
      if (!p) return true;
      if (p.status === 'needs_input' || p.status === 'empty') return true;
      return !(p.content || '').trim();
    },
    [produced],
  );

  const railItems: RailItem[] = useMemo(() => {
    const fin: RailItem[] = (sections ?? []).map((s) => ({
      code: s.section_code,
      title: s.title,
      kind: 'financial',
      figures: s.total,
      stalled: isStalled(s.section_code, s.total),
    }));
    const nar: RailItem[] = narrative.map((p) => ({
      code: p.section_code,
      title: p.title || p.section_code,
      kind: 'narrative',
      // Three states, not two: written, un-run, and ran-and-found-nothing. The
      // last used to be folded into un-run, which is why a finished section sat
      // here saying "not run" with a Run button that changed nothing.
      written: !!(p.content || '').trim() && !isNoDataPlaceholder(p.content),
      noData: noDataMessage(p) !== null,
    }));
    return [...fin, ...nar];
  }, [sections, narrative, isStalled]);

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

  // Have the model re-word a section the user is looking at. Deliberately does
  // not catch: SectionRefineChat shows the rejection in its own banner and keeps
  // what the user typed, which is more useful than a message in the run-error row.
  //
  // Merges only the three fields the response actually carries. Spreading the
  // whole thing is what makes Regenerate blank the badge and the title -- the
  // narrow endpoint has no mode/source_type to give, so the normaliser would
  // invent them.
  const refineNarrative = async (code: string, instruction: string) => {
    if (!reportId) return;
    const res = await earnings.refineEarningsSection(reportId, code, instruction);
    setProduced((prev) =>
      prev.map((p) =>
        p.section_code === code
          ? {
              ...p,
              content: res.content,
              status: res.status as typeof p.status,
              grounding_flag: res.grounding_violations[0] ?? p.grounding_flag,
            }
          : p,
      ),
    );
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
      }}
    >
      <EarningsStepper activeStep={3} reportId={reportId} reachedStep={reached} />

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
        // A load that failed has already said so above; a skeleton underneath it
        // would claim something is still coming.
        loadError ? null : <PreviewSkeleton />
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
            {activeCode === COVER_CODE && (() => {
              const coverSection = produced.find((p) => p.section_code === 's01_cover') ?? null;
              return (
                <section
                  className="card"
                  style={{
                    padding: '24px 28px',
                    ['--brand-primary' as string]: brand?.primary ?? '#4040C8',
                    ['--brand-secondary' as string]: brand?.secondary ?? '#4040C8',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0 }}>
                      Cover &amp; colours
                    </h2>
                    <button type="button" className="btn bp bsm" onClick={() => setPickerOpen(true)}>
                      Choose cover design &amp; colors
                    </button>
                  </div>
                  {coverSection ? (
                    <SectionRenderer section={coverSection} coverTemplateKey={coverTemplateKey} />
                  ) : (
                    <p style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.6, margin: 0, maxWidth: 520 }}>
                      The cover hasn't been produced yet — it will show here once the report is
                      generated. You can still pick a design and colours now.
                    </p>
                  )}
                </section>
              );
            })()}

            {activeNarrative && (() => {
              // The "nothing found" sentence is no longer blanked here —
              // NarrativePane states it as the finding it is, and the Report
              // screen still drops the section entirely (isHiddenWhenOmitted),
              // so it never reaches a published release. Blanking it on Preview
              // made a finished section read as un-run.
              //
              // The exported PDF/DOCX still prints the sentence: export renders
              // server-side from the same `content` field, out of reach from
              // here — see .claude/specs/Earnings/NoDataPlaceholder(Backend).md.
              const displayNarrative = activeNarrative;
              return (
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
                    section={displayNarrative}
                    emptySections={emptySections}
                    running={running === activeNarrative.section_code}
                    runError={runErrors[activeNarrative.section_code] || null}
                    onRun={(regen) => void runSection(activeNarrative.section_code, regen)}
                    onJumpTo={setActiveCode}
                  >
                    <EditableProse
                      section={displayNarrative}
                      coverTemplateKey={null}
                      locked={false}
                      onSave={(content) => saveNarrative(activeNarrative.section_code, content)}
                    />
                  </NarrativePane>
                  {/* Only over prose that exists. A section still showing "Run this
                      section" has nothing to refine, and offering the box there
                      would read as a second way to write it. Gated on
                      displayNarrative, not activeNarrative, so a no-data
                      placeholder counts as empty here exactly as it does above. */}
                  {!!(displayNarrative.content || '').trim() && (
                    <SectionRefineChat
                      key={activeNarrative.section_code}
                      onSend={(instruction) =>
                        refineNarrative(activeNarrative.section_code, instruction)
                      }
                    />
                  )}
                </section>
              );
            })()}

            {(sections ?? []).filter((s) => s.section_code === activeCode).map((s) => {
              const finalised = !!s.finalised;
              const pendingCount = Object.keys(unsaved[s.section_code] ?? {}).length;
              return (
                <section
                  key={s.section_code}
                  className="card"
                  style={{ padding: '24px 28px' }}
                >

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
                    {s.total > 0 ? (
                      <span
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

                  {isStalled(s.section_code, s.total) && (
                    // The figures are here and the section still is not in the
                    // report. Said plainly, because the alternative is what
                    // happened: a green tick on the left, thirty-one rows on the
                    // right, and nothing in the exported file.
                    <div
                      role="status"
                      style={{
                        marginBottom: 14,
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: 'rgba(245,158,11,.08)',
                        border: '1px solid rgba(245,158,11,.22)',
                        fontSize: 12.5,
                        color: '#B45309',
                        lineHeight: 1.55,
                      }}
                    >
                      These figures have not been built into the report yet, so this
                      section will not appear in it. Press Continue to build it.
                    </div>
                  )}

                  {(prompts[s.section_code] || '').trim() && (
                    // What was asked for, on the Outline. Read-only here: this
                    // screen curates what came back, it does not re-ask.
                    <div
                      style={{
                        fontSize: 12,
                        color: MUTED,
                        fontStyle: 'italic',
                        marginTop: 2,
                      }}
                    >
                      “{prompts[s.section_code]}”
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

                  {/* The band travels over the table while the analyser reads it,
                      so it wraps the content and sits OUTSIDE any scroller of the
                      table's own, which would clip a vertically-moving band. */}
                  <div
                    style={{
                      position: 'relative',
                      overflow: analysing === s.section_code ? 'hidden' : undefined,
                    }}
                  >
                    <div
                      className={
                        analysing === s.section_code ? 'analysis-reading' : undefined
                      }
                    >
                      {s.section_code === 's12_consensus' ? (
                        // The beat/miss section: what landed against what was
                        // expected. Its own table because it asks a question of
                        // every row rather than just reporting one.
                        <ConsensusLedger
                          figures={s.figures}
                          onSetExpected={(id, v) => setExpected(s, id, v)}
                          onRemove={(id) => void removeFigure(s, id)}
                        />
                      ) : (
                        <FigureLedger
                          figures={s.figures}
                          onRemove={(id) => void removeFigure(s, id)}
                          animate={false}
                        />
                      )}
                    </div>
                    {analysing === s.section_code && <ReadingBand />}
                  </div>

                  {/* Two actions, and they are different things. Edit opens the
                      full tick-list -- which is what "Add figure" always actually
                      did. Finalise is a bookmark: it hides Edit and counts toward
                      the tally, and locks nothing. */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: 9,
                      marginTop: 16,
                    }}
                  >
                    {finalised ? (
                      <>
                        {/* Where a line of green text saying "finalised" used to
                            sit. Once the figures are settled the useful next thing
                            is the commentary that goes under them. */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <SectionAnalysis
                            // Remounts on every rail switch, deliberately: it is
                            // what stops one section's in-flight request and open
                            // dialog leaking onto the next.
                            key={s.section_code}
                            companyId=""
                            reportId={reportId ?? ''}
                            section={analysisSection(s)}
                            analyse={(code, opts) =>
                              earnings.analyseEarningsSection(
                                reportId ?? '', code, opts) as Promise<never>
                            }
                            saveAnalysis={(code, text) =>
                              earnings.saveEarningsSectionAnalysis(
                                reportId ?? '', code, text) as Promise<never>
                            }
                            onBusyChange={(busy) =>
                              setAnalysing(busy ? s.section_code : null)
                            }
                            // A remount re-seeds from section.analysis, so a fresh
                            // result has to land HERE. Without this, analysing a
                            // section and switching away threw the analysis away
                            // until a reload -- it was written and stored, and the
                            // screen just stopped knowing about it.
                            onAnalysis={(a) =>
                              setProduced((prev) =>
                                prev.some((x) => x.section_code === s.section_code)
                                  ? prev.map((x) =>
                                      x.section_code === s.section_code
                                        ? ({ ...x, analysis: a } as typeof x)
                                        : x,
                                    )
                                  : // A section with no produced row yet still has
                                    // somewhere to keep its analysis, or mapping over
                                    // a list that does not contain it would drop the
                                    // result on the floor exactly as before.
                                    [
                                      ...prev,
                                      {
                                        section_code: s.section_code,
                                        title: s.title,
                                        analysis: a,
                                      } as unknown as (typeof prev)[number],
                                    ],
                              )
                            }
                          />
                        </div>
                        {/* A one-way door with no lock behind it would only be a
                            nuisance the first time somebody spots a mistake. */}
                        <button
                          type="button"
                          className="btn bs bsm"
                          onClick={() => void setFinalised(s.section_code, false)}
                        >
                          Change
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Typed expectations are not stored until this button is
                            pressed, so the screen has to say so. Silence here is
                            what turns "I typed it" into "it was saved". */}
                        {pendingCount > 0 && (
                          <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: MUTED }}>
                            {pendingCount} expectation{pendingCount === 1 ? '' : 's'} typed —
                            finalise to save {pendingCount === 1 ? 'it' : 'them'}.
                          </span>
                        )}
                        <button
                          type="button"
                          className="btn bs bsm"
                          onClick={() => void openPicker(s)}
                        >
                          Add figures
                        </button>
                        <button
                          type="button"
                          className="btn bp bsm"
                          onClick={() => void setFinalised(s.section_code, true)}
                        >
                          Finalise figures
                        </button>
                      </>
                    )}
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
          {(sections ?? []).length > 0 && (
            <span style={{ fontSize: 12, color: MUTED }}>
              {(sections ?? []).filter((x) => x.finalised).length} of{' '}
              {(sections ?? []).length} sections finalised
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
