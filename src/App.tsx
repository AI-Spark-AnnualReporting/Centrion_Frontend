import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Spinner } from "./components/shared/Spinner";
import { Toaster } from "./components/ui/toaster";
import { LoginPage, SignupPage } from "./components/auth/AuthPages";
import { ChangePasswordPage } from "./components/auth/ChangePasswordPage";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
} from "./components/auth/PasswordResetPages";
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
import BrandIdentityPage from "./pages/BrandIdentityPage";
import UploadReportsPage from "./pages/UploadReportsPage";
import MeetingsPage from "./pages/MeetingsPage";
import { CommsPage } from "./pages/OtherPages";
import { CompliancePage } from "./pages/OtherPages";
import CommunicationHubPage from "./pages/CommunicationHubPage";
import StakeholdersPage from "./pages/StakeholdersPage";
import QuestionsPage from "./pages/QuestionsPage";
import NotFound from "./pages/NotFound";
import ExtractionReviewPage from "./pages/quarterly/ExtractionReviewPage";
import OutlinePage from "./pages/quarterly/OutlinePage";
import PreviewPage from "./pages/quarterly/PreviewPage";
import AssembledReportPage from "./pages/quarterly/AssembledReportPage";
import EarningsSetupPage from "./pages/earnings/EarningsSetupPage";
import EarningsExtractPage from "./pages/earnings/EarningsExtractPage";
import EarningsOutlinePage from "./pages/earnings/EarningsOutlinePage";
import EarningsPreviewPage from "./pages/earnings/EarningsPreviewPage";

// Admin Console pages — code-split (recharts etc. stay off the main bundle).
// They render inside AppLayout so the main sidebar drives navigation.
const AdminOverviewPage = lazy(() => import("./pages/admin/AdminOverviewPage"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminDepartmentsPage = lazy(
  () => import("./pages/admin/AdminDepartmentsPage"),
);

// Annual Report (Cycles) — admin-only. Rendered inside AppLayout so the main
// sidebar + topbar stay (same shell as the Admin Console). Code-split.
const CyclesListPage = lazy(() => import("./pages/annual-report/CyclesListPage"));
const CycleDetailPage = lazy(() => import("./pages/annual-report/CycleDetailPage"));

// Compliance Validation — 3-step wizard (Set up → Review → Gate). Code-split;
// the run id in the URL makes Review and Gate deep-linkable.
const ComplianceSetupPage = lazy(
  () => import("./pages/compliance/ComplianceSetupPage"),
);
const ComplianceRunningPage = lazy(
  () => import("./pages/compliance/ComplianceRunningPage"),
);
const ComplianceReviewPage = lazy(
  () => import("./pages/compliance/ComplianceReviewPage"),
);
const ComplianceGatePage = lazy(
  () => import("./pages/compliance/ComplianceGatePage"),
);
// The certificate for a finished run. Not gated on `certified` — the document
// titles itself by state, so a run still working through gaps can be taken away
// as a validation report that says it is not a clearance.
const CertificatePage = lazy(
  () => import("./pages/compliance/CertificatePage"),
);

// Public certificate verification. Outside ProtectedRoute and outside
// AppLayout: the whole point is that someone holding a printed certificate can
// check it with no account and no session.
const VerifyCertificatePage = lazy(
  () => import("./pages/VerifyCertificatePage"),
);

// Suspense for the code-split routes that render outside AppLayout.
const PublicSuspense = () => (
  <Suspense fallback={<Spinner pad={120} />}>
    <Outlet />
  </Suspense>
);

const App = () => (
  <BrowserRouter>
    <Toaster />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<SignupPage />} />
      {/* Public by necessity — a user who can't sign in has no session to
          protect these with. /reset-password is the target of the emailed
          link; the token in its query string is the only identity proof. */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* Public — an auditor or regulator holding a printed certificate must be
          able to check it without an account. /verify takes a pasted code;
          /verify/:code checks on arrival, for a shared link or a QR scan. */}
      {/* Its own Suspense boundary — the app's only one lives inside AppLayout,
          which these routes deliberately sit outside of. */}
      <Route element={<PublicSuspense />}>
        <Route path="/verify" element={<VerifyCertificatePage />} />
        <Route path="/verify/:code" element={<VerifyCertificatePage />} />
      </Route>
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
          {/* Quarterly shares ReportsPage (route-driven view), surfaced as a
              sidebar child of Reports. Static path outranks /reports/:reportId. */}
          <Route path="/reports/quarterly" element={<ReportsPage />} />
          <Route path="/reports/processing" element={<ProcessingPage />} />
          <Route path="/reports/:reportId" element={<ReportDetailPage />} />
          {/* Step 2 — confirm which extracted figures are which metric. Sits before
              the outline: the outline's data badges are only meaningful once the
              figure set is settled. */}
          <Route path="/quarterly-report/:reportId/extraction" element={<ExtractionReviewPage />} />
          <Route path="/quarterly-report/:reportId/outline" element={<OutlinePage />} />
          <Route path="/quarterly-report/:reportId/preview" element={<PreviewPage />} />
          <Route path="/quarterly-report/:reportId/report" element={<AssembledReportPage />} />
          {/* Earnings report (Part 1 = setup). Static /earnings/setup is declared
              before the /earnings/:reportId param route so it outranks it. */}
          <Route path="/earnings/setup" element={<EarningsSetupPage />} />
          <Route path="/earnings/:reportId/extract" element={<EarningsExtractPage />} />
          <Route path="/earnings/:reportId/outline" element={<EarningsOutlinePage />} />
          <Route path="/earnings/:reportId/preview" element={<EarningsPreviewPage />} />
          <Route path="/kpi" element={<KPIPage />} />
          <Route path="/compliance" element={<ComplianceSetupPage />} />
          {/* The 30–60s wait after POST /runs gets its own screen so the run is
              deep-linkable and a refresh resumes polling instead of losing it. */}
          <Route
            path="/compliance/runs/:runId/running"
            element={<ComplianceRunningPage />}
          />
          <Route
            path="/compliance/runs/:runId"
            element={<ComplianceReviewPage />}
          />
          <Route
            path="/compliance/runs/:runId/gate"
            element={<ComplianceGatePage />}
          />
          <Route
            path="/compliance/runs/:runId/certificate"
            element={<CertificatePage />}
          />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          {/* The IR Calendar was merged into Board & Meetings — its disclosure
              deadlines now render on that page's grid. Kept as a redirect so
              old bookmarks and links don't 404. */}
          <Route path="/ir-calendar" element={<Navigate to="/meetings" replace />} />
          <Route path="/comms" element={<CommunicationHubPage />} />
          {/* Notification deep-link — opens the thread-view modal on the hub. */}
          <Route
            path="/communications/threads/:threadId"
            element={<CommunicationHubPage />}
          />
          <Route path="/stakeholders" element={<StakeholdersPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* Brand Identity — the onboarding Brand step's three values, editable
              after the fact. Admin-only because PATCH /companies/me is; the
              sidebar item is gated to match so it's never a dead link. */}
          <Route element={<ProtectedRoute requiredRole="admin" />}>
            <Route path="/brand-identity" element={<BrandIdentityPage />} />
            {/* The onboarding upload step, reachable after the fact — onboarding
                can be skipped, which otherwise leaves the account with no
                documents and no way to run the ingest. Admin-only to match. */}
            <Route path="/upload-reports" element={<UploadReportsPage />} />
          </Route>
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
          {/* Annual Report (Cycles) — admin + IR, inside the main shell so the
              sidebar + topbar stay. Admins manage cycles; IR is read-only
              (create/edit hidden in the pages). No separate /new route — the
              create form lives on the list page (ESG-style). */}
          <Route element={<ProtectedRoute requiredRole={["admin", "ir"]} />}>
            <Route path="/annual-report" element={<CyclesListPage />} />
            <Route
              path="/annual-report/cycles/:cycleId"
              element={<CycleDetailPage />}
            />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
