// ProtectedRoute pins `spark_admin` to /spark, because every other page in the
// app reads a company off the JWT that Spark doesn't have. The pin has to yield
// to the forced password rotation: the rotation gate sends them to
// /change-password, and a pin that fires there too bounces between the two
// forever with the form never reachable. That interaction is invisible in
// review and only shows up for a freshly-created Spark account, so it's pinned
// here.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const auth: { user: Record<string, unknown> | null; loading: boolean } = {
  user: null,
  loading: false,
};

vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
// Pulled in only for the PM/department bounce, which none of these cases hit.
vi.mock("@/lib/sar", () => ({
  isSarRole: (r?: string | null) =>
    r === "project_manager" || r === "hod" || r === "department_user",
  redirectToSar: () => true,
}));

const { ProtectedRoute } = await import("@/components/ProtectedRoute");

const landOn = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<div>ROTATE FORM</div>} />
          <Route path="/dashboard" element={<div>TENANT DASHBOARD</div>} />
          <Route path="/spark" element={<div>SPARK CONSOLE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe("spark_admin route gate", () => {
  it("lets a Spark user rotate a temporary password instead of looping", () => {
    auth.user = {
      user_id: "u_spark",
      role: "spark_admin",
      must_change_password: true,
    };
    landOn("/change-password");
    expect(screen.getByText("ROTATE FORM")).toBeTruthy();
    expect(screen.queryByText("SPARK CONSOLE")).toBeNull();
  });

  it("sends a Spark user landing anywhere else to the Spark console", () => {
    auth.user = {
      user_id: "u_spark",
      role: "spark_admin",
      must_change_password: false,
    };
    landOn("/dashboard");
    expect(screen.getByText("SPARK CONSOLE")).toBeTruthy();
  });

  it("leaves a company admin on the tenant app", () => {
    auth.user = {
      user_id: "u_admin",
      role: "admin",
      must_change_password: false,
      onboarding_completed: true,
    };
    landOn("/dashboard");
    expect(screen.getByText("TENANT DASHBOARD")).toBeTruthy();
  });
});
