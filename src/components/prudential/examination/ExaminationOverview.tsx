import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { CalendarDays, ClipboardList, FileWarning, Inbox, UserCheck } from 'lucide-react';
import type { BlockerSection, CapturedArea, Guidance } from '@/lib/examinationWorkflow';
import { NextActionCard } from './NextActionCard';
import { ExaminationPhaseProgress } from './ExaminationPhaseProgress';


const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string | number;
  tone?: 'warn' | 'ok';
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`text-xl font-semibold mt-1 ${tone === 'warn' ? 'text-warning' : tone === 'ok' ? 'text-emerald-600' : ''}`}>
        {value}
      </p>
    </div>
  );
}

export function ExaminationOverview({
  exam,
  guidance,
  currentStepTitle,
  onOpenCurrentStep,
  onOpenSection,
  captured = [],
  leadExaminer,
  counts,
  readOnly,
}: {
  exam: any;
  guidance: Guidance;
  currentStepTitle: string;
  onOpenCurrentStep: () => void;
  onOpenSection?: (section: BlockerSection) => void;
  captured?: CapturedArea[];
  leadExaminer?: string | null;
  counts: {
    openFindings: number;
    outstandingRequests: number;
    workpapersPendingReview: number;
    openRemediation: number;
  };
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4">
          <ExaminationPhaseProgress stage={exam.stage} />
        </CardContent>
      </Card>

      <NextActionCard
        stage={exam.stage}
        guidance={guidance}
        currentStepTitle={currentStepTitle}
        onOpenCurrentStep={onOpenCurrentStep}
        onOpenSection={onOpenSection}
        readOnly={readOnly}
      />


      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={FileWarning} label="Open findings" value={counts.openFindings}
          tone={counts.openFindings ? 'warn' : 'ok'} />
        <Metric icon={Inbox} label="Outstanding data requests" value={counts.outstandingRequests}
          tone={counts.outstandingRequests ? 'warn' : 'ok'} />
        <Metric icon={UserCheck} label="Workpapers awaiting review" value={counts.workpapersPendingReview}
          tone={counts.workpapersPendingReview ? 'warn' : 'ok'} />
        <Metric icon={ClipboardList} label="Open corrective actions" value={counts.openRemediation}
          tone={counts.openRemediation ? 'warn' : 'ok'} />
      </div>

      {captured.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">What has been captured so far</CardTitle>
            <p className="text-xs text-muted-foreground">
              A read-only summary of the information already recorded on this examination.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {captured.map(area => (
              <div key={area.key} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{area.title}</p>
                  {area.status && (
                    <Badge
                      variant="outline"
                      className={
                        area.tone === 'warn'
                          ? 'bg-warning/10 text-warning border-warning/20'
                          : area.tone === 'ok'
                            ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
                            : ''
                      }
                    >
                      {area.status}
                    </Badge>
                  )}
                </div>
                {area.lines.length > 0 ? (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {area.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
                )}
                {onOpenSection && (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => onOpenSection(area.key)}>
                    {readOnly ? 'View' : 'View / edit'}
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}



      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Examination details</CardTitle></CardHeader>
        <CardContent className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Entity</p>
            <p className="font-medium">{exam.licensee?.name || 'Unknown entity'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reference</p>
            <p className="font-mono text-xs">{exam.reference}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Examination type</p>
            <p className="capitalize">{String(exam.examination_type ?? '').replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Lead examiner</p>
            {leadExaminer ? (
              <p className="font-medium">{leadExaminer}</p>
            ) : (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Not assigned</Badge>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" />Fieldwork</p>
            <p>{fmt(exam.fieldwork_start)} → {fmt(exam.fieldwork_end)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Period under review</p>
            <p>{fmt(exam.period_under_review_start)} → {fmt(exam.period_under_review_end)}</p>
          </div>
        </CardContent>
        <Separator />
        <CardContent className="pt-3">
          <p className="text-xs text-muted-foreground">
            Created {exam.created_at ? new Date(exam.created_at).toLocaleString() : '—'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default ExaminationOverview;
