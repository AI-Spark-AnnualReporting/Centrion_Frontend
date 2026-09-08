// "Acting as <Company>" — the reminder that a Spark staff session is currently
// operating inside someone else's tenant, and the way back to the directory.
//
// Same contract as AppSwitcher: named export, no props, reads useAuth(), and
// renders nothing for everyone it doesn't apply to — so Topbar needs no
// conditional around it.

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export function ActingCompanyChip() {
  const navigate = useNavigate();
  const { user, actingCompany, leaveCompany } = useAuth();

  // Only Spark staff can act outside their own company, and only once they've
  // picked one — before that the directory IS the page they're on.
  if (user?.role !== "spark_internal" || !actingCompany) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // Same contract as the sidebar's Companies button — see there.
        leaveCompany();
        navigate("/companies");
      }}
      title="Switch company"
      className="tb-tag"
      style={{
        border: "1px solid #DCE0FA",
        cursor: "pointer",
        maxWidth: 240,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      Acting as: {actingCompany.name || "Unnamed company"} ▾
    </button>
  );
}
