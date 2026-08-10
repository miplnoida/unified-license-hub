import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  EXAMINATION_STAGES,
  stageLabel,
  useExamination,
  useTransitionExamination,
  type ExaminationStage,
} from '@/hooks/useExaminations';
import { ScopingMemoPanel } from '@/components/prudential/examination/ScopingMemoPanel';
import { TeamPanel } from '@/components/prudential/examination/TeamPanel';
import { DataRequestsPanel } from '@/components/prudential/examination/DataRequestsPanel';
import { WorkpapersPanel } from '@/components/prudential/examination/WorkpapersPanel';
import { ExitMeetingPanel } from '@/components/prudential/examination/ExitMeetingPanel';
import { ReportsPanel } from '@/components/prudential/examination/ReportsPanel';
import { FindingsPanel } from '@/components/prudential/examination/FindingsPanel';
import { ExaminationTimeline } from '@/components/prudential/examination/ExaminationTimeline';

const ORDER: ExaminationStage[] = EXAMINATION_STAGES.map(s => s.value);

export default function ExaminationWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { data: exam, isLoading } = useExamination(id);
  const transition = useTransitionExamination(id);

  const nextStage = useMemo(() => {
    if (!exam?.stage) return null;
    const idx = ORDER.indexOf(exam.stage as ExaminationStage);
    return idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  }, [exam?.stage]);

  const terminal = exam?.stage === 'closed' || exam?.stage === 'cancelled';
  const readOnly = !!terminal;

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
            <Badge variant="outline">{stageLabel(exam.stage)}</Badge>
          </div>
        </div>

        <Card>
          <CardContent className="py-4 overflow-x-auto">
            <ol className="flex items-center gap-2 min-w-max">
              {EXAMINATION_STAGES.map((s, i) => {
                const currentIdx = ORDER.indexOf(exam.stage as ExaminationStage);
                const done = currentIdx > i;
                const active = currentIdx === i;
                return (
                  <li key={s.value} className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs border ${
                      active ? 'bg-primary text-primary-foreground border-primary'
                        : done ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
                          : 'bg-muted text-muted-foreground'
                    }`}>{s.label}</span>
                    {i < EXAMINATION_STAGES.length - 1 && <span className="h-px w-4 bg-border" />}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Tabs defaultValue="scoping">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="scoping">Scoping</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="data-requests">Data requests</TabsTrigger>
            <TabsTrigger value="workpapers">Workpapers</TabsTrigger>
            <TabsTrigger value="exit-meeting">Exit meeting</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="findings">Findings &amp; CAP</TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>
          <TabsContent value="scoping" className="mt-4"><ScopingMemoPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
          <TabsContent value="team" className="mt-4"><TeamPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
          <TabsContent value="data-requests" className="mt-4"><DataRequestsPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
          <TabsContent value="workpapers" className="mt-4"><WorkpapersPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
          <TabsContent value="exit-meeting" className="mt-4"><ExitMeetingPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
          <TabsContent value="reports" className="mt-4"><ReportsPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
          <TabsContent value="findings" className="mt-4"><FindingsPanel examinationId={exam.id} readOnly={readOnly} /></TabsContent>
          <TabsContent value="audit" className="mt-4"><ExaminationTimeline examinationId={exam.id} /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
