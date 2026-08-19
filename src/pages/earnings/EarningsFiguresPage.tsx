// Step 3 — Figures.
//
// A user-metrics quarterly report is built from the company's own workbook, so
// its lines carry the workbook's labels and nothing canonical. There is no
// registry to match them against, and 933 of them is far too many to read.
//
// So the user says what they want in a section, in their own words, and the model
// is asked FOR THAT SECTION with those words in the call. Nothing runs until they
// ask — a section they never touch stays empty and costs nothing.

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { earnings, ApiError } from '@/lib/api';
import { Spinner } from '@/components/shared/Spinner';
import type {
  EarningsFigureSection,
  EarningsSourceLine,
} from '@/types/earnings';
import { EarningsStepper } from '@/components/earnings/EarningsStepper';
import { FigureChecklist } from '@/components/earnings/FigureChecklist';
import { FigureDialog } from '@/components/earnings/FigureDialog';
import { INK, MUTED, FAINT } from '@/components/earnings/tokens';
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

  // The Add-figure picker, and the lines it offers.
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
      setPrompts(
        Object.fromEntries(res.sections.map((s) => [s.section_code, s.prompt ?? ''])),
      );
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Couldn't load your figures.");
    }
  }, [reportId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    } catch (e) {
      setSectionError((p) => ({
        ...p,
        [code]: e instanceof ApiError ? e.message : "Couldn't search that section.",
      }));
    } finally {
      setSearching(null);
    }
  };

  const removeFigure = async (section: EarningsFigureSection, figureId: string) => {
    if (!reportId) return;
    const keep = section.figures.filter((f) => f.id !== figureId).map((f) => f.id);
    const before = section.figures;
    replaceSection(section.section_code, section.figures.filter((f) => f.id !== figureId));
    try {
      const res = await earnings.setSectionFigures(reportId, section.section_code, keep);
      replaceSection(section.section_code, res.figures);
    } catch {
      replaceSection(section.section_code, before);   // put it back rather than lie
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
      setContinueError(e instanceof ApiError ? e.message : "Couldn't generate the report.");
    }
  };

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
            phase === 'completed' ? 'completed' : 'running', producePoll.nodes,
          )}
          done={phase === 'completed'}
          onDone={() => navigate(`/earnings/${reportId}/preview`)}
        />
      </div>
    );
  }

  const totalFigures = (sections ?? []).reduce((n, s) => n + s.total, 0);
  const emptyCount = (sections ?? []).filter((s) => s.total === 0).length;

  return (
    <div style={{ padding: '18px 22px 40px' }}>
      <EarningsStepper activeStep={3} reportId={reportId} />

      <div style={{ margin: '18px 0 14px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: 0 }}>
          Choose your figures
        </h1>
        <p style={{ fontSize: 13, color: MUTED, margin: '4px 0 0', maxWidth: 720 }}>
          For each section, say what kind of figures you want in it — in your own words —
          then search. We read your report's own lines and pick the ones that match.
        </p>
      </div>

      {loadError && (
        <div role="alert" style={{ color: '#B33A3E', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
          {loadError}
        </div>
      )}

      {sections === null && !loadError ? (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : (
        (sections ?? []).map((s) => (
          <div key={s.section_code} className="card" style={{ marginBottom: 14, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: INK }}>{s.title}</div>
              <div style={{ fontSize: 12, color: s.total ? INK : FAINT, fontVariantNumeric: 'tabular-nums' }}>
                {s.total} {s.total === 1 ? 'figure' : 'figures'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '10px 0 0' }}>
              <textarea
                className="inp"
                aria-label={`What figures belong in ${s.title}`}
                placeholder="e.g. revenue, margins and anything by segment"
                value={prompts[s.section_code] ?? ''}
                onChange={(e) => setPrompts((p) => ({ ...p, [s.section_code]: e.target.value }))}
                rows={2}
                style={{ flex: 1, resize: 'vertical', fontSize: 12.5 }}
              />
              <button
                type="button"
                className="btn bp bsm"
                disabled={searching === s.section_code}
                onClick={() => void search(s.section_code)}
                style={{ flexShrink: 0, minWidth: 130 }}
              >
                {searching === s.section_code ? 'Searching…' : 'Search figures'}
              </button>
            </div>

            {searching === s.section_code && (
              <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>
                Reading your report's lines for this section…
              </div>
            )}
            {sectionError[s.section_code] && (
              <div role="alert" style={{ fontSize: 12, color: '#B33A3E', fontWeight: 700, marginTop: 8 }}>
                {sectionError[s.section_code]}
              </div>
            )}

            {s.figures.length > 0 && (
              <div style={{ marginTop: 12, border: '1px solid #E8EAF3', borderRadius: 8 }}>
                {s.figures.map((f) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                      borderTop: '1px solid #F0F1F7', fontSize: 12, color: INK,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {f.display_label}
                    </span>
                    <span style={{ flexShrink: 0, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
                      {f.value?.toLocaleString()} {f.unit}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.display_label}`}
                      onClick={() => void removeFigure(s, f.id)}
                      style={{
                        border: 'none', background: 'none', cursor: 'pointer',
                        color: MUTED, fontSize: 15, lineHeight: 1, padding: '0 2px',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button type="button" className="btn bs bsm" onClick={() => void openPicker(s)}>
                Add figure
              </button>
            </div>
          </div>
        ))
      )}

      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, marginTop: 18,
        }}
      >
        <button type="button" className="btn bs" onClick={() => navigate(`/earnings/${reportId}/outline`)}>
          ← Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {emptyCount > 0 && (
            <span style={{ fontSize: 12, color: MUTED }}>
              {emptyCount} {emptyCount === 1 ? 'section has' : 'sections have'} no figures and
              will be left out
            </span>
          )}
          {continueError && (
            <span role="alert" style={{ fontSize: 12, color: '#B33A3E', fontWeight: 700 }}>
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
            <div style={{ padding: 40, textAlign: 'center' }}>
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

      <div style={{ fontSize: 11, color: FAINT, marginTop: 10 }}>
        {totalFigures} {totalFigures === 1 ? 'figure' : 'figures'} across your report
      </div>
    </div>
  );
}
