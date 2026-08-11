import { Fragment, lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
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
import CompanyProfilePage from "./pages/CompanyProfilePage";
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
const BoardSetupPage = lazy(() => import("./pages/annual-report/BoardSetupPage"));
const BoardSourcesPage = lazy(() => import("./pages/annual-report/BoardSourcesPage"));
const BoardSectionsPage = lazy(() => import("./pages/annual-report/BoardSectionsPage"));
const BoardPreviewPage = lazy(() => import("./pages/annual-report/BoardPreviewPage"));
const BoardReportPage = lazy(() => import("./pages/annual-report/BoardReportPage"));

/**
 * Remounts a board step when the report in the URL changes.
 *
 * React reuses the same element across a `:reportId` change — same component,
 * same position in the tree — so the page keeps every piece of local state it
 * had for the previous report: staged files, fetched sections, error banners,
 * and the id of a pipeline run it is still polling. That last one is the one
 * that bites: a run belonging to one report reports its failure on top of
 * another. The key makes a different report a different component instance.
 */
function PerReport({ children }: { children: React.ReactNode }) {
  const { reportId } = useParams();
  return <Fragment key={reportId}>{children}</Fragment>;
}

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
          <Route element={<ProtectedRoute requiredFeature="command_center" />}>
            <Route index element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Route>
          {/* /reports (bare) is the ESG Validator entry point; /reports/quarterly
              shares the same component (route-driven view) but is the Quarterly
              entry point — gated separately since a user can have one feature
              without the other. /reports/processing and /reports/:reportId are
              shared deep-flow pages reachable from either entry point, so they're
              deliberately left ungated here rather than guessing which feature
              owns them. */}
          <Route element={<ProtectedRoute requiredFeature="esg_validator" />}>
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredFeature="quarterly_report" />}>
            <Route path="/reports/quarterly" element={<ReportsPage />} />
            {/* Step 2 — confirm which extracted figures are which metric. Sits before
                the outline: the outline's data badges are only meaningful once the
                figure set is settled. */}
            <Route path="/quarterly-report/:reportId/extraction" element={<ExtractionReviewPage />} />
            <Route path="/quarterly-report/:reportId/outline" element={<OutlinePage />} />
            <Route path="/quarterly-report/:reportId/preview" element={<PreviewPage />} />
            <Route path="/quarterly-report/:reportId/report" element={<AssembledReportPage />} />
          </Route>
          <Route path="/reports/processing" element={<ProcessingPage />} />
          <Route path="/reports/:reportId" element={<ReportDetailPage />} />
          {/* Earnings report (Part 1 = setup). Static /earnings/setup is declared
              before the /earnings/:reportId param route so it outranks it. */}
          <Route element={<ProtectedRoute requiredFeature="earnings_report" />}>
            <Route path="/earnings/setup" element={<EarningsSetupPage />} />
            <Route path="/earnings/:reportId/extract" element={<EarningsExtractPage />} />
            <Route path="/earnings/:reportId/outline" element={<EarningsOutlinePage />} />
            <Route path="/earnings/:reportId/preview" element={<EarningsPreviewPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredFeature="kpi_normalizer" />}>
            <Route path="/kpi" element={<KPIPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredFeature="compliance_validation" />}>
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
          </Route>
          <Route element={<ProtectedRoute requiredFeature="ai_copilot" />}>
            <Route path="/ai" element={<AIPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredFeature="board_meetings" />}>
            <Route path="/meetings" element={<MeetingsPage />} />
          </Route>
          {/* The IR Calendar was merged into Board & Meetings — its disclosure
              deadlines now render on that page's grid. Kept as a redirect so
              old bookmarks and links don't 404. */}
          <Route path="/ir-calendar" element={<Navigate to="/meetings" replace />} />
          <Route element={<ProtectedRoute requiredFeature="communication_hub" />}>
            <Route path="/comms" element={<CommunicationHubPage />} />
            {/* Notification deep-link — opens the thread-view modal on the hub. */}
            <Route
              path="/communications/threads/:threadId"
              element={<CommunicationHubPage />}
            />
          </Route>
          <Route element={<ProtectedRoute requiredFeature="leadership" />}>
            <Route path="/stakeholders" element={<StakeholdersPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredFeature="document_bank" />}>
            <Route path="/docs" element={<DocsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredFeature="questions_bank" />}>
            <Route path="/questions" element={<QuestionsPage />} />
          </Route>
          {/* Profile — User Profile (personal info) and Company Profile
              (company details + brand identity, editable by admin only —
              gated internally by each card/section, not the route). Both
              live under the same "profile" feature. */}
          <Route element={<ProtectedRoute requiredFeature="profile" />}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/company" element={<CompanyProfilePage />} />
          </Route>
          {/* Brand Identity moved into Company Profile — redirect old
              bookmarks/links so they don't 404. */}
          <Route path="/brand-identity" element={<Navigate to="/profile/company" replace />} />
          {/* The onboarding upload step, reachable after the fact — onboarding
              can be skipped, which otherwise leaves the account with no
              documents and no way to run the ingest. Admin-only to match. */}
          <Route element={<ProtectedRoute requiredRole="admin" />}>
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
          <Route element={<ProtectedRoute requiredRole={["admin", "ir"]} requiredFeature="annual_report" />}>
            <Route path="/annual-report" element={<CyclesListPage />} />
            <Route
              path="/annual-report/cycles/:cycleId"
              element={<CycleDetailPage />}
            />
          </Route>
          {/* Board of Directors' Report: pick a year on the setup screen, then
              build it — issuer profile → sources → resolved sections → report.
              Its own feature (board_report), independent of annual_report —
              gated by permission, not restricted to a fixed role list. */}
          <Route element={<ProtectedRoute requiredFeature="board_report" />}>
            <Route path="/board-report" element={<BoardSetupPage />} />
            <Route
              path="/board-report/:reportId/sources"
              element={
                <PerReport>
                  <BoardSourcesPage />
                </PerReport>
              }
            />
            <Route
              path="/board-report/:reportId/sections"
              element={
                <PerReport>
                  <BoardSectionsPage />
                </PerReport>
              }
            />
            <Route
              path="/board-report/:reportId/preview"
              element={
                <PerReport>
                  <BoardPreviewPage />
                </PerReport>
              }
            />
            <Route
              path="/board-report/:reportId/report"
              element={
                <PerReport>
                  <BoardReportPage />
                </PerReport>
              }
            />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
