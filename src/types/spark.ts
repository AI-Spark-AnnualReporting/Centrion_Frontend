// Spark console — the platform-owner view that crosses tenants. Every other
// admin surface in this app is scoped to the caller's own company by the JWT;
// these three endpoints are the only ones that are not, and the backend must
// authorise them on the `spark_admin` role alone.
//
// Wire contract (see FRONTEND.md § Spark):
//   GET /api/v1/spark/overview  → SparkOverview
//   GET /api/v1/spark/users     → SparkUserRow[]
//   GET /api/v1/spark/reports   → SparkReportRow[]
//
// Fields the backend hasn't pinned down are optional so a missing key renders
// a placeholder instead of crashing the page — same tolerance as @/types/admin.

import type { BackendRole } from "@/constants/roles";
import { titleCase } from "@/lib/utils";

export interface SparkCompanyRow {
  id: string;
  name: string;
  sector_name?: string | null;
  jurisdiction?: string | null;
  created_at?: string | null;
  is_active?: boolean | null;
  // Per-company counts come down with the company so the Companies tab needs
  // no second call and no client-side tally of the users/reports lists.
  user_count?: number | null;
  report_count?: number | null;
}

export interface SparkOverview {
  total_companies: number;
  total_reports: number;
  total_users: number;
  companies: SparkCompanyRow[];
}

// company_id / company_name are what make these rows groupable — they are the
// difference between these endpoints and the company-scoped /admin ones.
export interface SparkUserRow {
  user_id: string;
  full_name: string;
  email: string;
  role: BackendRole;
  status?: string | null;
  company_id: string;
  company_name: string;
  last_active?: string | null;
}

// ── Report trends (GET /api/v1/spark/report-trends) ────────────────────────
// Backs the comparison chart. `?year=` gives twelve zero-filled month buckets;
// no params gives one bucket per year with data. The UI always sends a year
// (see ReportTrendsCard) because an unfiltered call is a single bar group.
//
// `?month=` exists server-side but the UI never sends it: it collapses the
// response to one bucket, which loses the twelve-month shape that makes the
// chart worth looking at. The month picker dims the other months instead.

export interface SparkTrendBucket {
  key: string; // stable id, e.g. "2026-07"
  label: string; // x-axis text, e.g. "Jul"
  counts: Record<string, number>; // report type key -> count
  total: number;
}

export interface SparkTrendSeries {
  key: string; // report type key, e.g. "board_report"
  label: string; // display text, e.g. "Board Report"
}

export interface SparkReportTrends {
  buckets: SparkTrendBucket[];
  // Stable across buckets and across filter changes — the series list is what
  // keeps a report type bound to one colour when a filter removes its rows.
  report_types: SparkTrendSeries[];
  totals: Record<string, number>; // type -> count for the whole window
  total: number;
  top_type: string | null;
  available_years: number[];
}

// The exact wire shape isn't pinned down (are per-type counts nested under
// `counts` or spread onto the bucket? is `report_types` strings or objects?),
// so read both rather than guess wrong and render an empty chart. Same
// tolerance as normalizeOverview in @/types/admin.
export function normalizeTrends(raw: unknown): SparkReportTrends {
  const r = (raw ?? {}) as Record<string, unknown>;

  const report_types: SparkTrendSeries[] = (Array.isArray(r.report_types) ? r.report_types : [])
    .map((t) =>
      typeof t === "string"
        ? { key: t, label: titleCase(t) }
        : {
            key: String((t as SparkTrendSeries)?.key ?? ""),
            label:
              (t as SparkTrendSeries)?.label ||
              titleCase(String((t as SparkTrendSeries)?.key ?? "")),
          },
    )
    .filter((t) => t.key !== "");

  const buckets: SparkTrendBucket[] = (Array.isArray(r.buckets) ? r.buckets : []).map((b) => {
    const row = (b ?? {}) as Record<string, unknown>;
    const nested = (row.counts ?? null) as Record<string, number> | null;
    const counts: Record<string, number> = {};
    for (const t of report_types) {
      // Nested `counts` wins; a flat `{ annual: 3 }` on the bucket is the
      // fallback. Absent means zero, not missing — the chart is zero-filled.
      counts[t.key] = Number(nested?.[t.key] ?? row[t.key] ?? 0) || 0;
    }
    const key = String(row.key ?? row.label ?? "");
    return {
      key,
      label: String(row.label ?? key),
      counts,
      // Reported total wins when present — a real 0 is a fact, not a gap — and
      // is derived from the counts only when the field is absent entirely.
      total:
        row.total != null
          ? Number(row.total) || 0
          : Object.values(counts).reduce((n, v) => n + v, 0),
    };
  });

  // `totals` may be keyed by type directly or wrapped in `by_type`.
  const rawTotals = ((r.totals as Record<string, unknown>)?.by_type ?? r.totals ?? {}) as Record<
    string,
    unknown
  >;
  const totals: Record<string, number> = {};
  for (const t of report_types) {
    // Same absent-vs-zero rule as the bucket totals above. Without the derived
    // fallback, a backend that omits `totals` would show every legend entry as
    // 0 next to bars that plainly aren't.
    totals[t.key] =
      rawTotals?.[t.key] != null
        ? Number(rawTotals[t.key]) || 0
        : buckets.reduce((n, b) => n + (b.counts[t.key] ?? 0), 0);
  }

  const topRaw = r.top_type as unknown;
  const rawTotal = r.total ?? (r.totals as Record<string, unknown>)?.total;
  return {
    buckets,
    report_types,
    totals,
    total:
      rawTotal != null
        ? Number(rawTotal) || 0
        : buckets.reduce((n, b) => n + b.total, 0),
    top_type:
      (typeof topRaw === "string" ? topRaw : ((topRaw as SparkTrendSeries)?.key ?? null)) || null,
    available_years: (Array.isArray(r.available_years) ? r.available_years : [])
      .map((y) => Number(y))
      .filter((y) => Number.isFinite(y)),
  };
}

export interface SparkReportRow {
  report_id: string;
  title: string;
  report_type?: string | null;
  status?: string | null;
  period?: string | null;
  created_at?: string | null;
  company_id: string;
  company_name: string;
}
