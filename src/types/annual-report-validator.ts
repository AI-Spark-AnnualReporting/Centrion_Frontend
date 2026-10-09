// Types for the Annual Report Validator (external reports), ported from the
// SAR app's lib/api/pm.ts so Centriyon can call the same backend endpoints
// directly (POST /pm/validate-upload, GET /pm/validation-jobs/{id}) without a
// token hand-off to that app.

export interface ReportValidation {
  figures_total: number
  figures_traced: number
  // Which of the two recorded sources each figure matched. Absent on a
  // validation stored before documents were checked, which is why the panel
  // falls back to the plain ratio without it.
  figures_by_source?: {
    submission: number
    document: number
    neither: number
  } | null
  // context is the sentence the figure sits in. Optional: validations stored
  // before it was captured have the bare value only.
  untraced: { section_code: string; title: string; value: string; context?: string }[]
  instruction_text: { section_code: string; title: string; line: string; marker: string }[]
  voice: { section_code: string; title: string; phrase: string }[]
  preferred_words: Record<string, number>
  // The house style this run was judged against. Null when the company
  // stores no style at all.
  tone_rules?: {
    person: string
    register: string
    sentence_style: string
    tone_adjectives: string[]
    banned_words: string[]
    preferred_words: string[]
    do: string[]
    dont: string[]
  } | null
  conflicts: { measure: string; detail: string }[]
  redundancy: { sections: string[]; detail: string }[]
  brief_gaps: { ask: string; detail: string }[]
  // How many explicit asks the brief made in all. Null when the judgement
  // gave no usable count, and on any validation stored before it was asked for.
  brief_asks_total?: number | null
  // Every ask the brief made, covered or not, and which section covers it.
  brief_asks?: { ask: string; covered?: boolean; where?: string; detail?: string }[]
  emphasis: { primary_leads?: boolean; detail?: string; missing?: string[] } | null
  // How much of the report carries each concept message, and the house
  // style. Counted over the sections that were read, never the whole report.
  coverage?: {
    sections_checked: number
    concept_sections?: number
    tone_sections?: number
    excluded?: {
      section_code: string
      title: string
      purpose: string
      concept: boolean
      tone: boolean
    }[]
    primary: CoverageStat | null
    secondary: CoverageStat[]
    secondary_any: { sections: number; percent: number }
    tone: { sections: number; percent: number } | null
  } | null
  // Sections the model never returned a verdict for. NOT the same as clean.
  sections_unchecked: string[]
  sections: Record<string, {
    title?: string
    covers?: string
    concept?: string
    concepts?: string[]
    unsupported?: { label: string; detail: string }[]
    figures?: { label?: string; value?: string; measure?: string }[]
  }>
  validated_at: string
  // false on an external report (Annual Report Validator), which has no
  // sources to trace figures to. Absent on older results, which all traced.
  figure_tracing?: boolean
  // The uploaded file's name, on an external report only.
  filename?: string
}

interface CoverageStat {
  title: string
  sections: number
  percent: number
}

// House-style rules, in the shape the backend stores as companies.brand_voice.
export interface ToneRules {
  person: string
  register: string
  sentence_style: string
  tone_adjectives: string[]
  banned_words: string[]
  preferred_words: string[]
  do: string[]
  dont: string[]
}

// What the user gives the Annual Report Validator. Everything is required;
// the brief, concept messages and tone may be typed/pasted or uploaded as a
// file. Tone has no typed/structured path like concepts does - paste and
// file both arrive as free text, which the server always reads with the
// model (see ToneRules, the shape it comes back as once read).
export interface ExternalReportInput {
  report: File
  brief: string
  briefFile: File | null
  concepts: { title: string; message: string }[]
  conceptFile: File | null
  toneText: string
  toneFile: File | null
}

// A validation running in the background (GET /pm/validation-jobs/{id}).
export interface ValidationJob {
  job_id: string
  status: "running" | "completed" | "failed"
  stage: string | null
  validation: ReportValidation | null
  error: string | null
}

// One row of GET /pm/validation-jobs (list) - lightweight, so the gallery
// doesn't pull the full validation payload for every past run. `score` is
// the same weighted "Overall" percentage the results panel shows, computed
// server-side; null until the run completes. `error` carries the failure
// message directly, so a failed card needs no second fetch to explain itself.
export interface ValidationJobSummary {
  job_id: string
  filename: string
  status: "running" | "completed" | "failed"
  created_at: string
  score: number | null
  error: string | null
}
