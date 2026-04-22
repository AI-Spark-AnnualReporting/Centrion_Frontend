// Persists an in-flight pipeline run so the user can resume watching it after
// leaving /reports/processing (tab close, timeout dismissal, manual navigation).
// Cleared when the run completes, fails, or the user dismisses the banner.

const ACTIVE_PIPELINE_KEY = "centriton_active_pipeline";

export interface ActivePipelineRecord {
  runId: string;
  pollUrl: string;
  reportId: string | null;
  companyId: string;
  fileName: string | null;
  estimatedDurationSeconds: number | null;
  savedAt: number;
}

export function saveActivePipeline(record: Omit<ActivePipelineRecord, "savedAt">): void {
  if (typeof localStorage === "undefined") return;
  const payload: ActivePipelineRecord = { ...record, savedAt: Date.now() };
  try {
    localStorage.setItem(ACTIVE_PIPELINE_KEY, JSON.stringify(payload));
  } catch {
    /* storage full / disabled — silently drop, resume is a nice-to-have */
  }
}

export function loadActivePipeline(): ActivePipelineRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_PIPELINE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActivePipelineRecord;
    if (!parsed?.runId || !parsed?.pollUrl || !parsed?.companyId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActivePipeline(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(ACTIVE_PIPELINE_KEY);
  } catch {
    /* ignore */
  }
}
