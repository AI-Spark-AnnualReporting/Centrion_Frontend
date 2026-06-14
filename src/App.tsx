import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginPage, SignupPage } from "./components/auth/AuthPages";
import { ChangePasswordPage } from "./components/auth/ChangePasswordPage";
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
import CoverageMapPage from "./pages/quarterly/CoverageMapPage";
import GapQuestionsPage from "./pages/quarterly/GapQuestionsPage";
import QuarterlyPreviewPage from "./pages/quarterly/QuarterlyPreviewPage";

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
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/reports/processing" element={<ProcessingPage />} />
          <Route path="/reports/:reportId" element={<ReportDetailPage />} />
          <Route path="/quarterly-report/:reportId/coverage" element={<CoverageMapPage />} />
          <Route path="/quarterly-report/:reportId/gaps" element={<GapQuestionsPage />} />
          <Route path="/quarterly-report/:reportId/preview" element={<QuarterlyPreviewPage />} />
          <Route path="/kpi" element={<KPIPage />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/ai" element={<AIPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          <Route path="/comms" element={<CommsPage />} />
          <Route path="/stakeholders" element={<StakeholdersPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
