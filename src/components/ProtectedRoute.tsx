import { Navigate, Outlet } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-[13px] text-[#5A6080]">
        Loading…
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children ?? <Outlet />}</>;
}

export default ProtectedRoute;
