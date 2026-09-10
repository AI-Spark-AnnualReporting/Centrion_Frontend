/**
 * The financial-data upload lane, shared by the two places it appears.
 *
 * The setup form has taken these files since the beginning; the extraction screen's
 * "Upload more files" dialog now takes them too. Only the pure bits live here — the
 * drop zone and chip grid stay inline in each, because the form's copy is entangled
 * with its combined-lane cap arithmetic and its help panels.
 *
 * What must NOT drift between the two: which extensions are accepted (the backend
 * 422s anything else), and how a file is identified for de-duplication.
 */

// Excel/CSV/Word. A .docx here is read as TABLES ONLY — a Word file of prose is an
// empty file to us, which is what the check-tables preflight exists to catch.
export const ACCEPTED_FIN_EXT = ['.xlsx', '.csv', '.docx'] as const;
export const ACCEPTED_FIN_ATTR = ACCEPTED_FIN_EXT.join(',');

// Backend: MAX_QUARTERLY_DOCUMENTS. On the setup form this is a combined cap across
// both upload lanes; on a later upload the financial lane has it to itself.
export const MAX_FIN_DOCUMENTS = 10;

/** Per-file preflight status: can we read any figures out of this at all. */
export type FinTableStatus = 'checking' | 'ok' | 'none';

export interface FinTableInfo {
  status: FinTableStatus;
  tableCount?: number;
  message?: string;
}

/** Name + size, which is as close to file identity as the browser will give us. */
export const fileKey = (f: File) => `${f.name}:${f.size}`;

export function hasFinExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_FIN_EXT.some((ext) => lower.endsWith(ext));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
