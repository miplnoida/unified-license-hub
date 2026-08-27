import { AlertTriangle, ArrowRight, Check, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { stageLabel } from '@/hooks/useExaminations';
import {
  phaseLabel,
  stageGuidance,
  stagePhase,
  type BlockerSection,
  type Guidance,
} from '@/lib/examinationWorkflow';

/**
 * "Your next task" — answers: where am I, what do I do now, what is done,
 * what is blocking me. Derived entirely from data already loaded.
 */
export function NextActionCard({
  stage,
  guidance,
  currentStepTitle,
  onOpenCurrentStep,
  onOpenSection,
  readOnly,
}: {
  stage?: string | null;
  guidance: Guidance;
  currentStepTitle: string;
  onOpenCurrentStep: () => void;
  onOpenSection?: (section: BlockerSection) => void;
  readOnly?: boolean;
}) {

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">Your next task</CardTitle>
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
          {phaseLabel(stagePhase(stage))} · {stageLabel(stage)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium">Current step: {currentStepTitle}</p>
          {stageGuidance(stage) && (
            <p className="text-sm text-muted-foreground">{stageGuidance(stage)}</p>
          )}
        </div>

        {guidance.checklist.length > 0 && (
          <ul className="space-y-1.5">
            {guidance.checklist.map(item => (
              <li key={item.label} className="flex items-center gap-2 text-sm">
                {item.done ? (
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.label}</span>
              </li>
            ))}
          </ul>
        )}

        {[...guidance.blockers, ...guidance.transitionBlockers].length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
              <AlertTriangle className="h-4 w-4" />Blocking items
            </p>
            <ul className="space-y-1.5">
              {[...guidance.blockers, ...guidance.transitionBlockers].map(b => (
                <li key={b.text} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>{b.text}</span>
                  {b.section && onOpenSection && (
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" className="h-6 px-2 text-xs"
                      onClick={() => onOpenSection(b.section as BlockerSection)}>
                      Resolve
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}



        {!readOnly && (
          <Button size="sm" onClick={onOpenCurrentStep}>
            Go to {currentStepTitle.toLowerCase()}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default NextActionCard;
