import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginPage, SignupPage } from "./components/auth/AuthPages";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";
import KPIPage from "./pages/KPIPage";
import AIPage from "./pages/AIPage";
import { CompliancePage, MeetingsPage, CommsPage, StakeholdersPage, DocsPage, QuestionsPage, ProfilePage } from "./pages/OtherPages";
import NotFound from "./pages/NotFound";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<SignupPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/reports" element={<ReportsPage />} />
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
