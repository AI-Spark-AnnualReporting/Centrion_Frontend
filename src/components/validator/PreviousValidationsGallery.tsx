// "Pick up a past validation" shelf, above the Annual Report Validator form.
// Same card face as Compliance's ResumeGallery (src/pages/compliance/ResumeGallery.tsx)
// — gradient header by status, a score badge, an action pill, a relative
// timestamp — adapted for a run that has a filename instead of a period, and
// no "Uploaded" badge (every row here is one, so it would say nothing new).
//
// Purely presentational plus its own fetch: what happens on a click is the
// caller's job (open results, show the error, resume polling), passed in as
// onOpen so this component doesn't need to know the page's state machine.

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { sarValidator } from "@/lib/api";
import { relativeTime } from "@/lib/time";
import type { ValidationJobSummary } from "@/types/annual-report-validator";

const FACE: Record<ValidationJobSummary["status"], { gradient: string; label: string; action: string }> = {
  running: {
    gradient: "linear-gradient(135deg,#1F2A6B,#3535B5)",
    label: "Validating…",
    action: "Resume →",
  },
  completed: {
    gradient: "linear-gradient(135deg,#334155,#475569)",
    label: "Completed",
    action: "Continue →",
  },
  failed: {
    gradient: "linear-gradient(135deg,#7F1D1D,#B91C1C)",
    label: "Failed",
    action: "See what happened →",
  },
};

// Same card shape as the real thing, so the row doesn't jump when the fetch
// resolves - just the gradient and the text going from grey to real.
function CardSkeleton() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #E2E4F0",
        display: "flex",
        flexDirection: "column",
        flex: "0 1 260px",
      }}
    >
      <div style={{ padding: "20px 20px 22px" }}>
        <Skeleton className="mb-3 h-5 w-3/4" />
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}

function Card({ job, onOpen }: { job: ValidationJobSummary; onOpen: (job: ValidationJobSummary) => void }) {
  const face = FACE[job.status] ?? FACE.completed;
  const open = () => onOpen(job);

  return (
    <div
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      style={{
        background: "#fff",
        borderRadius: 14,
        overflow: "hidden",
        border: "1px solid #E2E4F0",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "transform .15s ease, box-shadow .15s ease",
        // Fixed-ish width, not a stretched grid cell: wraps naturally with
        // however many cards there are instead of reserving empty columns.
        flex: "0 1 260px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 22px rgba(26,29,46,.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div style={{ background: face.gradient, padding: "20px 20px 22px", color: "#fff", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -34, right: -34, width: 124, height: 124, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />

        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            lineHeight: 1.2,
            letterSpacing: "-.3px",
            marginBottom: 14,
            position: "relative",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
          title={job.filename}
        >
          {job.filename}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, position: "relative" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              padding: "4px 9px",
              borderRadius: 999,
              background: "rgba(255,255,255,.22)",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            {job.status === "completed" && job.score != null ? `${job.score}/100` : face.label}
          </span>
        </div>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flex: 1 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#4040C8", background: "rgba(64,64,200,.1)", padding: "4px 10px", borderRadius: 999, whiteSpace: "nowrap" }}>
          {face.action}
        </span>
        <span style={{ fontSize: 10, color: "#9BA3C4", textAlign: "right" }}>
          {relativeTime(job.created_at)}
        </span>
      </div>
    </div>
  );
}

export function PreviousValidationsGallery({ onOpen }: { onOpen: (job: ValidationJobSummary) => void }) {
  const [jobs, setJobs] = useState<ValidationJobSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    sarValidator
      .list()
      .then((list) => {
        if (!cancelled) setJobs(list);
      })
      // Supporting content: if it fails to load, it stays hidden rather than
      // putting an error banner between the admin and the form they came for.
      .catch(() => {
        if (!cancelled) setJobs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show only once loading is actually done - while it's still
  // running there's no way yet to tell "empty" from "has rows", so the
  // skeleton shows regardless.
  if (!loading && jobs.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#1A1D2E" }}>Previous validations</span>
        <span style={{ fontSize: 11, color: "#9BA3C4" }}>{loading ? "loading…" : "newest first"}</span>
      </div>
      {/* flex, not a 3-column grid: a grid always reserves its full column
          count, so 1-2 cards would sit beside a stretch of empty tracks.
          Flex-wrap only takes the room its cards actually need. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {loading
          ? [0, 1, 2].map((i) => <CardSkeleton key={i} />)
          : jobs.map((job) => <Card key={job.job_id} job={job} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

export default PreviousValidationsGallery;
