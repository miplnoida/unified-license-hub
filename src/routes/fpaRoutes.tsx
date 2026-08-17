import { Route } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';
import { ModuleRoute } from '@/components/auth/RouteGuards';
import type { PermissionModule } from '@/lib/permissionModules';

// Every /fpa/* screen requires the fit_and_proper module permission — previously
// these routes only checked session auth (P), so any authenticated user could
// open any F&P screen directly by URL; only silent RLS (no logged denial)
// stopped them.
function M({ children }: { children: React.ReactNode }) {
  const module: PermissionModule = 'fit_and_proper';
  return <P><ModuleRoute module={module}>{children}</ModuleRoute></P>;
}

const FpaDashboard = lazy(() => import('@/pages/fpa/FpaDashboard'));
const FpaProcessList = lazy(() => import('@/pages/fpa/FpaProcessList'));
const FpaIndividuals = lazy(() => import('@/pages/fpa/FpaIndividuals'));
const FpaIndividualProfile = lazy(() => import('@/pages/fpa/FpaIndividualProfile'));
const FpaInitiation = lazy(() => import('@/pages/fpa/FpaInitiation'));
const FpaDeclarations = lazy(() => import('@/pages/fpa/FpaDeclarations'));
const FpaScreening = lazy(() => import('@/pages/fpa/FpaScreening'));
const FpaManualTasks = lazy(() => import('@/pages/fpa/FpaManualTasks'));
const FpaManualTaskDetail = lazy(() => import('@/pages/fpa/FpaManualTaskDetail'));
const FpaFindings = lazy(() => import('@/pages/fpa/FpaFindings'));
const FpaFindingDetail = lazy(() => import('@/pages/fpa/FpaFindingDetail'));
const FpaTrends = lazy(() => import('@/pages/fpa/FpaTrends'));
const FpaAiAnalysis = lazy(() => import('@/pages/fpa/FpaAiAnalysis'));
const FpaSectorRules = lazy(() => import('@/pages/fpa/FpaSectorRules'));
const FpaDeterminations = lazy(() => import('@/pages/fpa/FpaDeterminations'));
const FpaCommittee = lazy(() => import('@/pages/fpa/FpaCommittee'));
const FpaConditions = lazy(() => import('@/pages/fpa/FpaConditions'));
const FpaAppeals = lazy(() => import('@/pages/fpa/FpaAppeals'));
const FpaMonitoring = lazy(() => import('@/pages/fpa/FpaMonitoring'));
const FpaNotificationLog = lazy(() => import('@/pages/fpa/FpaNotificationLog'));
const FpaScheduler = lazy(() => import('@/pages/fpa/FpaScheduler'));
const FpaInitiationLog = lazy(() => import('@/pages/fpa/FpaInitiationLog'));
const FpaInvitationTracker = lazy(() => import('@/pages/fpa/FpaInvitationTracker'));
const FpaAssessmentRedirect = lazy(() => import('@/pages/fpa/FpaAssessmentRedirect'));
const FpaEntityRedirect = lazy(() => import('@/pages/fpa/FpaEntityRedirect'));
const FpaTraining = lazy(() => import('@/pages/fpa/FpaTraining'));

export const fpaRoutes = (
  <>
    <Route path="/fpa" element={<M><FpaDashboard /></M>} />
    <Route path="/fpa/processes" element={<M><FpaProcessList /></M>} />
    <Route path="/fpa/individuals" element={<M><FpaIndividuals /></M>} />
    <Route path="/fpa/individuals/:id" element={<M><FpaIndividualProfile /></M>} />
    <Route path="/fpa/initiation" element={<M><FpaInitiation /></M>} />
    <Route path="/fpa/declarations" element={<M><FpaDeclarations /></M>} />
    <Route path="/fpa/screening" element={<M><FpaScreening /></M>} />
    <Route path="/fpa/manual-tasks" element={<M><FpaManualTasks /></M>} />
    <Route path="/fpa/manual-tasks/:id" element={<M><FpaManualTaskDetail /></M>} />
    <Route path="/fpa/findings" element={<M><FpaFindings /></M>} />
    <Route path="/fpa/findings/:id" element={<M><FpaFindingDetail /></M>} />
    <Route path="/fpa/trends" element={<M><FpaTrends /></M>} />
    <Route path="/fpa/ai-analysis" element={<M><FpaAiAnalysis /></M>} />
    <Route path="/fpa/sector-rules" element={<M><FpaSectorRules /></M>} />
    <Route path="/fpa/determinations" element={<M><FpaDeterminations /></M>} />
    <Route path="/fpa/committee" element={<M><FpaCommittee /></M>} />
    <Route path="/fpa/conditions" element={<M><FpaConditions /></M>} />
    <Route path="/fpa/appeals" element={<M><FpaAppeals /></M>} />
    <Route path="/fpa/monitoring" element={<M><FpaMonitoring /></M>} />
    <Route path="/fpa/notifications" element={<M><FpaNotificationLog /></M>} />
    <Route path="/fpa/scheduler" element={<M><FpaScheduler /></M>} />
    <Route path="/fpa/initiation-log" element={<M><FpaInitiationLog /></M>} />
    <Route path="/fpa/invitations" element={<M><FpaInvitationTracker /></M>} />
    <Route path="/fpa/assessments/:id" element={<M><FpaAssessmentRedirect /></M>} />
    <Route path="/fpa/entity/:type/:id" element={<M><FpaEntityRedirect /></M>} />
    <Route path="/fpa/training" element={<M><FpaTraining /></M>} />
  </>
);
