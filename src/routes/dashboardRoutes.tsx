import { Route } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import { PortalRoute } from '@/components/auth/PortalRoute';
import type { PermissionModule } from '@/lib/permissionModules';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES } from '@/types/platform';
import type { PortalArea, PortalCapability } from '@/lib/portalAccess';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ApplicationsList = lazy(() => import('@/pages/applications/ApplicationsList'));
const ApplicationDetail = lazy(() => import('@/pages/applications/ApplicationDetail'));
const NewApplication = lazy(() => import('@/pages/NewApplication'));
const NewPostLicenseApplication = lazy(() => import('@/pages/NewPostLicenseApplication'));
const PostLicenseApplicationForms = lazy(() => import('@/pages/PostLicenseApplicationForms'));
const ApplicationForms = lazy(() => import('@/pages/ApplicationForms'));
const LicensesList = lazy(() => import('@/pages/licenses/LicensesList'));
const LicenseDetail = lazy(() => import('@/pages/licenses/LicenseDetail'));
const ComplianceReturns = lazy(() => import('@/pages/compliance/ComplianceReturns'));
const ReturnSubmission = lazy(() => import('@/pages/compliance/ReturnSubmission'));
const PaymentHistory = lazy(() => import('@/pages/payments/PaymentHistory'));
const PaymentDetail = lazy(() => import('@/pages/payments/PaymentDetail'));
const ComplaintsList = lazy(() => import('@/pages/complaints/ComplaintsList'));
const WorkflowList = lazy(() => import('@/pages/workflows/WorkflowList'));
const DelegationRules = lazy(() => import('@/pages/delegation/DelegationRules'));
const DocumentStore = lazy(() => import('@/pages/documents/DocumentStore'));
const NotificationCenter = lazy(() => import('@/pages/notifications/NotificationCenter'));
const AnalyticsDashboard = lazy(() => import('@/pages/analytics/AnalyticsDashboard'));
const ReportsDashboard = lazy(() => import('@/pages/reports/ReportsDashboard'));
const FormDetail = lazy(() => import('@/pages/FormDetail'));
const ViewReturns = lazy(() => import('@/pages/returns-mgmt/ViewReturns'));
const ReturnDetail = lazy(() => import('@/pages/returns-mgmt/ReturnDetail'));
const Profile = lazy(() => import('@/pages/Profile'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const FormPreview = lazy(() => import('@/pages/FormPreview'));
const ChangeActiveSector = lazy(() => import('@/pages/admin/ChangeActiveSector'));
const RegistrationStatusPage = lazy(() => import('@/pages/registration/RegistrationStatusPage'));

function M({ module, children, allowedRoles }: { module: PermissionModule; children: React.ReactNode; allowedRoles?: any }) {
  return <P><ModuleRoute module={module} allowedRoles={allowedRoles}>{children}</ModuleRoute></P>;
}

function EP({ area, capability, children }: { area: PortalArea; capability: PortalCapability | PortalCapability[]; children: React.ReactNode }) {
  return <P><PortalRoute area={area} capability={capability}>{children}</PortalRoute></P>;
}

function ExternalPortalOrModule({
  module, area, capability, allowedRoles, children,
}: {
  module: PermissionModule;
  area: PortalArea;
  capability: PortalCapability | PortalCapability[];
  allowedRoles?: any;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (user && INTERNAL_ROLES.includes(user.role)) {
    return <P><ModuleRoute module={module} allowedRoles={allowedRoles}>{children}</ModuleRoute></P>;
  }
  return <EP area={area} capability={capability}>{children}</EP>;
}

export const dashboardRoutes = (
  <>
    <Route path="/dashboard" element={<P><Dashboard /></P>} />

    <Route path="/applications" element={<EP area="licensing" capability="can_view_status"><ApplicationsList /></EP>} />
    <Route path="/applications/new" element={<EP area="licensing" capability="can_submit"><NewApplication /></EP>} />
    <Route path="/applications/:id/continue" element={<EP area="licensing" capability={["can_submit", "can_respond_rfi"]}><NewApplication /></EP>} />
    <Route path="/applications/queue" element={<M module="application_management"><ApplicationsList /></M>} />
    <Route path="/applications/:id" element={<EP area="licensing" capability={["can_view_status", "can_respond_rfi"]}><ApplicationDetail /></EP>} />
    <Route path="/applications/:applicationId/forms" element={<EP area="licensing" capability={["can_submit", "can_respond_rfi"]}><ApplicationForms /></EP>} />

    <Route path="/pre-license/new" element={<EP area="licensing" capability="can_submit"><NewApplication /></EP>} />
    <Route path="/post-license/new" element={<EP area="licensing" capability="can_submit"><NewPostLicenseApplication /></EP>} />
    <Route path="/post-licensee/applications/:applicationId/forms" element={<EP area="licensing" capability={["can_submit", "can_respond_rfi"]}><PostLicenseApplicationForms /></EP>} />

    <Route path="/licenses" element={<EP area="licensing" capability="can_view_status"><LicensesList /></EP>} />
    <Route path="/licenses/:id" element={<EP area="licensing" capability="can_view_status"><LicenseDetail /></EP>} />

    <Route path="/returns-management" element={<M module="returns_management"><ViewReturns /></M>} />
    <Route path="/returns-management/:id" element={<M module="returns_management"><ReturnDetail /></M>} />

    <Route path="/compliance/returns" element={<EP area="returns" capability="can_view_status"><ComplianceReturns /></EP>} />
    <Route path="/compliance/returns/submit" element={<EP area="returns" capability="can_submit_returns"><ReturnSubmission /></EP>} />

    <Route path="/payments" element={<EP area="licensing" capability="can_view_status"><PaymentHistory /></EP>} />
    <Route path="/payments/:id" element={<EP area="licensing" capability="can_view_status"><PaymentDetail /></EP>} />
    <Route path="/complaints" element={<ExternalPortalOrModule module="complaint_management" area="complaints" capability={["can_submit_complaints", "can_view_status"]} allowedRoles={['super_admin', 'admin', 'supervisor', 'reviewer', 'licensee_primary', 'licensee_secondary', 'pre_licensee']}><ComplaintsList /></ExternalPortalOrModule>} />
    <Route path="/workflows" element={<M module="workflow_management"><WorkflowList /></M>} />
    <Route path="/delegation-rules" element={<M module="workflow_management"><DelegationRules /></M>} />
    <Route path="/documents" element={<P><DocumentStore /></P>} />
    <Route path="/notifications" element={<P><NotificationCenter /></P>} />
    <Route path="/analytics" element={<M module="report_management"><AnalyticsDashboard /></M>} />
    <Route path="/reports" element={<M module="report_management"><ReportsDashboard /></M>} />
    <Route path="/reports/*" element={<M module="report_management"><ReportsDashboard /></M>} />

    <Route path="/forms/:formId" element={<P><FormDetail /></P>} />

    <Route path="/profile" element={<P><Profile /></P>} />
    <Route path="/change-password" element={<P><ChangePassword /></P>} />
    <Route path="/preview/:versionId" element={<P><FormPreview /></P>} />
    <Route path="/change-sector" element={<P><ChangeActiveSector /></P>} />
    <Route path="/registration-status" element={<P><RegistrationStatusPage /></P>} />
  </>
);
