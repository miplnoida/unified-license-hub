import { Check } from 'lucide-react';
import { EXAMINATION_PHASES, stagePhase, type ExaminationPhase } from '@/lib/examinationWorkflow';
import { stageLabel } from '@/hooks/useExaminations';
import { Badge } from '@/components/ui/badge';

/**
 * Five business phases replace the long row of internal stage pills.
 * The exact internal stage stays visible as a caption for power users.
 */
export function ExaminationPhaseProgress({ stage }: { stage?: string | null }) {
  const cancelled = stage === 'cancelled';
  const current: ExaminationPhase | null = stagePhase(stage);
  const currentIdx = current ? EXAMINATION_PHASES.findIndex(p => p.value === current) : -1;

  return (
    <div className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-5" aria-label="Examination progress">
        {EXAMINATION_PHASES.map((p, i) => {
          const done = !cancelled && currentIdx > i;
          const active = !cancelled && currentIdx === i;
          return (
            <li
              key={p.value}
              aria-current={active ? 'step' : undefined}
              className={`rounded-md border px-3 py-2 ${
                active
                  ? 'border-primary bg-primary/10'
                  : done
                    ? 'border-emerald-200 bg-emerald-500/10'
                    : 'border-border bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {done && <Check className="h-3.5 w-3.5 text-emerald-700" />}
                <span className={`text-xs font-medium ${active ? 'text-primary' : done ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                  {p.label}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] leading-tight text-muted-foreground mt-0.5">{p.description}</p>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">
        {cancelled ? (
          <Badge variant="outline" className="bg-muted text-muted-foreground">Cancelled</Badge>
        ) : (
          <>Stage: <span className="font-medium text-foreground">{stageLabel(stage)}</span></>
        )}
      </p>
    </div>
  );
}

export default ExaminationPhaseProgress;
