import { CheckCircle2, Loader2, Circle, XCircle } from "lucide-react";
import { EXPECTED_AGENTS } from "@/lib/agent-labels";
import type { AgentNode } from "@/types/report";

interface AgentTimelineProps {
  nodes: AgentNode[];
}

// Presentational-only. Renders the 5 canonical pipeline rows from
// EXPECTED_AGENTS and looks up each one in the supplied `nodes` array by
// agent_name. Rows without a match render as "pending".
export function AgentTimeline({ nodes }: AgentTimelineProps) {
  const byName = new Map(nodes.map((n) => [n.agent_name, n]));

  return (
    <ul
      style={{
        width: "100%",
        maxWidth: 520,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        margin: 0,
        padding: 0,
        listStyle: "none",
      }}
    >
      {EXPECTED_AGENTS.map(({ key, label }) => (
        <TimelineRow key={key} label={label} node={byName.get(key)} />
      ))}
    </ul>
  );
}

interface TimelineRowProps {
  label: string;
  node: AgentNode | undefined;
}

function TimelineRow({ label, node }: TimelineRowProps) {
  const status = node?.status;
  const isRunning = status === "running";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";

  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #E2E4F0",
        background: "#FFFFFF",
        animation: "fade-in .3s ease-out",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {isCompleted ? (
          <CheckCircle2
            className="h-5 w-5"
            style={{ color: "#10B981" }}
            aria-hidden
          />
        ) : isRunning ? (
          <Loader2
            className="h-5 w-5 animate-spin"
            style={{ color: "#4040C8" }}
            aria-hidden
          />
        ) : isFailed ? (
          <XCircle
            className="h-5 w-5"
            style={{ color: "#EF4444" }}
            aria-hidden
          />
        ) : (
          <Circle
            className="h-5 w-5"
            style={{ color: "#C5C8DB" }}
            aria-hidden
          />
        )}
      </span>

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 13,
              fontWeight: isCompleted || isRunning || isFailed ? 600 : 500,
              color: node ? "#1F2142" : "#5A6080",
            }}
          >
            {label}
          </span>
          <ElapsedLabel node={node} />
        </div>
        {isFailed && node?.error_message && (
          <span
            style={{
              fontSize: 11,
              color: "#EF4444",
              marginTop: 4,
              fontFamily: "'DM Mono',monospace",
            }}
          >
            {node.error_message}
          </span>
        )}
      </div>
    </li>
  );
}

function ElapsedLabel({ node }: { node: AgentNode | undefined }) {
  if (!node) return null;
  const elapsed = Number.isFinite(node.elapsed_seconds) ? node.elapsed_seconds : 0;
  if (node.status === "running") {
    return (
      <span
        style={{
          fontSize: 11,
          color: "#5A6080",
          fontFamily: "'DM Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        {Math.floor(elapsed)}s…
      </span>
    );
  }
  if (node.status === "completed" || node.status === "failed") {
    return (
      <span
        style={{
          fontSize: 11,
          color: "#9BA3C4",
          fontFamily: "'DM Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        {elapsed.toFixed(1)}s
      </span>
    );
  }
  return null;
}
