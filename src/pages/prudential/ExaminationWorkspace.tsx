import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, LayoutGrid, Loader2 } from 'lucide-react';
import {
  EXAMINATION_STAGES,
  stageLabel,
  useDataRequests,
  useExamination,
  useExaminationFindings,
  useExaminationReports,
  useExaminationScoping,
  useExaminationTeam,
  useExitMeeting,
  useTransitionExamination,
  useWorkpapers,
  type ExaminationStage,
} from '@/hooks/useExaminations';
import {
  businessActionLabel,
  currentStepKey,
  capturedSummary,
  deriveGuidance,
  isTerminalStage,
  phaseLabel,
  stagePhase,
} from '@/lib/examinationWorkflow';
import { ScopingMemoPanel } from '@/components/prudential/examination/ScopingMemoPanel';
import { TeamPanel } from '@/components/prudential/examination/TeamPanel';
import { DataRequestsPanel } from '@/components/prudential/examination/DataRequestsPanel';
import { WorkpapersPanel } from '@/components/prudential/examination/WorkpapersPanel';
import { ExitMeetingPanel } from '@/components/prudential/examination/ExitMeetingPanel';
import { ReportsPanel } from '@/components/prudential/examination/ReportsPanel';
import { FindingsPanel } from '@/components/prudential/examination/FindingsPanel';
import { ExaminationTimeline } from '@/components/prudential/examination/ExaminationTimeline';
import { ExaminationStageActionsProvider } from '@/components/prudential/examination/ExaminationStageActions';
import { ExaminationOverview } from '@/components/prudential/examination/ExaminationOverview';

const ORDER: ExaminationStage[] = EXAMINATION_STAGES.map(s => s.value);

const STEP_TITLES: Record<string, string> = {
  team: 'Examination team',
  scoping: 'Scoping',
  'data-requests': 'Data requests',
  workpapers: 'Workpapers',
  'exit-meeting': 'Exit meeting',
  reports: 'Reports',
  findings: 'Findings and remediation',
};

export default function ExaminationWorkspace() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { data: exam, isLoading } = useExamination(id);
  const transition = useTransitionExamination(id);

  // Data used for the overview counters and guidance — all existing hooks.
  const { data: scoping } = useExaminationScoping(id);
  const { data: team = [] } = useExaminationTeam(id);
  const { data: dataRequests = [] } = useDataRequests(id);
  const { data: workpapers = [] } = useWorkpapers(id);
  const { data: findings = [] } = useExaminationFindings(id);
  const { data: reports = [] } = useExaminationReports(id);
  const { data: exitMeeting } = useExitMeeting(id);

  const nextStage = useMemo(() => {
    if (!exam?.stage) return null;
    const idx = ORDER.indexOf(exam.stage as ExaminationStage);
    return idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  }, [exam?.stage]);

  const terminal = isTerminalStage(exam?.stage);
  const readOnly = !!terminal;

  const stageActionsValue = useMemo(() => {
    if (terminal) return null;
    return {
      nextActionLabel: nextStage ? businessActionLabel(nextStage) : null,
      blockers: guidance.blockers,
      advance: async () => { if (nextStage) await transition.mutateAsync({ to_stage: nextStage }); },
      cancel: async () => { await transition.mutateAsync({ to_stage: 'cancelled' as ExaminationStage }); },
      pending: transition.isPending,
    };
  }, [terminal, nextStage, transition, guidance]);

  const guidance = useMemo(
    () => deriveGuidance({
      stage: exam?.stage,
      nextStage,
      scoping,
      team,
      dataRequests,
      workpapers,
      findings,
      reports,
      exitMeeting,
    }),
    [exam?.stage, nextStage, scoping, team, dataRequests, workpapers, findings, reports, exitMeeting],
  );

  const stepKey = currentStepKey(exam?.stage);
  const section = params.get('section') || 'overview';
  const showAll = params.get('all') === '1';

  const setSection = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('section', next);
    setParams(p, { replace: true });
  };

  const toggleAll = () => {
    const p = new URLSearchParams(params);
    if (showAll) p.delete('all'); else p.set('all', '1');
    setParams(p, { replace: true });
  };

  const captured = useMemo(
    () => capturedSummary({ scoping, team, dataRequests, workpapers, findings, reports, exitMeeting }),
    [scoping, team, dataRequests, workpapers, findings, reports, exitMeeting],
  );

  const openSection = (key: string) => {
    const tab = key === 'reports' ? 'documents' : key;
    const advanced = ['scoping', 'team', 'data-requests', 'workpapers', 'exit-meeting'];
    const p = new URLSearchParams(params);
    p.set('section', tab);
    if (advanced.includes(tab)) p.set('all', '1');
    setParams(p, { replace: true });
  };

  const counts = useMemo(() => ({
    openFindings: findings.filter((f: any) => f.status !== 'closed').length,
    outstandingRequests: dataRequests.filter((r: any) => r.status !== 'received').length,
    workpapersPendingReview: workpapers.filter((w: any) => !w.reviewed_at).length,
    openRemediation: findings.filter(
      (f: any) => f.action && f.action.status !== 'completed' && f.action.status !== 'closed',
    ).length,
  }), [findings, dataRequests, workpapers]);

  const leadExaminer = (team.find((t: any) => t.team_role === 'lead_examiner') as any)?.member_name ?? null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  if (!exam) {
    return (
      <DashboardLayout>
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Examination not found.</CardContent></Card>
      </DashboardLayout>
    );
  }

  const currentStepPanel = () => {
    switch (stepKey) {
      case 'team': return <TeamPanel examinationId={exam.id} readOnly={readOnly} />;
      case 'scoping': return <ScopingMemoPanel examinationId={exam.id} readOnly={readOnly} />;
      case 'data-requests': return <DataRequestsPanel examinationId={exam.id} readOnly={readOnly} />;
      case 'workpapers': return <WorkpapersPanel examinationId={exam.id} readOnly={readOnly} />;
      case 'exit-meeting': return <ExitMeetingPanel examinationId={exam.id} readOnly={readOnly} />;
      case 'reports': return <ReportsPanel examinationId={exam.id} readOnly={readOnly} />;
      default: return <FindingsPanel examinationId={exam.id} readOnly={readOnly} />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link to="/prudential/examinations"><ArrowLeft className="h-4 w-4 mr-1" />Examinations</Link>
            </Button>
            <h1 className="text-2xl font-bold">{exam.title}</h1>
            <p className="text-sm text-muted-foreground">
              {exam.reference} · {exam.licensee?.name || 'Unknown entity'} ·{' '}
              <span className="capitalize">{String(exam.examination_type).replace('_', ' ')}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
              {exam.stage === 'cancelled' ? 'Cancelled' : phaseLabel(stagePhase(exam.stage))}
            </Badge>
            <Badge variant="outline">{stageLabel(exam.stage)}</Badge>
            <Button size="sm" variant="outline" onClick={toggleAll}>
              <LayoutGrid className="h-4 w-4 mr-1" />
              {showAll ? 'Hide advanced sections' : 'View full examination workspace'}
            </Button>
          </div>
        </div>

        <ExaminationStageActionsProvider value={stageActionsValue}>
          <Tabs value={section} onValueChange={setSection}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="current">Current step</TabsTrigger>
              <TabsTrigger value="findings">Findings</TabsTrigger>
              <TabsTrigger value="documents">Documents &amp; reports</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              {showAll && <TabsTrigger value="scoping">Scoping</TabsTrigger>}
              {showAll && <TabsTrigger value="team">Team</TabsTrigger>}
              {showAll && <TabsTrigger value="data-requests">Data requests</TabsTrigger>}
              {showAll && <TabsTrigger value="workpapers">Workpapers</TabsTrigger>}
              {showAll && <TabsTrigger value="exit-meeting">Exit meeting</TabsTrigger>}
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <ExaminationOverview
                exam={exam}
                guidance={guidance}
                currentStepTitle={STEP_TITLES[stepKey]}
                onOpenCurrentStep={() => setSection('current')}
                onOpenSection={openSection}
                captured={captured}
                leadExaminer={leadExaminer}
                counts={counts}
                readOnly={readOnly}
              />
            </TabsContent>

            <TabsContent value="current" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Current step: <span className="font-medium text-foreground">{STEP_TITLES[stepKey]}</span>
              </p>
              {currentStepPanel()}
            </TabsContent>

            <TabsContent value="findings" className="mt-4"><FindingsPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
            <TabsContent value="documents" className="mt-4"><ReportsPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
            <TabsContent value="history" className="mt-4"><ExaminationTimeline examinationId={exam.id} /></TabsContent>

            {showAll && (
              <>
                <TabsContent value="scoping" className="mt-4"><ScopingMemoPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
                <TabsContent value="team" className="mt-4"><TeamPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
                <TabsContent value="data-requests" className="mt-4"><DataRequestsPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
                <TabsContent value="workpapers" className="mt-4"><WorkpapersPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
                <TabsContent value="exit-meeting" className="mt-4"><ExitMeetingPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
              </>
            )}
          </Tabs>
        </ExaminationStageActionsProvider>
      </div>
    </DashboardLayout>
  );
}
