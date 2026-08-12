import type { CSSProperties } from 'react';
import { formatDistanceToNow } from 'date-fns';
import type { Company } from '@/types/company';

/* Shared helpers for the communication thread components. Extracted from
   CommunicationHubPage so the earnings (IR) report can mount the same flow. */

// Sentinel for the "All" report-type pill in NewThreadModal.
export const ALL_FILTER = '__all__';

// "Aizaz Zulfiqar" → "Aizaz Z."; single name → unchanged.
export function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// ISO timestamp → "2 hours ago", "just now", etc.
export function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

// "department_user" → "Department User"
export function roleLabel(role: string): string {
  return role
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export const SECTION_LABEL: CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  color: '#9BA3C4',
  letterSpacing: '.7px',
  marginBottom: 10,
};

// Client-side mirror of the backend's own attachment validation (see
// communications.uploadAttachment in api.ts) — just avoids a round-trip for
// an obvious reject. Shared by the thread-row quick-attach button and the
// in-thread composer's paperclip.
export const ATTACHMENT_ACCEPT = ['.pdf', '.xlsx', '.csv', '.docx', '.txt'] as const;
export const ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;

export function validateAttachmentFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  if (!ATTACHMENT_ACCEPT.some((ext) => lower.endsWith(ext))) {
    return `Unsupported file type. Allowed: ${ATTACHMENT_ACCEPT.join(', ')}.`;
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return 'File is too large. Maximum size is 50MB.';
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The company's website host, or a slugified fallback ("shell.com") — used to
// build the "investor.relations@…" sender address shown in email previews.
// Shared by ExternalEmailModal (report threads) and SendExternalModal
// (any thread) so both previews build the sender address the same way.
export function companyDomain(company: Company | null, fallbackName: string): string {
  const raw = company?.website_url?.trim();
  if (raw) {
    try {
      const host = new URL(raw.startsWith('http') ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
      if (host) return host;
    } catch {
      /* fall through to the slug */
    }
  }
  const slug = fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${slug || 'company'}.com`;
}
