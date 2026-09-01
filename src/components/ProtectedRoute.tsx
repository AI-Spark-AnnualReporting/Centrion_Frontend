import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { redirectToApp, shouldStayInCentriton } from "@/lib/appRouting";
import { isFeatureVisible } from "@/lib/features";
import type { FeatureKey } from "@/constants/features";
import type { AuthUser } from "@/types/auth";

const CHANGE_PASSWORD_PATH = "/change-password";
const ONBOARDING_PATH = "/onboarding";

export function ProtectedRoute({
  children,
  requiredRole,
  requiredFeature,
}: {
  children?: ReactNode;
  // Single role or a list of roles allowed on the route.
  requiredRole?: AuthUser["role"] | AuthUser["role"][];
  // Gate on the backend-computed visible_features list instead of/alongside role.
  requiredFeature?: FeatureKey;
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

  // Users whose default app is the other workspace (spark_studio) never
  // belong in Centriyon. Bounce them out regardless of how they got here
  // (login, bookmark, refresh). Gated on !must_change_password so a
  // freshly-invited user can still complete the forced rotation above before
  // being handed off.
  if (!shouldStayInCentriton(user) && !user.must_change_password) {
    redirectToApp(user.default_app!);
    return null; // render nothing while the hard redirect happens
  }

  // Spark belongs to no company, so every other page in the app — all of which
  // read the caller's company off the JWT — has nothing to show them. Pin them
  // to /spark here rather than at each entry point, so login, a bookmark and a
  // refresh all land the same place.
  // The change-password exemption is load-bearing, not defensive: the rotation
  // gate above sends them to /change-password, and pinning that back to /spark
  // would bounce between the two forever with the form never reachable.
  if (
    user.role === "spark_admin" &&
    !onChangePasswordPage &&
    !location.pathname.startsWith("/spark")
  ) {
    return <Navigate to="/spark" replace />;
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
  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(user.role)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // Feature gate — defense-in-depth against direct URL navigation to a route
  // whose nav item is already hidden by visible_features.
  if (requiredFeature && !isFeatureVisible(user, requiredFeature)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children ?? <Outlet />}</>;
}

export default ProtectedRoute;
