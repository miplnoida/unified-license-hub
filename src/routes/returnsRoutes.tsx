import { Navigate, Route, useParams } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';
import { PortalRoute } from '@/components/auth/PortalRoute';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import { INTERNAL_ROLES } from '@/types/platform';
import { AuthLoadingScreen } from '@/components/shared/AuthLoadingScreen';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { objectRoute } from '@/lib/routes/objectRoutes';

const EntityReturnsDashboard = lazy(() => import('@/pages/entity/returns/EntityReturnsDashboard'));
const MyReturnsPage = lazy(() => import('@/pages/entity/returns/MyReturnsPage'));

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

function FilingRouteByAudience() {
  const { filingId } = useParams<{ filingId: string }>();
  const { user, session, loading, isFullyAuthenticated, mfaStatus } = useAuth();
  const { canonicalAudience, isLoading: permsLoading } = useUserDynamicPermissions();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/" replace />;
  if (!user) return <AuthLoadingScreen />;
  if (!isFullyAuthenticated) {
    return mfaStatus === 'pending'
      ? <Navigate to="/login?mfa=required" replace />
      : <AuthLoadingScreen />;
  }

  if (!filingId) return <Navigate to="/entity/returns" replace />;

  const legacyExternalRole = user.role === 'applicant' || user.role === 'pre_licensee' || user.role === 'licensee_primary' || user.role === 'licensee_secondary';
  if (canonicalAudience === 'external' || legacyExternalRole) {
    return <Navigate to={objectRoute.returnFiling(filingId, 'external')} replace />;
  }

  if (permsLoading) return <AuthLoadingScreen />;

  return (
    <ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}>
      <FilingDetail />
    </ModuleRoute>
  );
}

export const returnsRoutes = (
  <>
    <Route path="/entity/returns/dashboard" element={<P><PortalRoute area="returns" capability="can_view_status"><EntityReturnsDashboard /></PortalRoute></P>} />
    <Route path="/entity/returns" element={<P><PortalRoute area="returns" capability="can_view_status"><EntityReturnsWorkspace /></PortalRoute></P>} />
    <Route path="/entity/returns/filings/:filingId" element={<P><PortalRoute area="returns" capability="can_view_status"><EntityFilingWorkspace /></PortalRoute></P>} />
    {/* EPR-01 — HISTORY_ONLY: read-only register of pre-canonical filings. */}
    <Route path="/entity/returns/legacy" element={<P><PortalRoute area="returns" capability="can_view_status"><MyReturnsPage /></PortalRoute></P>} />
    {/* EPR-01 — the legacy external create/fill/view spine is RETIRED. Filings are
        opened from an obligation period in the canonical workspace, and old
        bookmarks resolve server-side to the canonical filing. */}
    <Route path="/entity/returns/new" element={<Navigate to="/entity/returns" replace />} />
    <Route path="/entity/returns/:id/fill" element={<P><PortalRoute area="returns" capability="can_submit_returns"><LegacyReturnFilingRedirect target="external" /></PortalRoute></P>} />
    <Route path="/entity/returns/:id/view" element={<P><PortalRoute area="returns" capability="can_view_status"><LegacyReturnFilingRedirect target="external" /></PortalRoute></P>} />

    <Route path="/returns/queue" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><ReturnsFilingQueue /></ModuleRoute></P>} />
    <Route path="/returns/obligations" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><EntityObligationsWorkbench /></ModuleRoute></P>} />
    <Route path="/returns/calendar" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><EntityReportingCalendar /></ModuleRoute></P>} />
    <Route path="/returns/filings/legacy/:legacyId" element={<P><ModuleRoute module="returns_management" allowedRoles={INTERNAL_ROLES}><LegacyReturnFilingRedirect /></ModuleRoute></P>} />
    <Route path="/returns/filings/:filingId" element={<P><FilingRouteByAudience /></P>} />
    {/* Configuration is governed and lives under Administration → Regulatory Data Model. */}
    <Route path="/returns/configuration" element={<Navigate to="/admin/regulatory-data-model/reporting" replace />} />
  </>
);
