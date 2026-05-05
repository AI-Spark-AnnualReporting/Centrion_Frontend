import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

const CHANGE_PASSWORD_PATH = "/change-password";

export function ProtectedRoute({ children }: { children?: ReactNode }) {
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

  return <>{children ?? <Outlet />}</>;
}

export default ProtectedRoute;
