import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RegulatorProvider } from "@/contexts/RegulatorContext";
import { SiteSettingsProvider } from "@/contexts/SiteSettingsContext";
import { lazy, Suspense } from "react";
import { isPreLicenseeAllowedRoute } from "@/hooks/useUserPermissions";
import { AdminRoute, SettingsRoute, InternalRoute } from "@/components/auth/RouteGuards";

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
const PreLicenseeRegistration = lazy(() => import("./pages/registration/PreLicenseeRegistration"));
const RegistrationSuccess = lazy(() => import("./pages/registration/RegistrationSuccess"));
const ApplicationsList = lazy(() => import("./pages/applications/ApplicationsList"));
const ApplicationDetail = lazy(() => import("./pages/applications/ApplicationDetail"));
const LicensesList = lazy(() => import("./pages/licenses/LicensesList"));
const LicenseDetail = lazy(() => import("./pages/licenses/LicenseDetail"));
const ComplianceReturns = lazy(() => import("./pages/compliance/ComplianceReturns"));
const ReturnSubmission = lazy(() => import("./pages/compliance/ReturnSubmission"));
const PaymentHistory = lazy(() => import("./pages/payments/PaymentHistory"));
const ComplaintsList = lazy(() => import("./pages/complaints/ComplaintsList"));
const WorkflowList = lazy(() => import("./pages/workflows/WorkflowList"));
const DelegationRules = lazy(() => import("./pages/delegation/DelegationRules"));
const DocumentStore = lazy(() => import("./pages/documents/DocumentStore"));
const NotificationCenter = lazy(() => import("./pages/notifications/NotificationCenter"));
const AnalyticsDashboard = lazy(() => import("./pages/analytics/AnalyticsDashboard"));
const ReportsDashboard = lazy(() => import("./pages/reports/ReportsDashboard"));
const RoleManagement = lazy(() => import("./pages/admin/RoleManagement"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const UserManagement = lazy(() => import("./pages/admin/UserManagement"));
const ManageWebUsers = lazy(() => import("./pages/admin/ManageWebUsers"));
const ManageLicensees = lazy(() => import("./pages/admin/ManageLicensees"));
const LicenseeDetailPage = lazy(() => import("./pages/admin/LicenseeDetail"));
const FormBuilder = lazy(() => import("./pages/admin/FormBuilder"));
const FormManagement = lazy(() => import("./pages/admin/FormManagement"));
const MasterConfiguration = lazy(() => import("./pages/admin/MasterConfiguration"));
const MasterDataManagement = lazy(() => import("./pages/admin/MasterDataManagement"));
const FeeManagement = lazy(() => import("./pages/admin/FeeManagement"));
const ReturnConfiguration = lazy(() => import("./pages/admin/ReturnConfiguration"));
const RegulatorManagement = lazy(() => import("./pages/admin/RegulatorManagement"));
const AdminHub = lazy(() => import("./pages/admin/AdminHub"));
const NotificationTemplates = lazy(() => import("./pages/admin/NotificationTemplates"));
const ComplaintTypes = lazy(() => import("./pages/admin/ComplaintTypes"));
const ApprovedLicensees = lazy(() => import("./pages/admin/ApprovedLicensees"));
const RegistrationFormBuilder = lazy(() => import("./pages/admin/RegistrationFormBuilder"));
const ViewReturns = lazy(() => import("./pages/returns-mgmt/ViewReturns"));

// Returns Management - Admin
const ReturnTypesPage = lazy(() => import("./pages/admin/returns/ReturnTypesPage"));
const ReturnConfigsPage = lazy(() => import("./pages/admin/returns/ReturnConfigsPage"));
const CutoffConfigPage = lazy(() => import("./pages/admin/returns/CutoffConfigPage"));
const DueDatesPage = lazy(() => import("./pages/admin/returns/DueDatesPage"));
const LateFeesPage = lazy(() => import("./pages/admin/returns/LateFeesPage"));
const NotifTemplatesPage = lazy(() => import("./pages/admin/returns/NotifTemplatesPage"));
const NotifLogPage = lazy(() => import("./pages/admin/returns/NotifLogPage"));
const ScheduleCalendarPage = lazy(() => import("./pages/admin/returns/ScheduleCalendarPage"));

// Returns Management - Entity
const EntityReturnsDashboard = lazy(() => import("./pages/entity/returns/EntityReturnsDashboard"));
const MyReturnsPage = lazy(() => import("./pages/entity/returns/MyReturnsPage"));
const CreateReturnPage = lazy(() => import("./pages/entity/returns/CreateReturnPage"));
const FillReturnPage = lazy(() => import("./pages/entity/returns/FillReturnPage"));
const ViewReturnPage = lazy(() => import("./pages/entity/returns/ViewReturnPage"));

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
const ApplicationFormSettings = lazy(() => import("./pages/settings/ApplicationFormSettings"));
const Profile = lazy(() => import("./pages/Profile"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, gcTime: 300_000, retry: 2, retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000), refetchOnWindowFocus: false },
    mutations: { retry: 1 },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (user?.forcePasswordChange && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  if (user?.isPreLicensee && !isPreLicenseeAllowedRoute(location.pathname)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function P({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/registration/pre-licensee" element={<PreLicenseeRegistration />} />
        <Route path="/registration/success" element={<RegistrationSuccess />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/dashboard" element={<P><Dashboard /></P>} />

        <Route path="/applications" element={<P><ApplicationsList /></P>} />
        <Route path="/applications/new" element={<P><NewApplication /></P>} />
        <Route path="/applications/queue" element={<P><ApplicationsList /></P>} />
        <Route path="/applications/:id" element={<P><ApplicationDetail /></P>} />

        <Route path="/licenses" element={<P><LicensesList /></P>} />
        <Route path="/licenses/:id" element={<P><LicenseDetail /></P>} />

        <Route path="/returns-management" element={<P><ViewReturns /></P>} />

        <Route path="/compliance/returns" element={<P><ComplianceReturns /></P>} />
        <Route path="/compliance/returns/submit" element={<P><ReturnSubmission /></P>} />

        {/* Returns Management - Admin */}
        <Route path="/admin/returns/types" element={<P><AdminRoute><ReturnTypesPage /></AdminRoute></P>} />
        <Route path="/admin/returns/configurations" element={<P><AdminRoute><ReturnConfigsPage /></AdminRoute></P>} />
        <Route path="/admin/returns/cutoff" element={<P><AdminRoute><CutoffConfigPage /></AdminRoute></P>} />
        <Route path="/admin/returns/due-dates" element={<P><AdminRoute><DueDatesPage /></AdminRoute></P>} />
        <Route path="/admin/returns/late-fees" element={<P><AdminRoute><LateFeesPage /></AdminRoute></P>} />
        <Route path="/admin/returns/notifications/templates" element={<P><AdminRoute><NotifTemplatesPage /></AdminRoute></P>} />
        <Route path="/admin/returns/notifications/log" element={<P><AdminRoute><NotifLogPage /></AdminRoute></P>} />
        <Route path="/admin/returns/schedule" element={<P><AdminRoute><ScheduleCalendarPage /></AdminRoute></P>} />

        {/* Returns Management - Entity */}
        <Route path="/entity/returns/dashboard" element={<P><EntityReturnsDashboard /></P>} />
        <Route path="/entity/returns" element={<P><MyReturnsPage /></P>} />
        <Route path="/entity/returns/new" element={<P><CreateReturnPage /></P>} />
        <Route path="/entity/returns/:id/fill" element={<P><FillReturnPage /></P>} />
        <Route path="/entity/returns/:id/view" element={<P><ViewReturnPage /></P>} />

        <Route path="/payments" element={<P><PaymentHistory /></P>} />
        <Route path="/complaints" element={<P><ComplaintsList /></P>} />
        <Route path="/workflows" element={<P><WorkflowList /></P>} />
        <Route path="/delegation-rules" element={<P><DelegationRules /></P>} />
        <Route path="/documents" element={<P><DocumentStore /></P>} />
        <Route path="/notifications" element={<P><NotificationCenter /></P>} />
        <Route path="/analytics" element={<P><AnalyticsDashboard /></P>} />
        <Route path="/reports" element={<P><ReportsDashboard /></P>} />
        <Route path="/reports/*" element={<P><ReportsDashboard /></P>} />

        <Route path="/admin/forms" element={<P><AdminRoute><FormManagement /></AdminRoute></P>} />
        <Route path="/admin/forms/pre-license" element={<Navigate to="/admin/forms?tab=pre_license" replace />} />
        <Route path="/admin/forms/post-license" element={<Navigate to="/admin/forms?tab=post_license" replace />} />
        <Route path="/admin/forms/create" element={<P><AdminRoute><FormBuilder /></AdminRoute></P>} />
        <Route path="/forms/:formId" element={<P><FormDetail /></P>} />

        <Route path="/admin/masters" element={<Navigate to="/admin/masters/sectors" replace />} />
        <Route path="/admin/masters/sectors" element={<P><AdminRoute><MasterConfiguration /></AdminRoute></P>} />
        <Route path="/admin/masters/sub-sectors" element={<P><AdminRoute><MasterConfiguration /></AdminRoute></P>} />
        <Route path="/admin/masters/categories" element={<P><AdminRoute><MasterConfiguration /></AdminRoute></P>} />
        <Route path="/admin/masters/services" element={<P><AdminRoute><MasterConfiguration /></AdminRoute></P>} />

        <Route path="/admin/master-data" element={<P><AdminRoute><MasterDataManagement /></AdminRoute></P>} />
        <Route path="/admin/fees" element={<P><AdminRoute><FeeManagement /></AdminRoute></P>} />
        <Route path="/admin/return-config" element={<P><AdminRoute><ReturnConfiguration /></AdminRoute></P>} />

        <Route path="/admin" element={<P><AdminRoute><AdminHub /></AdminRoute></P>} />
        <Route path="/admin/regulators" element={<P><AdminRoute><RegulatorManagement /></AdminRoute></P>} />
        <Route path="/admin/licensees" element={<P><AdminRoute><ManageLicensees /></AdminRoute></P>} />
        <Route path="/admin/licensees/:id" element={<P><AdminRoute><LicenseeDetailPage /></AdminRoute></P>} />
        <Route path="/admin/users" element={<P><AdminRoute><UserManagement /></AdminRoute></P>} />
        <Route path="/admin/web-users" element={<P><AdminRoute><ManageWebUsers /></AdminRoute></P>} />
        <Route path="/admin/roles" element={<P><AdminRoute><RoleManagement /></AdminRoute></P>} />
        <Route path="/admin/audit-logs" element={<P><AdminRoute><AuditLogs /></AdminRoute></P>} />
        <Route path="/admin/notification-templates" element={<P><AdminRoute><NotificationTemplates /></AdminRoute></P>} />
        <Route path="/admin/complaint-types" element={<P><AdminRoute><ComplaintTypes /></AdminRoute></P>} />
        <Route path="/admin/approved-licensees" element={<P><AdminRoute><ApprovedLicensees /></AdminRoute></P>} />
        <Route path="/admin/registration-forms" element={<P><AdminRoute><RegistrationFormBuilder /></AdminRoute></P>} />

        <Route path="/settings" element={<P><SettingsRoute><SettingsHub /></SettingsRoute></P>} />
        <Route path="/settings/general" element={<P><SettingsRoute><GeneralSettings /></SettingsRoute></P>} />
        <Route path="/settings/payments" element={<P><SettingsRoute><PaymentSettings /></SettingsRoute></P>} />
        <Route path="/settings/schedule" element={<P><SettingsRoute><ScheduleSettings /></SettingsRoute></P>} />
        <Route path="/settings/notifications" element={<P><SettingsRoute><NotificationSettings /></SettingsRoute></P>} />
        <Route path="/settings/security" element={<P><SettingsRoute><SecuritySettings /></SettingsRoute></P>} />
        <Route path="/settings/branding" element={<P><SettingsRoute><BrandingSettings /></SettingsRoute></P>} />
        <Route path="/settings/email-sms" element={<P><SettingsRoute><EmailSmsSettings /></SettingsRoute></P>} />
        <Route path="/settings/integrations" element={<P><SettingsRoute><IntegrationSettings /></SettingsRoute></P>} />
        <Route path="/settings/data" element={<P><SettingsRoute><DataManagementSettings /></SettingsRoute></P>} />
        <Route path="/settings/applications" element={<P><SettingsRoute><ApplicationFormSettings /></SettingsRoute></P>} />

        <Route path="/profile" element={<P><Profile /></P>} />
        <Route path="/change-password" element={<P><ChangePassword /></P>} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <SiteSettingsProvider>
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
    </SiteSettingsProvider>
  </QueryClientProvider>
);

export default App;
