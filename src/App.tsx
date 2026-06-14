import { lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginPage, SignupPage } from "./components/auth/AuthPages";
import { ChangePasswordPage } from "./components/auth/ChangePasswordPage";
import OnboardingPage from "./pages/OnboardingPage";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";
import ReportDetailPage from "./pages/ReportDetailPage";
import ProcessingPage from "./pages/ProcessingPage";
import KPIPage from "./pages/KPIPage";
import AIPage from "./pages/AIPage";
import DocsPage from "./pages/DocsPage";
import ProfilePage from "./pages/ProfilePage";
import MeetingsPage from "./pages/MeetingsPage";
import { CompliancePage, CommsPage } from "./pages/OtherPages";
import StakeholdersPage from "./pages/StakeholdersPage";
import QuestionsPage from "./pages/QuestionsPage";
import NotFound from "./pages/NotFound";

// Admin Console pages — code-split (recharts etc. stay off the main bundle).
// They render inside AppLayout so the main sidebar drives navigation.
const AdminOverviewPage = lazy(() => import("./pages/admin/AdminOverviewPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminDepartmentsPage = lazy(
  () => import("./pages/admin/AdminDepartmentsPage"),
);

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<SignupPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<ProtectedRoute />}>
        {/* Forced password rotation lives outside AppLayout so there's no
            sidebar / topbar / chatbot to distract from the required step. */}
        <Route path="/change-password" element={<ChangePasswordPage />} />
        {/* First-login onboarding — also shell-less, same as change-password. */}
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/processing" element={<ProcessingPage />} />
          <Route path="/reports/:reportId" element={<ReportDetailPage />} />
          <Route path="/kpi" element={<KPIPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/comms" element={<CommsPage />} />
          <Route path="/stakeholders" element={<StakeholdersPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* Admin Console — admin-only, rendered inside the main shell so the
              sidebar's expandable Admin section drives navigation. */}
          <Route element={<ProtectedRoute requiredRole="admin" />}>
            <Route path="/admin-console" element={<AdminOverviewPage />} />
            <Route path="/admin-console/users" element={<AdminUsersPage />} />
            <Route
              path="/admin-console/departments"
              element={<AdminDepartmentsPage />}
            />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
