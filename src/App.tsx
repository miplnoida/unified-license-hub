import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import PreLicense from "./pages/PreLicense";
import PostLicense from "./pages/PostLicense";
import Returns from "./pages/Returns";
import NotFound from "./pages/NotFound";

// Settings
import GeneralSettings from "./pages/settings/GeneralSettings";
import ScheduleSettings from "./pages/settings/ScheduleSettings";
import PaymentSettings from "./pages/settings/PaymentSettings";

// Billing
import PreLicenseeBilling from "./pages/billing/PreLicenseeBilling";
import PostLicenseeBilling from "./pages/billing/PostLicenseeBilling";
import Penalties from "./pages/billing/Penalties";
import PaymentList from "./pages/PaymentList";

// Reports
import ReportPage from "./pages/reports/ReportPage";
import StatementReports from "./pages/StatementReports";

// Returns Management
import ManageStructures from "./pages/returns-mgmt/ManageStructures";
import ManageRules from "./pages/returns-mgmt/ManageRules";
import ManageValidations from "./pages/returns-mgmt/ManageValidations";
import ReturnGroups from "./pages/returns-mgmt/ReturnGroups";
import ManageScheduling from "./pages/returns-mgmt/ManageScheduling";
import ViewReturns from "./pages/returns-mgmt/ViewReturns";
import UploadReturns from "./pages/UploadReturns";

// Admin
import RoleManagement from "./pages/admin/RoleManagement";
import FormBuilder from "./pages/admin/FormBuilder";
import UserManagement from "./pages/admin/UserManagement";
import MasterConfiguration from "./pages/admin/MasterConfiguration";
import WorkflowConfig from "./pages/admin/WorkflowConfig";

// Standalone
import Profile from "./pages/Profile";
import Messages from "./pages/Messages";
import MailSms from "./pages/MailSms";
import Notifications from "./pages/Notifications";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Index />} />

      {/* Core */}
      <Route path="/dashboard" element={<P><Dashboard /></P>} />
      <Route path="/pre-license" element={<P><PreLicense /></P>} />
      <Route path="/post-license" element={<P><PostLicense /></P>} />
      <Route path="/returns" element={<P><Returns /></P>} />
      <Route path="/applications" element={<P><Dashboard /></P>} />

      {/* Billing */}
      <Route path="/billing/pre-licensee" element={<P><PreLicenseeBilling /></P>} />
      <Route path="/billing/post-licensee" element={<P><PostLicenseeBilling /></P>} />
      <Route path="/billing/penalties" element={<P><Penalties /></P>} />
      <Route path="/payments" element={<P><PaymentList /></P>} />

      {/* Returns Management */}
      <Route path="/returns-mgmt/structures" element={<P><ManageStructures /></P>} />
      <Route path="/returns-mgmt/rules" element={<P><ManageRules /></P>} />
      <Route path="/returns-mgmt/validations" element={<P><ManageValidations /></P>} />
      <Route path="/returns-mgmt/groups" element={<P><ReturnGroups /></P>} />
      <Route path="/returns-mgmt/scheduling" element={<P><ManageScheduling /></P>} />
      <Route path="/returns-mgmt/view" element={<P><ViewReturns /></P>} />
      <Route path="/upload-returns" element={<P><UploadReturns /></P>} />

      {/* Reports */}
      <Route path="/reports/consolidated" element={<P><ReportPage /></P>} />
      <Route path="/reports/insurance-internal" element={<P><ReportPage /></P>} />
      <Route path="/reports/cooperatives" element={<P><ReportPage /></P>} />
      <Route path="/reports/insurance" element={<P><ReportPage /></P>} />
      <Route path="/reports/money-services" element={<P><ReportPage /></P>} />
      <Route path="/reports/mutual-fund" element={<P><ReportPage /></P>} />
      <Route path="/reports/international-banks" element={<P><ReportPage /></P>} />
      <Route path="/reports/trust-company" element={<P><ReportPage /></P>} />
      <Route path="/reports/internal" element={<P><ReportPage /></P>} />
      <Route path="/reports/other" element={<P><ReportPage /></P>} />
      <Route path="/reports/payments" element={<P><ReportPage /></P>} />
      <Route path="/statement-reports" element={<P><StatementReports /></P>} />

      {/* Settings */}
      <Route path="/settings/general" element={<P><GeneralSettings /></P>} />
      <Route path="/settings/schedule" element={<P><ScheduleSettings /></P>} />
      <Route path="/settings/payment" element={<P><PaymentSettings /></P>} />

      {/* Admin */}
      <Route path="/admin/applications" element={<P><Dashboard /></P>} />
      <Route path="/admin/returns" element={<P><Dashboard /></P>} />
      <Route path="/admin/roles" element={<P><RoleManagement /></P>} />
      <Route path="/admin/users" element={<P><UserManagement /></P>} />
      <Route path="/admin/masters" element={<P><MasterConfiguration /></P>} />
      <Route path="/admin/forms" element={<P><FormBuilder /></P>} />
      <Route path="/admin/workflows" element={<P><WorkflowConfig /></P>} />

      {/* Standalone */}
      <Route path="/notifications" element={<P><Notifications /></P>} />
      <Route path="/messages" element={<P><Messages /></P>} />
      <Route path="/mail-sms" element={<P><MailSms /></P>} />
      <Route path="/profile" element={<P><Profile /></P>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
