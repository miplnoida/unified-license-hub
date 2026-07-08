import { Route } from 'react-router-dom';
import { lazyWithRetry as lazy } from '@/lib/lazyWithRetry';
import { P } from '@/routes/routeHelpers';

const FpaDashboard = lazy(() => import('@/pages/fpa/FpaDashboard'));
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

export const fpaRoutes = (
  <>
    <Route path="/fpa" element={<P><FpaDashboard /></P>} />
    <Route path="/fpa/individuals" element={<P><FpaIndividuals /></P>} />
    <Route path="/fpa/individuals/:id" element={<P><FpaIndividualProfile /></P>} />
    <Route path="/fpa/initiation" element={<P><FpaInitiation /></P>} />
    <Route path="/fpa/declarations" element={<P><FpaDeclarations /></P>} />
    <Route path="/fpa/screening" element={<P><FpaScreening /></P>} />
    <Route path="/fpa/manual-tasks" element={<P><FpaManualTasks /></P>} />
    <Route path="/fpa/manual-tasks/:id" element={<P><FpaManualTaskDetail /></P>} />
    <Route path="/fpa/findings" element={<P><FpaFindings /></P>} />
    <Route path="/fpa/findings/:id" element={<P><FpaFindingDetail /></P>} />
    <Route path="/fpa/trends" element={<P><FpaTrends /></P>} />
    <Route path="/fpa/ai-analysis" element={<P><FpaAiAnalysis /></P>} />
    <Route path="/fpa/sector-rules" element={<P><FpaSectorRules /></P>} />
    <Route path="/fpa/determinations" element={<P><FpaDeterminations /></P>} />
    <Route path="/fpa/committee" element={<P><FpaCommittee /></P>} />
    <Route path="/fpa/conditions" element={<P><FpaConditions /></P>} />
    <Route path="/fpa/appeals" element={<P><FpaAppeals /></P>} />
    <Route path="/fpa/monitoring" element={<P><FpaMonitoring /></P>} />
  </>
);
