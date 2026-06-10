import { Route, Navigate } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';
import { AdminRoute, ModuleRoute } from '@/components/auth/RouteGuards';
import type { PermissionModule } from '@/lib/permissionModules';
import ReturnDetail from '@/pages/returns-mgmt/ReturnDetail';
import ViewReturns from '@/pages/returns-mgmt/ViewReturns';

const AdminHub = lazy(() => import('@/pages/admin/AdminHub'));
const FormManagement = lazy(() => import('@/pages/admin/FormManagement'));
const FormBuilder = lazy(() => import('@/pages/admin/FormBuilder'));
const MasterConfiguration = lazy(() => import('@/pages/admin/MasterConfiguration'));
const MasterDataManagement = lazy(() => import('@/pages/admin/MasterDataManagement'));
const FeeManagement = lazy(() => import('@/pages/admin/FeeManagement'));
const ReturnConfiguration = lazy(() => import('@/pages/admin/ReturnConfiguration'));
const RegulatorManagement = lazy(() => import('@/pages/admin/RegulatorManagement'));
const ManageLicensees = lazy(() => import('@/pages/admin/ManageLicensees'));
const LicenseeDetailPage = lazy(() => import('@/pages/admin/LicenseeDetail'));
const UserManagement = lazy(() => import('@/pages/admin/UserManagement'));
const ManageWebUsers = lazy(() => import('@/pages/admin/ManageWebUsers'));
const RoleManagement = lazy(() => import('@/pages/admin/RoleManagement'));
const AuditLogs = lazy(() => import('@/pages/admin/AuditLogs'));
const NotificationTemplates = lazy(() => import('@/pages/admin/NotificationTemplates'));
const ComplaintTypes = lazy(() => import('@/pages/admin/ComplaintTypes'));
const ApprovedLicensees = lazy(() => import('@/pages/admin/ApprovedLicensees'));
const RegistrationFormBuilder = lazy(() => import('@/pages/admin/RegistrationFormBuilder'));
const RegistrationFormPreviewPage = lazy(() => import('@/pages/admin/RegistrationFormPreviewPage'));
const PpocManagement = lazy(() => import('@/pages/admin/PpocManagement'));
const RegistrationReview = lazy(() => import('@/pages/admin/RegistrationReview'));

// Returns Management - Admin
const ReturnTypesPage = lazy(() => import('@/pages/admin/returns/ReturnTypesPage'));
const ReturnConfigsPage = lazy(() => import('@/pages/admin/returns/ReturnConfigsPage'));
const CutoffConfigPage = lazy(() => import('@/pages/admin/returns/CutoffConfigPage'));
const DueDatesPage = lazy(() => import('@/pages/admin/returns/DueDatesPage'));
const LateFeesPage = lazy(() => import('@/pages/admin/returns/LateFeesPage'));
const NotifTemplatesPage = lazy(() => import('@/pages/admin/returns/NotifTemplatesPage'));
const NotifLogPage = lazy(() => import('@/pages/admin/returns/NotifLogPage'));
const ScheduleCalendarPage = lazy(() => import('@/pages/admin/returns/ScheduleCalendarPage'));

function A({ children }: { children: React.ReactNode }) {
  return <P><AdminRoute>{children}</AdminRoute></P>;
}

/** Admin route + dynamic module permission check */
function M({ module, children }: { module: PermissionModule; children: React.ReactNode }) {
  return <P><ModuleRoute module={module}>{children}</ModuleRoute></P>;
}

export const adminRoutes = (
  <>
    <Route path="/admin" element={<A><AdminHub /></A>} />

    <Route path="/admin/forms" element={<M module="form_management"><FormManagement /></M>} />
    <Route path="/admin/forms/pre-license" element={<Navigate to="/admin/forms?tab=pre_license" replace />} />
    <Route path="/admin/forms/post-license" element={<Navigate to="/admin/forms?tab=post_license" replace />} />
    <Route path="/admin/forms/create" element={<M module="form_management"><FormBuilder /></M>} />

    <Route path="/admin/masters" element={<Navigate to="/admin/masters/sectors" replace />} />
    <Route path="/admin/masters/sectors" element={<M module="settings"><MasterConfiguration /></M>} />
    <Route path="/admin/masters/sub-sectors" element={<M module="settings"><MasterConfiguration /></M>} />
    <Route path="/admin/masters/categories" element={<M module="settings"><MasterConfiguration /></M>} />
    <Route path="/admin/masters/services" element={<M module="settings"><MasterConfiguration /></M>} />

    <Route path="/admin/master-data" element={<M module="settings"><MasterDataManagement /></M>} />
    <Route path="/admin/fees" element={<M module="fee_management"><FeeManagement /></M>} />
    <Route path="/admin/return-config" element={<M module="returns_management"><ReturnConfiguration /></M>} />
    <Route path="/admin/regulators" element={<M module="settings"><RegulatorManagement /></M>} />
    <Route path="/admin/licensees" element={<M module="license_management"><ManageLicensees /></M>} />
    <Route path="/admin/licensees/:id" element={<M module="license_management"><LicenseeDetailPage /></M>} />
    <Route path="/admin/users" element={<M module="user_management"><UserManagement /></M>} />
    <Route path="/admin/web-users" element={<M module="user_management"><ManageWebUsers /></M>} />
    <Route path="/admin/roles" element={<M module="role_management"><RoleManagement /></M>} />
    <Route path="/admin/audit-logs" element={<M module="settings"><AuditLogs /></M>} />
    <Route path="/admin/notification-templates" element={<M module="settings"><NotificationTemplates /></M>} />
    <Route path="/admin/complaint-types" element={<M module="complaint_management"><ComplaintTypes /></M>} />
    <Route path="/admin/approved-licensees" element={<M module="license_management"><ApprovedLicensees /></M>} />
    <Route path="/admin/registration-forms" element={<M module="form_management"><RegistrationFormBuilder /></M>} />
    <Route path="/admin/registration-forms/preview" element={<M module="form_management"><RegistrationFormPreviewPage /></M>} />
    <Route path="/admin/ppoc-mappings" element={<M module="license_management"><PpocManagement /></M>} />
    <Route path="/admin/registration-review" element={<M module="license_management"><RegistrationReview /></M>} />

    {/* Returns Management - Admin */}
    <Route path="/admin/returns/queue" element={<M module="returns_management"><ViewReturns /></M>} />
    <Route path="/admin/returns/queue/:id" element={<M module="returns_management"><ReturnDetail /></M>} />
    <Route path="/admin/returns/types" element={<M module="returns_management"><ReturnTypesPage /></M>} />
    <Route path="/admin/returns/configurations" element={<M module="returns_management"><ReturnConfigsPage /></M>} />
    <Route path="/admin/returns/cutoff" element={<M module="returns_management"><CutoffConfigPage /></M>} />
    <Route path="/admin/returns/due-dates" element={<M module="returns_management"><DueDatesPage /></M>} />
    <Route path="/admin/returns/late-fees" element={<M module="returns_management"><LateFeesPage /></M>} />
    <Route path="/admin/returns/notifications/templates" element={<M module="returns_management"><NotifTemplatesPage /></M>} />
    <Route path="/admin/returns/notifications/log" element={<M module="returns_management"><NotifLogPage /></M>} />
    <Route path="/admin/returns/schedule" element={<M module="returns_management"><ScheduleCalendarPage /></M>} />
  </>
);
