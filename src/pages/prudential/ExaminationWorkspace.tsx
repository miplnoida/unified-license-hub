import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Check, Circle, LayoutGrid, Loader2 } from 'lucide-react';
import {
  EXAMINATION_STAGES,
  stageLabel,
  useDataRequests,
  useExamination,
  useExaminationCanonicalFindings,
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
  dependencies,
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
import { ExaminationResolveBanner } from '@/components/prudential/examination/ExaminationResolveBanner';
import { ExaminationOverview } from '@/components/prudential/examination/ExaminationOverview';
import { SupervisoryAiPanel } from '@/components/ai/SupervisoryAiPanel';
import { AiReportsTab } from '@/components/ai/report/AiReportsTab';



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
  const { data: legacyFindings = [] } = useExaminationFindings(id);
  const { data: canonicalFindings = [] } = useExaminationCanonicalFindings(id);
  /**
   * Workflow guidance and counters treat the canonical supervisory register as
   * the source of truth, with historical examination findings still counted so
   * older examinations cannot be reported with unresolved deficiencies.
   */
  const findings = useMemo(
    () => [
      ...canonicalFindings.map((f) => ({
        ...f,
        status: String(f.status).toLowerCase(),
        action: f.remediation[0]
          ? { status: String(f.remediation[0].status).toLowerCase() }
          : null,
      })),
      ...(legacyFindings as any[]),
    ],
    [canonicalFindings, legacyFindings],
  );
  const { data: reports = [] } = useExaminationReports(id);
  const { data: exitMeeting } = useExitMeeting(id);

  const nextStage = useMemo(() => {
    if (!exam?.stage) return null;
    const idx = ORDER.indexOf(exam.stage as ExaminationStage);
    return idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  }, [exam?.stage]);

  const terminal = isTerminalStage(exam?.stage);
  const readOnly = !!terminal;

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
  const fromCurrent = params.get('from') === 'current';

  const setSection = (next: string) => {
    const p = new URLSearchParams(params);
    p.set('section', next);
    p.delete('from');
    setParams(p, { replace: true });
  };

  /** Normalises navigation back onto the guided workflow after a transition. */
  const goToCurrent = () => {
    const p = new URLSearchParams(params);
    p.set('section', 'current');
    p.delete('from');
    setParams(p, { replace: true });
  };

  const openSection = (key: string, detour = false) => {
    const tab = key === 'reports' ? 'documents' : key;
    const advanced = ['scoping', 'team', 'data-requests', 'workpapers', 'exit-meeting'];
    const p = new URLSearchParams(params);
    p.set('section', tab);
    if (advanced.includes(tab)) p.set('all', '1');
    if (detour) p.set('from', 'current'); else p.delete('from');
    setParams(p, { replace: true });
  };

  const stageActionsValue = useMemo(() => {
    if (terminal) return null;
    return {
      nextActionLabel: nextStage ? businessActionLabel(nextStage, exam?.engagement_type ?? exam?.examination_type) : null,
      transitionBlockers: guidance.transitionBlockers,
      advance: async () => {
        if (!nextStage) return;
        await transition.mutateAsync({ to_stage: nextStage });
        goToCurrent();
      },
      cancel: async () => { await transition.mutateAsync({ to_stage: 'cancelled' as ExaminationStage }); },
      pending: transition.isPending,
      onOpenSection: (s: string) => openSection(s, true),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, nextStage, transition, guidance, params]);

  const captured = useMemo(
    () => capturedSummary({ scoping, team, dataRequests, workpapers, findings, reports, exitMeeting }),
    [scoping, team, dataRequests, workpapers, findings, reports, exitMeeting],
  );

  const deps = useMemo(
    () => dependencies({ stage: exam?.stage, scoping, team, dataRequests, workpapers, findings, reports, exitMeeting }),
    [exam?.stage, scoping, team, dataRequests, workpapers, findings, reports, exitMeeting],
  );

  const counts = useMemo(() => ({
    openFindings: findings.filter((f: any) => f.status !== 'closed').length,
    outstandingRequests: dataRequests.filter((r: any) => r.status !== 'received').length,
    workpapersPendingReview: workpapers.filter((w: any) => !w.reviewed_at).length,
    openRemediation: findings.filter(
      (f: any) => f.action && f.action.status !== 'completed' && f.action.status !== 'closed',
    ).length,
  }), [findings, dataRequests, workpapers]);

  /**
   * Marker of the examination record as currently displayed. Used only to flag
   * a stored advisory analysis as possibly outdated — never sent as facts.
   */
  const aiStaleness = useMemo(() => ({
    stage: exam?.stage ?? null,
    updated_at: (exam as any)?.updated_at ?? null,
    findings: findings.length,
    workpapers: workpapers.length,
    requests: dataRequests.length,
    reports: reports.length,
    counts,
  }), [exam, findings, workpapers, dataRequests, reports, counts]);

  const toggleAll = () => {
    const p = new URLSearchParams(params);
    if (showAll) p.delete('all'); else p.set('all', '1');
    setParams(p, { replace: true });
  };

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
    const p = { examinationId: exam.id, readOnly, mode: 'current-step' as const };
    switch (stepKey) {
      case 'team': return <TeamPanel {...p} />;
      case 'scoping': return <ScopingMemoPanel {...p} />;
      case 'data-requests': return <DataRequestsPanel {...p} />;
      case 'workpapers': return <WorkpapersPanel {...p} />;
      case 'exit-meeting': return <ExitMeetingPanel {...p} />;
      case 'reports': return <ReportsPanel {...p} />;
      default: return <FindingsPanel {...p} />;
    }
  };

  /** Sections mapped from tab value back to the workflow section key. */
  const SECTION_OF_TAB: Record<string, string> = {
    findings: 'findings',
    documents: 'reports',
    scoping: 'scoping',
    team: 'team',
    'data-requests': 'data-requests',
    workpapers: 'workpapers',
    'exit-meeting': 'exit-meeting',
  };

  const detourBanner = () => {
    if (!fromCurrent) return null;
    const key = SECTION_OF_TAB[section];
    if (!key) return null;
    const outstanding = guidance.transitionBlockers.filter(b => b.section === key);
    return (
      <ExaminationResolveBanner
        currentStepTitle={STEP_TITLES[stepKey]}
        cleared={outstanding.length === 0}
        clearedMessage="This prerequisite has been resolved."
        onReturn={goToCurrent}
      />
    );
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

        <Tabs value={section} onValueChange={setSection}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="current">Current step</TabsTrigger>
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="documents">Documents &amp; reports</TabsTrigger>
            <TabsTrigger value="ai-reports">AI analysis reports</TabsTrigger>
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

          {/* Advisory AI only — drafting and summarisation of recorded material.
              No scope, finding, rating or stage is changed from this tab. */}
          <TabsContent value="ai-reports" className="mt-4">
            <AiReportsTab
              description="Every AI-assisted analysis available for this examination, in one place. These reports interpret recorded material — they set no scope, finding, severity, rating or stage."
              blocks={[
                {
                  id: 'ai-exam-brief',
                  label: 'Preparation brief',
                  hint: 'background from the recorded supervisory history',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="examination_brief"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI examination preparation brief"
                      actionLabel="Generate brief"
                      description="Background summary drawn from the recorded supervisory history. It does not set the scope, risk rating or any finding."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-exam-scope',
                  label: 'Suggested focus areas',
                  hint: 'scoping suggestions for consideration',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="scope_suggestions"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI suggested focus areas"
                      actionLabel="Suggest focus areas"
                      description="Suggestions for consideration. The approved scope is entirely what the examiner records."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-exam-data-requests',
                  label: 'Suggested information requests',
                  hint: 'suggested items only, nothing is issued',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="data_request_suggestions"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI suggested information requests"
                      actionLabel="Suggest requests"
                      description="Suggested items only. Nothing is requested or issued until you create and send it yourself."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-exam-workpapers',
                  label: 'Workpaper summary',
                  hint: 'what the workpapers record',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="workpaper_summary"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI workpaper summary"
                      actionLabel="Summarise workpapers"
                      description="Summary of what the workpapers record. Review sign-off requirements are unchanged."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-exam-finding-draft',
                  label: 'Draft finding text',
                  hint: 'suggested wording, examiner remains the author',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="finding_draft"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI draft finding text"
                      actionLabel="Draft finding text"
                      description="Suggested wording based on recorded evidence. Copy it into a finding and edit it — the examiner remains the author."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-exam-finding-consistency',
                  label: 'Consistency review of findings',
                  hint: 'clarity, duplication and evidence linkage',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="finding_consistency"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI consistency review of findings"
                      actionLabel="Review findings"
                      description="Observations on clarity, duplication and evidence linkage. Severity, status and ratings are unchanged."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-exam-report-draft',
                  label: 'Draft report sections',
                  hint: 'narrative built from recorded findings and workpapers',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="report_draft"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI draft report sections"
                      actionLabel="Draft report sections"
                      description="Suggested narrative built only from recorded findings and workpapers. The report stays human-authored and human-approved."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
                {
                  id: 'ai-exam-management-response',
                  label: 'Review of management responses',
                  hint: 'whether responses address the findings',
                  node: (
                    <SupervisoryAiPanel
                      module="examination"
                      analysisType="management_response_review"
                      scopeId={exam.id}
                      label={exam.reference || exam.title || 'Examination'}
                      title="AI review of management responses"
                      actionLabel="Review responses"
                      description="Observations on whether responses address the findings. Accepting or rejecting a response remains a human decision."
                      stalenessFacts={aiStaleness}
                    />
                  ),
                },
              ]}
            />
          </TabsContent>


          {/* The stage lifecycle can only be advanced from the current step. */}
          <TabsContent value="current" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Current step: <span className="font-medium text-foreground">{STEP_TITLES[stepKey]}</span>
            </p>

            {deps.length > 0 && (
              <Card>
                <CardContent className="py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">This step depends on</p>
                  {deps.map((d, i) => (
                    <div key={`${d.key}-${i}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        {d.ok ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-warning" />
                        )}
                        <span className="font-medium">{d.title}</span>
                        <span className="text-muted-foreground text-xs">{d.detail}</span>
                      </span>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                        onClick={() => openSection(d.key, true)}>
                        Open {d.title.toLowerCase()}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <ExaminationStageActionsProvider value={stageActionsValue}>
              {currentStepPanel()}
            </ExaminationStageActionsProvider>
          </TabsContent>

          <TabsContent value="findings" className="mt-4 space-y-4">
            {detourBanner()}
            <FindingsPanel examinationId={exam.id} readOnly={readOnly} />


          </TabsContent>
          <TabsContent value="documents" className="mt-4 space-y-4">
            {detourBanner()}
            <ReportsPanel examinationId={exam.id} readOnly={readOnly} />


          </TabsContent>
          <TabsContent value="history" className="mt-4"><ExaminationTimeline examinationId={exam.id} /></TabsContent>

          {showAll && (
            <>
              <TabsContent value="scoping" className="mt-4 space-y-4">
                {detourBanner()}
                <ScopingMemoPanel examinationId={exam.id} readOnly={readOnly} />


              </TabsContent>
              <TabsContent value="team" className="mt-4">{detourBanner()}<TeamPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
              <TabsContent value="data-requests" className="mt-4 space-y-4">
                {detourBanner()}
                <DataRequestsPanel examinationId={exam.id} readOnly={readOnly} />


              </TabsContent>
              <TabsContent value="workpapers" className="mt-4 space-y-4">
                {detourBanner()}
                <WorkpapersPanel examinationId={exam.id} readOnly={readOnly} />


              </TabsContent>
              <TabsContent value="exit-meeting" className="mt-4">{detourBanner()}<ExitMeetingPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
            </>
          )}
        </Tabs>

      </div>
    </DashboardLayout>
  );
}
