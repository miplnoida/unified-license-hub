import { Route } from 'react-router-dom';
import { lazy } from 'react';
import { P } from '@/routes/routeHelpers';

const EntityReturnsDashboard = lazy(() => import('@/pages/entity/returns/EntityReturnsDashboard'));
const MyReturnsPage = lazy(() => import('@/pages/entity/returns/MyReturnsPage'));
const CreateReturnPage = lazy(() => import('@/pages/entity/returns/CreateReturnPage'));
const FillReturnPage = lazy(() => import('@/pages/entity/returns/FillReturnPage'));
const ViewReturnPage = lazy(() => import('@/pages/entity/returns/ViewReturnPage'));

export const returnsRoutes = (
  <>
    <Route path="/entity/returns/dashboard" element={<P><EntityReturnsDashboard /></P>} />
    <Route path="/entity/returns" element={<P><MyReturnsPage /></P>} />
    <Route path="/entity/returns/new" element={<P><CreateReturnPage /></P>} />
    <Route path="/entity/returns/:id/fill" element={<P><FillReturnPage /></P>} />
    <Route path="/entity/returns/:id/view" element={<P><ViewReturnPage /></P>} />
  </>
);
