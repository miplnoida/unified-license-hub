import { Navigate, Route } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';
import { PortalRoute } from '@/components/auth/PortalRoute';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import { INTERNAL_ROLES } from '@/types/platform';

const EntityReturnsDashboard = lazy(() => import('@/pages/entity/returns/EntityReturnsDashboard'));
const MyReturnsPage = lazy(() => import('@/pages/entity/returns/MyReturnsPage'));
const CreateReturnPage = lazy(() => import('@/pages/entity/returns/CreateReturnPage'));
const FillReturnPage = lazy(() => import('@/pages/entity/returns/FillReturnPage'));
const ViewReturnPage = lazy(() => import('@/pages/entity/returns/ViewReturnPage'));

/* RDM-ENTITY-001 Wave C — canonical external (regulated entity) returns experience */
const EntityReturnsWorkspace = lazy(() => import('@/pages/entity/returns/canonical/EntityReturnsWorkspace'));
const EntityFilingWorkspace = lazy(() => import('@/pages/entity/returns/canonical/EntityFilingWorkspace'));

/* RDM-ENTITY-001 Wave C — canonical returns model screens */
const ReturnsFilingQueue = lazy(() => import('@/pages/returns-canonical/ReturnsFilingQueue'));
const EntityObligationsWorkbench = lazy(() => import('@/pages/returns-canonical/EntityObligationsWorkbench'));
const EntityReportingCalendar = lazy(() => import('@/pages/returns-canonical/EntityReportingCalendar'));
const FilingDetail = lazy(() => import('@/pages/returns-canonical/FilingDetail'));

/* EPR-01 — legacy `returns_filed.id` links resolve server-side to the canonical filing */
const LegacyReturnFilingRedirect = lazy(() => import('@/routes/LegacyReturnFilingRedirect'));

export const returnsRoutes = (
  <>
    <Route path="/entity/returns/dashboard" element={<P><PortalRoute area="returns" capability="can_view_status"><EntityReturnsDashboard /></PortalRoute></P>} />
    <Route path="/entity/returns" element={<P><PortalRoute area="returns" capability="can_view_status"><EntityReturnsWorkspace /></PortalRoute></P>} />
    <Route path="/entity/returns/filings/:filingId" element={<P><PortalRoute area="returns" capability="can_view_status"><EntityFilingWorkspace /></PortalRoute></P>} />
    {/* Legacy returns_filed screens retained for historical records */}
    <Route path="/entity/returns/legacy" element={<P><PortalRoute area="returns" capability="can_view_status"><MyReturnsPage /></PortalRoute></P>} />
    <Route path="/entity/returns/new" element={<P><PortalRoute area="returns" capability="can_submit_returns"><CreateReturnPage /></PortalRoute></P>} />
    <Route path="/entity/returns/:id/fill" element={<P><PortalRoute area="returns" capability="can_submit_returns"><FillReturnPage /></PortalRoute></P>} />
    <Route path="/entity/returns/:id/view" element={<P><PortalRoute area="returns" capability="can_view_status"><ViewReturnPage /></PortalRoute></P>} />

    <Route path="/returns/queue" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><ReturnsFilingQueue /></ModuleRoute></P>} />
    <Route path="/returns/obligations" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><EntityObligationsWorkbench /></ModuleRoute></P>} />
    <Route path="/returns/calendar" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><EntityReportingCalendar /></ModuleRoute></P>} />
    <Route path="/returns/filings/:filingId" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><FilingDetail /></ModuleRoute></P>} />
    {/* Configuration is governed and lives under Administration → Regulatory Data Model. */}
    <Route path="/returns/configuration" element={<Navigate to="/admin/regulatory-data-model/reporting" replace />} />
  </>
);
