import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RegulatorProvider } from "@/contexts/RegulatorContext";

import Index from "./pages/Index";
import ForgotPassword from "./pages/ForgotPassword";
import NotFound from "./pages/NotFound";
import PlaceholderPage from "./pages/PlaceholderPage";
import Dashboard from "./pages/Dashboard";
import FormDetail from "./pages/FormDetail";
import NewApplication from "./pages/NewApplication";

// Applications
import ApplicationsList from "./pages/applications/ApplicationsList";
import ApplicationDetail from "./pages/applications/ApplicationDetail";

// Licenses
import LicensesList from "./pages/licenses/LicensesList";
import LicenseDetail from "./pages/licenses/LicenseDetail";

// Compliance
import ComplianceReturns from "./pages/compliance/ComplianceReturns";
import ReturnSubmission from "./pages/compliance/ReturnSubmission";

// Payments
import PaymentHistory from "./pages/payments/PaymentHistory";

// Complaints
import ComplaintsList from "./pages/complaints/ComplaintsList";

// Workflows
import WorkflowList from "./pages/workflows/WorkflowList";
import DelegationRules from "./pages/delegation/DelegationRules";

// Documents
import DocumentStore from "./pages/documents/DocumentStore";

// Notifications
import NotificationCenter from "./pages/notifications/NotificationCenter";

// Analytics & Reports
import AnalyticsDashboard from "./pages/analytics/AnalyticsDashboard";
import ReportsDashboard from "./pages/reports/ReportsDashboard";

// Admin
import RoleManagement from "./pages/admin/RoleManagement";
import AuditLogs from "./pages/admin/AuditLogs";
import UserManagement from "./pages/admin/UserManagement";
import FormBuilder from "./pages/admin/FormBuilder";
import PreLicenseForms from "./pages/admin/PreLicenseForms";
import PostLicenseForms from "./pages/admin/PostLicenseForms";
import MasterConfiguration from "./pages/admin/MasterConfiguration";
import FeeManagement from "./pages/admin/FeeManagement";
import ReturnConfiguration from "./pages/admin/ReturnConfiguration";
import RegulatorManagement from "./pages/admin/RegulatorManagement";
import AdminHub from "./pages/admin/AdminHub";
import NotificationTemplates from "./pages/admin/NotificationTemplates";

// Settings
import SettingsHub from "./pages/settings/SettingsHub";
import GeneralSettings from "./pages/settings/GeneralSettings";
import PaymentSettings from "./pages/settings/PaymentSettings";
import ScheduleSettings from "./pages/settings/ScheduleSettings";
import NotificationSettings from "./pages/settings/NotificationSettings";
import SecuritySettings from "./pages/settings/SecuritySettings";
import BrandingSettings from "./pages/settings/BrandingSettings";
import EmailSmsSettings from "./pages/settings/EmailSmsSettings";
import IntegrationSettings from "./pages/settings/IntegrationSettings";
import DataManagementSettings from "./pages/settings/DataManagementSettings";

// Account
import Profile from "./pages/Profile";
import ChangePassword from "./pages/ChangePassword";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Index />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* Dashboard */}
      <Route path="/dashboard" element={<P><Dashboard /></P>} />

      {/* Applications */}
      <Route path="/applications" element={<P><ApplicationsList /></P>} />
      <Route path="/applications/new" element={<P><NewApplication /></P>} />
      <Route path="/applications/queue" element={<P><ApplicationsList /></P>} />
      <Route path="/applications/:id" element={<P><ApplicationDetail /></P>} />

      {/* Licenses */}
      <Route path="/licenses" element={<P><LicensesList /></P>} />
      <Route path="/licenses/:id" element={<P><LicenseDetail /></P>} />

      {/* Compliance */}
      <Route path="/compliance/returns" element={<P><ComplianceReturns /></P>} />
      <Route path="/compliance/returns/submit" element={<P><ReturnSubmission /></P>} />

      {/* Payments */}
      <Route path="/payments" element={<P><PaymentHistory /></P>} />

      {/* Complaints */}
      <Route path="/complaints" element={<P><ComplaintsList /></P>} />

      {/* Workflows */}
      <Route path="/workflows" element={<P><WorkflowList /></P>} />
      <Route path="/delegation-rules" element={<P><DelegationRules /></P>} />

      {/* Documents */}
      <Route path="/documents" element={<P><DocumentStore /></P>} />

      {/* Notifications */}
      <Route path="/notifications" element={<P><NotificationCenter /></P>} />

      {/* Analytics */}
      <Route path="/analytics" element={<P><AnalyticsDashboard /></P>} />
      <Route path="/reports" element={<P><ReportsDashboard /></P>} />
      <Route path="/reports/*" element={<P><ReportsDashboard /></P>} />

      {/* Form Management */}
      <Route path="/admin/forms/pre-license" element={<P><PreLicenseForms /></P>} />
      <Route path="/admin/forms/post-license" element={<P><PostLicenseForms /></P>} />
      <Route path="/admin/forms/create" element={<P><FormBuilder /></P>} />
      <Route path="/forms/:formId" element={<P><FormDetail /></P>} />

      {/* Master Configuration */}
      <Route path="/admin/masters" element={<Navigate to="/admin/masters/sectors" replace />} />
      <Route path="/admin/masters/sectors" element={<P><MasterConfiguration /></P>} />
      <Route path="/admin/masters/sub-sectors" element={<P><MasterConfiguration /></P>} />
      <Route path="/admin/masters/categories" element={<P><MasterConfiguration /></P>} />
      <Route path="/admin/masters/services" element={<P><MasterConfiguration /></P>} />

      {/* Fee & Return Config */}
      <Route path="/admin/fees" element={<P><FeeManagement /></P>} />
      <Route path="/admin/return-config" element={<P><ReturnConfiguration /></P>} />

      {/* Administration */}
      <Route path="/admin/regulators" element={<P><RegulatorManagement /></P>} />
      <Route path="/admin/users" element={<P><UserManagement /></P>} />
      <Route path="/admin/roles" element={<P><RoleManagement /></P>} />
      <Route path="/admin/audit-logs" element={<P><AuditLogs /></P>} />

      {/* Settings */}
      <Route path="/settings" element={<P><SettingsHub /></P>} />
      <Route path="/settings/general" element={<P><GeneralSettings /></P>} />
      <Route path="/settings/payments" element={<P><PaymentSettings /></P>} />
      <Route path="/settings/schedule" element={<P><ScheduleSettings /></P>} />
      <Route path="/settings/notifications" element={<P><NotificationSettings /></P>} />
      <Route path="/settings/security" element={<P><SecuritySettings /></P>} />
      <Route path="/settings/branding" element={<P><BrandingSettings /></P>} />
      <Route path="/settings/email-sms" element={<P><EmailSmsSettings /></P>} />
      <Route path="/settings/integrations" element={<P><IntegrationSettings /></P>} />
      <Route path="/settings/data" element={<P><DataManagementSettings /></P>} />

      {/* Account */}
      <Route path="/profile" element={<P><Profile /></P>} />
      <Route path="/change-password" element={<P><ChangePassword /></P>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RegulatorProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </RegulatorProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
