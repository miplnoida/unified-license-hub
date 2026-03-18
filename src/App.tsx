import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RegulatorProvider } from "@/contexts/RegulatorContext";
import { lazy, Suspense } from "react";
import { isPreLicenseeAllowedRoute } from "@/hooks/useUserPermissions";

// ─── Loading fallback ───
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

// ─── Lazy-loaded pages ───
const Index = lazy(() => import("./pages/Index"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const FormDetail = lazy(() => import("./pages/FormDetail"));
const NewApplication = lazy(() => import("./pages/NewApplication"));

// Registration
const PreLicenseeRegistration = lazy(() => import("./pages/registration/PreLicenseeRegistration"));

// Applications
const ApplicationsList = lazy(() => import("./pages/applications/ApplicationsList"));
const ApplicationDetail = lazy(() => import("./pages/applications/ApplicationDetail"));

// Licenses
const LicensesList = lazy(() => import("./pages/licenses/LicensesList"));
const LicenseDetail = lazy(() => import("./pages/licenses/LicenseDetail"));

// Compliance
const ComplianceReturns = lazy(() => import("./pages/compliance/ComplianceReturns"));
const ReturnSubmission = lazy(() => import("./pages/compliance/ReturnSubmission"));

// Payments
const PaymentHistory = lazy(() => import("./pages/payments/PaymentHistory"));

// Complaints
const ComplaintsList = lazy(() => import("./pages/complaints/ComplaintsList"));

// Workflows
const WorkflowList = lazy(() => import("./pages/workflows/WorkflowList"));
const DelegationRules = lazy(() => import("./pages/delegation/DelegationRules"));

// Documents
const DocumentStore = lazy(() => import("./pages/documents/DocumentStore"));

// Notifications
const NotificationCenter = lazy(() => import("./pages/notifications/NotificationCenter"));

// Analytics & Reports
const AnalyticsDashboard = lazy(() => import("./pages/analytics/AnalyticsDashboard"));
const ReportsDashboard = lazy(() => import("./pages/reports/ReportsDashboard"));

// Admin
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const ManageWebUsers = lazy(() => import("./pages/admin/ManageWebUsers"));
const ManageLicensees = lazy(() => import("./pages/admin/ManageLicensees"));
const FormBuilder = lazy(() => import("./pages/admin/FormBuilder"));
const FormManagement = lazy(() => import("./pages/admin/FormManagement"));
const MasterConfiguration = lazy(() => import("./pages/admin/MasterConfiguration"));
const FeeManagement = lazy(() => import("./pages/admin/FeeManagement"));
const ReturnConfiguration = lazy(() => import("./pages/admin/ReturnConfiguration"));
const RegulatorManagement = lazy(() => import("./pages/admin/RegulatorManagement"));
const AdminHub = lazy(() => import("./pages/admin/AdminHub"));
const NotificationTemplates = lazy(() => import("./pages/admin/NotificationTemplates"));
const ComplaintTypes = lazy(() => import("./pages/admin/ComplaintTypes"));

const ViewReturns = lazy(() => import("./pages/returns-mgmt/ViewReturns"));

// Settings
const SettingsHub = lazy(() => import("./pages/settings/SettingsHub"));
const GeneralSettings = lazy(() => import("./pages/settings/GeneralSettings"));
const PaymentSettings = lazy(() => import("./pages/settings/PaymentSettings"));
const ScheduleSettings = lazy(() => import("./pages/settings/ScheduleSettings"));
const NotificationSettings = lazy(() => import("./pages/settings/NotificationSettings"));
const SecuritySettings = lazy(() => import("./pages/settings/SecuritySettings"));
const BrandingSettings = lazy(() => import("./pages/settings/BrandingSettings"));
const EmailSmsSettings = lazy(() => import("./pages/settings/EmailSmsSettings"));
const IntegrationSettings = lazy(() => import("./pages/settings/IntegrationSettings"));
const DataManagementSettings = lazy(() => import("./pages/settings/DataManagementSettings"));

// Account
const Profile = lazy(() => import("./pages/Profile"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));

// ─── Query Client with optimized defaults ───
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

/**
 * Protected route with pre-licensee access restriction.
 * Pre-licensee users can only access a limited set of routes.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/" replace />;

  // Pre-licensee users: restrict to allowed routes only
  if (user?.isPreLicensee && !isPreLicenseeAllowedRoute(location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/registration/pre-licensee" element={<PreLicenseeRegistration />} />
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
        <Route path="/admin/license-types" element={<P><ManageLicenses /></P>} />

        {/* Returns Management */}
        <Route path="/returns-management" element={<P><ViewReturns /></P>} />

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
        <Route path="/admin/forms" element={<P><FormManagement /></P>} />
        <Route path="/admin/forms/pre-license" element={<Navigate to="/admin/forms?tab=pre_license" replace />} />
        <Route path="/admin/forms/post-license" element={<Navigate to="/admin/forms?tab=post_license" replace />} />
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
        <Route path="/admin" element={<P><AdminHub /></P>} />
        <Route path="/admin/regulators" element={<P><RegulatorManagement /></P>} />
        <Route path="/admin/licensees" element={<P><ManageLicensees /></P>} />
        <Route path="/admin/users" element={<P><ManageWebUsers /></P>} />
        <Route path="/admin/roles" element={<P><RoleManagement /></P>} />
        <Route path="/admin/audit-logs" element={<P><AuditLogs /></P>} />
        <Route path="/admin/notification-templates" element={<P><NotificationTemplates /></P>} />
        <Route path="/admin/complaint-types" element={<P><ComplaintTypes /></P>} />

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
    </Suspense>
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
