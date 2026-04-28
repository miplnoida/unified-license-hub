import { Route } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import type { PermissionModule } from '@/lib/permissionModules';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const ApplicationsList = lazy(() => import('@/pages/applications/ApplicationsList'));
const ApplicationDetail = lazy(() => import('@/pages/applications/ApplicationDetail'));
const NewApplication = lazy(() => import('@/pages/NewApplication'));
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
const Profile = lazy(() => import('@/pages/Profile'));
const ChangePassword = lazy(() => import('@/pages/ChangePassword'));
const FormPreview = lazy(() => import('@/pages/FormPreview'));

function M({ module, children }: { module: PermissionModule; children: React.ReactNode }) {
  return <P><ModuleRoute module={module}>{children}</ModuleRoute></P>;
}

export const dashboardRoutes = (
  <>
    <Route path="/dashboard" element={<P><Dashboard /></P>} />

    <Route path="/applications" element={<P><ApplicationsList /></P>} />
    <Route path="/applications/new" element={<P><NewApplication /></P>} />
    <Route path="/applications/queue" element={<M module="application_management"><ApplicationsList /></M>} />
    <Route path="/applications/:id" element={<P><ApplicationDetail /></P>} />

    <Route path="/licenses" element={<P><LicensesList /></P>} />
    <Route path="/licenses/:id" element={<P><LicenseDetail /></P>} />

    <Route path="/returns-management" element={<M module="returns_management"><ViewReturns /></M>} />

    <Route path="/compliance/returns" element={<P><ComplianceReturns /></P>} />
    <Route path="/compliance/returns/submit" element={<P><ReturnSubmission /></P>} />

    <Route path="/payments" element={<P><PaymentHistory /></P>} />
    <Route path="/payments/:id" element={<P><PaymentDetail /></P>} />
    <Route path="/complaints" element={<M module="complaint_management"><ComplaintsList /></M>} />
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
  </>
);
