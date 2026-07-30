import type { CSSProperties } from 'react';
import { formatDistanceToNow } from 'date-fns';

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
