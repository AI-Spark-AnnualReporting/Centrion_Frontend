// The "Ask Centriyon" launcher is fixed to the bottom-right corner — exactly
// where the quarterly report flow puts its own footer bar and its primary
// action. AppLayout hides it there, which also un-raises the compliance dock and
// lets .content reclaim the ~132px of clearance it reserves for the launcher
// (that clearance is what left the outline's section list clipped short of the
// bottom of the page).
//
// The dashboard already hid the launcher for its own reason and must be
// unaffected: it keeps the clearance, because it's an ordinary scrolling page.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";

vi.mock("@/components/layout/Sidebar", () => ({ Sidebar: () => <nav /> }));
vi.mock("@/components/layout/Topbar", () => ({
  Topbar: ({ pageName }: { pageName: string }) => <header>{pageName}</header>,
}));
vi.mock("@/context/ComplianceRunsContext", () => ({
  ComplianceRunsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/shared/ComplianceRunsDock", () => ({
  // Surface `raised` in the DOM so the test can assert on it without reaching
  // into the real dock's styling.
  ComplianceRunsDock: ({ raised }: { raised?: boolean }) => (
    <div data-testid="dock" data-raised={String(Boolean(raised))} />
  ),
}));

function renderAt(pathname: string) {
  const { container } = render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="*" element={<div>page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return {
    fab: screen.queryByText("Ask Centriyon"),
    content: container.querySelector(".content") as HTMLElement,
    dock: screen.getByTestId("dock"),
  };
}

describe("AppLayout — floating launcher across the report flow", () => {
  it.each([
    "/quarterly-report/rpt-1/outline",
    "/quarterly-report/rpt-1/preview",
    "/quarterly-report/rpt-1/report",
    "/reports/processing",
  ])("hides the launcher and flushes the content padding on %s", (path) => {
    const { fab, content, dock } = renderAt(path);
    expect(fab).toBeNull();
    expect(content.classList.contains("content--flush")).toBe(true);
    // With no launcher to clear, the dock must sit back down.
    expect(dock.dataset.raised).toBe("false");
  });

  it.each(["/compliance", "/earnings/setup", "/annual-report", "/reports/quarterly"])(
    "leaves the launcher alone on %s",
    (path) => {
      const { fab, content, dock } = renderAt(path);
      expect(fab).not.toBeNull();
      expect(content.classList.contains("content--flush")).toBe(false);
      expect(dock.dataset.raised).toBe("true");
    },
  );

  it("leaves the dashboard exactly as it was — no launcher, but keeps its clearance", () => {
    const { fab, content, dock } = renderAt("/dashboard");
    expect(fab).toBeNull();
    // The dashboard is NOT a report-flow route, so it must not get the flush class.
    expect(content.classList.contains("content--flush")).toBe(false);
    expect(dock.dataset.raised).toBe("false");
  });

  it("matches on a path segment, so a sibling route can't be caught by the prefix", () => {
    const { fab, content } = renderAt("/quarterly-reports-archive");
    expect(fab).not.toBeNull();
    expect(content.classList.contains("content--flush")).toBe(false);
  });
});
