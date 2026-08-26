/**
 * MC-07.3 / MC-07.5 — Conduct 360 information classification.
 *
 * Every card on the Conduct 360 view is tagged so a supervisor can tell recorded
 * regulatory data from a rule outcome, an AI suggestion, and a human decision.
 */
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { cn } from '@/lib/utils';

export type Classification = 'FACT' | 'RULE_OUTCOME' | 'AI_SUGGESTION' | 'HUMAN_DECISION';

interface ClassMeta {
  label: string;
  description: string;
  chip: string;
  active: boolean;
  note?: string;
}

export const CLASSIFICATIONS: Record<Classification, ClassMeta> = {
  FACT: {
    label: 'Fact',
    description: 'Recorded regulatory data, exactly as held in the register.',
    chip: 'bg-muted text-muted-foreground border-border',
    active: true,
  },
  RULE_OUTCOME: {
    label: 'Rule outcome',
    description: 'Produced by a published deterministic rule, with its threshold shown.',
    chip: 'bg-info/10 text-info border-info/30',
    active: true,
  },
  AI_SUGGESTION: {
    label: 'AI suggestion',
    description: 'Advisory narrative prepared as drafting help. Requires human review before it is relied on.',
    chip: 'bg-warning/10 text-warning-foreground border-warning/30',
    active: true,
  },
  HUMAN_DECISION: {
    label: 'Human decision',
    description: 'A decision recorded by an authorised supervisor, with their rationale.',
    chip: 'bg-success/10 text-success border-success/30',
    active: true,
  },
};

export function ClassificationChip({ type, className }: { type: Classification; className?: string }) {
  const meta = CLASSIFICATIONS[type];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        meta.chip,
        !meta.active && 'opacity-60',
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function ClassificationLegend() {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold">How to read this view</p>
        <p className="text-xs text-muted-foreground mt-1">
          Regulatory data and published rule outcomes are shown first. AI suggestions are separated below the facts and
          only carry weight once a supervisor has recorded a decision on them.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(CLASSIFICATIONS) as Classification[]).map((key) => {
            const meta = CLASSIFICATIONS[key];
            return (
              <div key={key} className={cn('rounded-md border p-3', !meta.active && 'opacity-70')}>
                <ClassificationChip type={key} />
                <p className="mt-2 text-xs text-muted-foreground">{meta.description}</p>
                {!meta.active && (
                  <p className="mt-1 text-xs font-medium text-muted-foreground">{meta.note}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
