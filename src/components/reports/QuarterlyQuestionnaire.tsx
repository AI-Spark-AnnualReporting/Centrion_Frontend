import type { QuarterlyQuestion } from '@/lib/api';

// Letter badges give each option a familiar multiple-choice feel; the badge is
// also the selection indicator (fills indigo when chosen).
const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

interface QuarterlyQuestionnaireProps {
  questions: QuarterlyQuestion[];
  // questionId → selected option text. Single-select, so one value per question.
  answers: Record<string, string>;
  onSelect: (questionId: string, option: string) => void;
  loading?: boolean;
  error?: string | null;
}

// Single-select questionnaire rendered inline on the Generate screen — five
// questions, four options each, in a 2×2 grid. Purely presentational: all state
// lives in the parent so the answers can be wired into the payload later.
export default function QuarterlyQuestionnaire({
  questions,
  answers,
  onSelect,
  loading = false,
  error = null,
}: QuarterlyQuestionnaireProps) {
  if (loading) {
    return (
      <div style={{ marginBottom: 18 }}>
        <SectionHeader answered={0} total={0} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                height: 118,
                borderRadius: 14,
                background:
                  'linear-gradient(90deg,#F4F5FB 25%,#ECEEF8 37%,#F4F5FB 63%)',
                backgroundSize: '400% 100%',
                animation: 'qq-shimmer 1.4s ease infinite',
              }}
            />
          ))}
        </div>
        <style>{`@keyframes qq-shimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ marginBottom: 18 }}>
        <SectionHeader answered={0} total={0} />
        <div
          role="alert"
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: 'rgba(229,72,77,.08)',
            border: '1px solid rgba(229,72,77,.25)',
            color: '#B33A3E',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (questions.length === 0) return null;

  const total = questions.length;
  const answered = questions.filter((q) => answers[q.id]).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Scoped hover / focus polish that inline styles can't express. */}
      <style>{`
        .qq-opt{transition:border-color .15s,background .15s,box-shadow .15s,transform .08s}
        .qq-opt:hover{border-color:#C4C7F0;background:#FAFAFF}
        .qq-opt:active{transform:scale(.985)}
        .qq-opt.qq-sel{box-shadow:0 4px 14px rgba(64,64,200,.14)}
        .qq-opt.qq-sel:hover{border-color:#4040C8;background:#EAEAFF}
        .qq-opt:focus-visible{outline:2px solid #4040C8;outline-offset:2px}
      `}</style>

      <SectionHeader answered={answered} total={total} />

      {/* Progress bar */}
      <div
        style={{
          height: 5,
          borderRadius: 999,
          background: '#EEF0F8',
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 999,
            background: 'linear-gradient(90deg,#5B8DEF,#4040C8)',
            transition: 'width .35s cubic-bezier(.4,0,.2,1)',
          }}
        />
      </div>

      {/* Question cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q, qi) => {
          const selected = answers[q.id];
          const isAnswered = !!selected;
          return (
            <div
              key={q.id}
              style={{
                border: `1px solid ${isAnswered ? '#DDE0F5' : '#ECEEF8'}`,
                borderRadius: 14,
                padding: '14px 16px 16px',
                background: isAnswered
                  ? 'linear-gradient(180deg,#FBFBFF,#F7F8FE)'
                  : '#fff',
                transition: 'border-color .2s, background .2s',
              }}
            >
              {/* Question row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 8,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    color: isAnswered ? '#fff' : '#4040C8',
                    background: isAnswered ? '#4040C8' : '#EEEEFF',
                    transition: 'background .2s, color .2s',
                  }}
                >
                  {qi + 1}
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: '#1A1D2E',
                    lineHeight: 1.45,
                    paddingTop: 2,
                  }}
                >
                  {q.text}
                </span>
              </div>

              {/* Options — 2×2 grid */}
              <div
                role="radiogroup"
                aria-label={q.text}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                }}
              >
                {q.options.map((opt, oi) => {
                  const isSel = selected === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      role="radio"
                      aria-checked={isSel}
                      onClick={() => onSelect(q.id, opt)}
                      className={`qq-opt${isSel ? ' qq-sel' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        textAlign: 'left',
                        padding: '11px 12px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        border: `1.5px solid ${isSel ? '#4040C8' : '#E4E6F1'}`,
                        background: isSel ? '#EEEEFF' : '#fff',
                      }}
                    >
                      {/* Letter badge = selection indicator */}
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 7,
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 800,
                          color: isSel ? '#fff' : '#8991B4',
                          background: isSel ? '#4040C8' : '#F2F3FA',
                          transition: 'background .15s, color .15s',
                        }}
                      >
                        {isSel ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2.5 6.2l2.2 2.2L9.5 3.6"
                              stroke="#fff"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          OPTION_LETTERS[oi] ?? oi + 1
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: isSel ? 700 : 600,
                          color: isSel ? '#2B2B8F' : '#3A3F5C',
                          lineHeight: 1.35,
                        }}
                      >
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Shared header: label + subtitle + "N/M answered" pill.
function SectionHeader({ answered, total }: { answered: number; total: number }) {
  const done = total > 0 && answered === total;
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <label className="fl-label" style={{ marginBottom: 0 }}>
          Quick Questions
        </label>
        {total > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: 999,
              color: done ? '#2E9B57' : '#6B72A0',
              background: done ? '#E7F7EF' : '#F2F3FA',
              transition: 'color .2s, background .2s',
            }}
          >
            {done && (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2.5 6.2l2.2 2.2L9.5 3.6"
                  stroke="#2E9B57"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {answered}/{total} answered
          </span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: '#9BA3C4', marginBottom: 10 }}>
        Optional — help us tailor the narrative. Pick one answer per question.
      </div>
    </>
  );
}
