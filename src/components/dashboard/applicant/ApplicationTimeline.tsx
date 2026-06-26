import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Circle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  status: string | null | undefined;
  applicationNumber?: string | null;
}

// Ordered milestones surfaced to applicants. Internal workflow IDs are never
// exposed — just the user-visible journey.
const STEPS = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'info_requested', label: 'More Info Requested' },
  { key: 'resubmitted', label: 'Resubmitted' },
  { key: 'decision', label: 'Decision' },
] as const;

function indexFor(status: string | null | undefined): { idx: number; outcome?: 'approved' | 'rejected' } {
  const s = (status || 'draft').toLowerCase();
  if (s === 'draft' || s === 'in_progress') return { idx: 0 };
  if (s === 'submitted') return { idx: 1 };
  if (['under_review', 'review', 'pending_review'].includes(s)) return { idx: 2 };
  if (['info_requested', 'query_raised', 'returned_for_correction'].includes(s)) return { idx: 3 };
  if (['resubmission_requested', 'resubmission_required'].includes(s)) return { idx: 4 };
  if (s === 'approved') return { idx: 5, outcome: 'approved' };
  if (['rejected', 'cancelled', 'withdrawn'].includes(s)) return { idx: 5, outcome: 'rejected' };
  return { idx: 0 };
}

export function ApplicationTimeline({ status, applicationNumber }: Props) {
  const { idx, outcome } = indexFor(status);

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Application timeline</h3>
          {applicationNumber && (
            <Badge variant="outline" className="font-mono text-[10px]">{applicationNumber}</Badge>
          )}
        </div>
        <ol className="relative border-l border-border ml-3 space-y-3">
          {STEPS.map((step, i) => {
            const done = i < idx;
            const current = i === idx;
            const label =
              step.key === 'decision'
                ? outcome === 'rejected' ? 'Rejected' : outcome === 'approved' ? 'Approved' : 'Decision'
                : step.label;
            return (
              <li key={step.key} className="ml-4">
                <span
                  className={cn(
                    'absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full border bg-background',
                    done && 'bg-primary border-primary text-primary-foreground',
                    current && 'border-primary text-primary',
                    !done && !current && 'border-muted-foreground/30 text-muted-foreground'
                  )}
                >
                  {done ? <Check className="h-3 w-3" /> : current ? <Clock className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
                </span>
                <p
                  className={cn(
                    'text-sm',
                    current && 'font-semibold text-foreground',
                    done && 'text-foreground',
                    !done && !current && 'text-muted-foreground'
                  )}
                >
                  {label}
                </p>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
