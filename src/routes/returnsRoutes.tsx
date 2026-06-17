import { Route } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';
import { PortalRoute } from '@/components/auth/PortalRoute';

const EntityReturnsDashboard = lazy(() => import('@/pages/entity/returns/EntityReturnsDashboard'));
const MyReturnsPage = lazy(() => import('@/pages/entity/returns/MyReturnsPage'));
const CreateReturnPage = lazy(() => import('@/pages/entity/returns/CreateReturnPage'));
const FillReturnPage = lazy(() => import('@/pages/entity/returns/FillReturnPage'));
const ViewReturnPage = lazy(() => import('@/pages/entity/returns/ViewReturnPage'));

export const returnsRoutes = (
  <>
    <Route path="/entity/returns/dashboard" element={<P><PortalRoute area="returns" capability="can_view_status"><EntityReturnsDashboard /></PortalRoute></P>} />
    <Route path="/entity/returns" element={<P><PortalRoute area="returns" capability="can_view_status"><MyReturnsPage /></PortalRoute></P>} />
    <Route path="/entity/returns/new" element={<P><PortalRoute area="returns" capability="can_submit_returns"><CreateReturnPage /></PortalRoute></P>} />
    <Route path="/entity/returns/:id/fill" element={<P><PortalRoute area="returns" capability="can_submit_returns"><FillReturnPage /></PortalRoute></P>} />
    <Route path="/entity/returns/:id/view" element={<P><PortalRoute area="returns" capability="can_view_status"><ViewReturnPage /></PortalRoute></P>} />
  </>
);
