import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import type { AuthUser } from "@/types/auth";

const CHANGE_PASSWORD_PATH = "/change-password";
const ONBOARDING_PATH = "/onboarding";

export function ProtectedRoute({
  children,
  requiredRole,
}: {
  children?: ReactNode;
  requiredRole?: AuthUser["role"];
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[13px] text-[#5A6080]">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  // Force first-login users to set a permanent password before they can
  // see any other authenticated page. The change-password screen itself is
  // exempt so the user can actually complete the rotation.
  const onChangePasswordPage = location.pathname === CHANGE_PASSWORD_PATH;
  if (user.must_change_password && !onChangePasswordPage) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  // Conversely, a user who's already rotated their password shouldn't be
  // able to revisit the rotation screen by URL — bounce them to the app.
  if (!user.must_change_password && onChangePasswordPage) {
    return <Navigate to="/dashboard" replace />;
  }

  // Onboarding gate — only self-registered admins who haven't finished it.
  // Strict === checks so older sessions (field absent/undefined) are never
  // bounced; invited users (project_manager / department_user) skip it.
  const onOnboardingPage = location.pathname === ONBOARDING_PATH;
  if (
    user.role === "admin" &&
    user.onboarding_completed === false &&
    !onOnboardingPage
  ) {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }
  if (onOnboardingPage && user.onboarding_completed === true) {
    return <Navigate to="/dashboard" replace />;
  }

  // Role gate (e.g. the Admin Console). Non-matching roles bounce to the app.
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default ProtectedRoute;
